import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { createGunzip, createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createInterface } from 'readline';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { ApplicationsService } from '../applications/applications.service';
import { UPLOAD_DIR } from '../upload/upload.module';

export const ALLOTMENT_TMP_DIR = join(UPLOAD_DIR, 'allotment-tmp');
const ARCHIVE_DIR = join(UPLOAD_DIR, 'allotment-archive');

/** DB rows are archived (gz NDJSON on disk) and purged this long after listing. */
const RETENTION_DAYS = 60;
const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const BATCH = 5000;
/** Pasted PANs per bulk search. 10,000 measured at 244 ms, so this is about a
    sensible response size rather than speed. */
const PAN_SUMMARY_MAX = 5000;
/** The registrar's own three outcomes, in the operator's reading order. */
export type PanStatus = 'ALLOTTED' | 'NOT ALLOTTED' | 'REJECTED';
/** One application under one PAN, named as the registrar names its columns. */
export interface PanSummaryRecord {
  applicationNo: string;
  bidCatg: string | null;
  sharesApplied: number;
  amountPaid: number;
  sharesAllotted: number;
  applnStatus: PanStatus;
  reasonForRejection: string | null;
}

/** normalized row — same tuple the parser worker emits, one JSON array per line */
/* `tmName` is APPENDED (index 11), never inserted, so an archive written before
   2026-10-13 still restores — its rows are 11 long and `r[11]` is undefined,
   which `|| null` turns into a null column rather than a crash. */
type Row = [string, string, string, string, string, number, number, number, number, number, string, string?];

const toRecord = (ipoId: string, importId: string | null, r: Row) => ({
  ipoId,
  importId,
  applicationNo: r[0],
  pan: r[1],
  dpClientId: r[2] || null,
  category: r[3] || null,
  name: r[4] || null,
  appliedShares: r[5],
  amount: r[6],
  allottedShares: r[7],
  allottedAmount: r[8],
  refundAmount: r[9],
  reason: r[10] || null,
  tmName: r[11] || null,
});

/**
 * THE MONEY COLUMNS ARE BigInt, AND A BigInt DOES NOT SURVIVE JSON.stringify —
 * it throws "Do not know how to serialize a BigInt", so a raw record reaching a
 * JSON response or the NDJSON archive would 500 rather than render wrong.
 *
 * Converting to a number is EXACT: a double holds every integer up to 2^53,
 * which is ₹9,00,71,992 crore, and it keeps the API shape numeric so no client
 * changes. The column is wide for the same reason the conversion is safe —
 * INT4's ₹214.75 Cr is smaller than one QIB bid, 2^53 is larger than any issue
 * that will ever exist.
 *
 * ONLY TWO SITES NEED THIS AND THEY ARE NAMED HERE RATHER THAN LEFT TO BE
 * REDISCOVERED: searchRecords, which returns raw rows, and doArchive, which
 * JSON.stringifies the row tuple. The CSV export is already safe because esc
 * calls String(), which a BigInt answers correctly; the matching sweep and the
 * consumer allotment checker read only the Int share columns.
 */
const moneyToNumber = <T extends { amount: bigint | number; allottedAmount: bigint | number; refundAmount: bigint | number }>(r: T) => ({
  ...r,
  amount: Number(r.amount),
  allottedAmount: Number(r.allottedAmount),
  refundAmount: Number(r.refundAmount),
});

/**
 * Registrar allotment imports (Admin → Allotment). The heavy lifting — parsing a
 * ~90 MB / 1M-row DBF or XLSB — runs in a spawned worker process so the API event
 * loop and heap are never touched; the service only streams the worker's NDJSON
 * into Postgres in batches, then auto-matches OUR applications by PAN. Jobs run
 * strictly one at a time (a promise chain) — a second upload queues behind the first.
 */
@Injectable()
export class AllotmentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Allotment');
  private chain: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private apps: ApplicationsService,
  ) {}

  onModuleInit() {
    for (const dir of [ALLOTMENT_TMP_DIR, ARCHIVE_DIR]) if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.timer = setInterval(() => this.enqueue(() => this.retentionSweep()), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** serialize heavy jobs — imports/archives never overlap (one 3-4 GB worker max) */
  private enqueue(job: () => Promise<void>) {
    this.chain = this.chain.then(job).catch((e) => this.log.warn(`job failed: ${e?.message ?? e}`));
    return this.chain;
  }

  // ── imports ────────────────────────────────────────────────────────────────

  async startImport(ipoId: string, file: { path: string; originalname: string; size: number }) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { id: true } });
    if (!ipo) { try { unlinkSync(file.path); } catch { /* ignore */ } throw new NotFoundException('IPO not found.'); }
    const format = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const imp = await this.prisma.allotmentImport.create({
      data: { ipoId, fileName: file.originalname, fileSize: file.size, format, status: 'processing', stage: 'queued' },
    });
    this.enqueue(() => this.process(imp.id, ipoId, file.path));
    return imp;
  }

  private async process(importId: string, ipoId: string, filePath: string) {
    const ndjsonPath = `${filePath}.ndjson`;
    const patch = (data: Record<string, unknown>) =>
      this.prisma.allotmentImport.update({ where: { id: importId }, data }).catch(() => undefined);
    try {
      await patch({ stage: 'parsing' });
      const totalRows = await this.runWorker(
        filePath,
        ndjsonPath,
        (n) => patch({ totalRows: n }),
        (headers) => patch({ headers }),
      );
      await patch({ stage: 'importing', totalRows });

      let imported = 0;
      let allotted = 0;
      let batch: ReturnType<typeof toRecord>[] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        const res = await this.prisma.allotmentRecord.createMany({ data: batch, skipDuplicates: true });
        imported += res.count;
        batch = [];
        await patch({ imported });
      };
      const rl = createInterface({ input: createReadStream(ndjsonPath), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        const row = JSON.parse(line) as Row;
        if (row[7] > 0) allotted++;
        batch.push(toRecord(ipoId, importId, row));
        if (batch.length >= BATCH) await flush();
      }
      await flush();

      await patch({ stage: 'matching', allotted });
      const matched = await this.matchOurApplications(ipoId);

      await patch({ status: 'done', stage: null, imported, allotted, matched, finishedAt: new Date() });
      this.log.log(`import ${importId}: ${imported}/${totalRows} rows, ${allotted} allottees, ${matched} of our applications updated`);
    } catch (e: any) {
      this.log.error(`import ${importId} failed: ${e?.message ?? e}`);
      await patch({ status: 'failed', stage: null, error: String(e?.message ?? e).slice(0, 500), finishedAt: new Date() });
    } finally {
      for (const p of [filePath, ndjsonPath]) { try { unlinkSync(p); } catch { /* ignore */ } }
    }
  }

  /** spawn the parser worker (own 6 GB heap); resolves with the row count */
  private runWorker(
    inPath: string,
    outPath: string,
    onProgress: (rows: number) => unknown,
    onHeaders?: (headers: string[]) => unknown,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const worker = join(__dirname, 'parse-allotment.worker.js');
      /* 6 GB, raised from 4 with the upload limit on 2026-10-13. A 1M-row XLSB
         needs ~3 GB and the limit went 105 -> 126 MB, so 4 GB would have left
         the largest permitted file failing INSIDE the parser — after the whole
         upload — instead of being refused at the door. The box has 24 GB with
         ~14 GB free and this process is short-lived. */
      const child = spawn(process.execPath, ['--max-old-space-size=6144', worker, inPath, outPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let done = -1;
      let stderr = '';
      let out = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        let nl: number;
        while ((nl = out.indexOf('\n')) >= 0) {
          const line = out.slice(0, nl).trim();
          out = out.slice(nl + 1);
          if (line.startsWith('P ')) onProgress(Number(line.slice(2)) || 0);
          else if (line.startsWith('DONE ')) done = Number(line.slice(5)) || 0;
          /* The file's own header row. Never fatal: a malformed one costs us a
             diagnostic, not the import, so it is swallowed rather than thrown. */
          else if (line.startsWith('H ') && onHeaders) {
            try { onHeaders(JSON.parse(line.slice(2))); } catch { /* ignore */ }
          }
        }
      });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && done >= 0) resolve(done);
        else reject(new Error(`File could not be parsed${stderr ? `: ${stderr.slice(0, 300)}` : ` (exit ${code})`}`));
      });
    });
  }

  /**
   * Match registrar rows to OUR applications by PAN (application number when we
   * have one) and record the outcome through the standard allotment path —
   * refund math, status event, push notification, and the registrar's rejection
   * reason. Skips applications already recorded with the same result, so
   * re-uploads and FILE1..FILEn don't double-notify.
   */
  private async matchOurApplications(ipoId: string): Promise<number> {
    const apps = await tenantContext.runUnscoped(() =>
      this.prisma.application.findMany({
        where: { ipoId, status: { notIn: ['draft', 'failed', 'rejected'] } },
        select: {
          id: true, lots: true, applicantType: true, applicationNumber: true,
          allottedAt: true, allottedLots: true,
          profile: { select: { panTokenRef: true } },
          ipo: { select: { lotSize: true } },
        },
      }),
    );
    let matched = 0;
    for (const app of apps) {
      // A print whose client profile has been cleared has no PAN to match on —
      // skip it exactly as an unreadable token is skipped below.
      if (!app.profile) continue;
      let pan = '';
      try { pan = (await this.vault.resolve(app.profile.panTokenRef)).trim().toUpperCase(); } catch { continue; }
      if (!pan) continue;
      const recs: any[] = await this.prisma.allotmentRecord.findMany({ where: { ipoId, pan }, take: 10 });
      if (recs.length === 0) continue;
      // prefer an exact application-number match, then the matching quota bucket
      const wantSha = app.applicantType === 'shareholder';
      const rec =
        (app.applicationNumber && recs.find((r) => r.applicationNo === app.applicationNumber)) ||
        recs.find((r) => (r.category ?? '').startsWith('SHA') === wantSha) ||
        recs[0];
      const lot = app.ipo?.lotSize ?? 0;
      let lots = lot > 0 ? Math.round(rec.allottedShares / lot) : 0;
      lots = Math.max(0, Math.min(lots, app.lots));
      if (app.allottedAt && app.allottedLots === lots) continue; // already recorded — don't re-notify
      const reason = lots > 0 ? undefined : (rec.reason ?? undefined);
      try {
        await this.apps.recordAllotment(app.id, lots, reason);
        matched++;
      } catch (e: any) {
        this.log.warn(`match ${app.id}: ${e?.message ?? e}`);
      }
    }
    return matched;
  }

  // ── queries (admin) ────────────────────────────────────────────────────────

  /**
   * Each import, plus HOW MANY OF ITS ROWS CAN ACTUALLY BE DELETED.
   *
   * `trackedRows` exists so the UI can disable the per-file delete instead of
   * letting it 400. Every row imported before 2026-10-27 carries no importId,
   * so on the day per-file delete shipped it refused on ALL THREE existing
   * imports - a button that could only fail, which is the thing this codebase
   * says is worse than no button, and I had cited that rule elsewhere while
   * breaking it here.
   *
   * ONE groupBy rather than a count per row: this list is 50 imports and a
   * query each would be 50 round trips to render a table.
   */
  async listImports(ipoId?: string) {
    const imports = await this.prisma.allotmentImport.findMany({
      where: ipoId ? { ipoId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (imports.length === 0) return [];
    const counts = await this.prisma.allotmentRecord.groupBy({
      by: ['importId'],
      where: { importId: { in: imports.map((i) => i.id) } },
      _count: { _all: true },
    });
    const tracked = new Map(counts.map((c) => [c.importId as string, c._count._all]));
    return imports.map((i) => ({ ...i, trackedRows: tracked.get(i.id) ?? 0 }));
  }

  async getImport(id: string) {
    const imp = await this.prisma.allotmentImport.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('Import not found.');
    return imp;
  }

  async summary(ipoId: string) {
    const [total, allotted, archive, lastImport] = await Promise.all([
      this.prisma.allotmentRecord.count({ where: { ipoId } }),
      this.prisma.allotmentRecord.count({ where: { ipoId, allottedShares: { gt: 0 } } }),
      this.prisma.allotmentArchive.findUnique({ where: { ipoId } }),
      this.prisma.allotmentImport.findFirst({ where: { ipoId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { total, allotted, notAllotted: total - allotted, archive, lastImport };
  }

  /** Allotment-list search: partial PAN + amount with a > / < / = operator. */
  /** ONE filter builder for the list and its export — see `exportRecordsCsv`. */
  private recordWhere(q: { ipoId: string; pan?: string; amountOp?: string; amount?: number; amountField?: string; status?: string }) {
    const where: any = { ipoId: q.ipoId };
    const pan = (q.pan ?? '').trim().toUpperCase();
    if (pan) where.pan = { startsWith: pan };
    if (q.amount != null && Number.isFinite(q.amount) && q.amount >= 0) {
      const field = q.amountField === 'allotted' ? 'allottedAmount' : 'amount';
      const op = q.amountOp === '>' ? 'gt' : q.amountOp === '<' ? 'lt' : 'equals';
      /* A BigInt column. Prisma coerces a number, but be explicit. */
      where[field] = { [op]: BigInt(Math.round(q.amount)) };
    }
    if (q.status === 'allotted') where.allottedShares = { gt: 0 };
    else if (q.status === 'not_allotted') where.allottedShares = 0;
    return where;
  }

  async searchRecords(q: {
    ipoId: string; pan?: string; amountOp?: string; amount?: number;
    amountField?: string; status?: string; page?: number;
  }) {
    const pageSize = 50;
    const page = Math.max(1, q.page ?? 1);
    const where = this.recordWhere(q);
    const [total, rows] = await Promise.all([
      this.prisma.allotmentRecord.count({ where }),
      this.prisma.allotmentRecord.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, rows: rows.map(moneyToNumber) };
  }

  /**
   * Stream the matching records out as CSV, for the list page's Export button.
   *
   * CURSORED IN BATCHES, never a single findMany. The table holds 2.26 lakh rows
   * today and a 1M-row IPO is ordinary, so materialising a result set — or
   * building a real .xlsx workbook, which has to be held whole in memory — is
   * the same mistake that forces the PARSER into its own process. CSV streams in
   * constant memory and Excel opens it natively.
   *
   * Takes the SAME filter object as `searchRecords`, so what you export is what
   * you are looking at. Two renderers of one filter would eventually disagree.
   */
  async exportRecordsCsv(
    q: { ipoId: string; pan?: string; amountOp?: string; amount?: number; amountField?: string; status?: string },
    write: (chunk: string) => unknown,
  ): Promise<number> {
    const where = this.recordWhere(q);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    write('Application No,PAN,Name,DP/Client ID,Category,TM Name,Applied Shares,Amount,Allotted Shares,Allotted Amount,Refund Amount,Reason\n');
    let cursor: number | undefined;
    let sent = 0;
    for (;;) {
      const batch = await this.prisma.allotmentRecord.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 5000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      write(batch.map((r) => [
        r.applicationNo, r.pan, r.name, r.dpClientId, r.category, r.tmName,
        r.appliedShares, r.amount, r.allottedShares, r.allottedAmount, r.refundAmount, r.reason,
      ].map(esc).join(',')).join('\n') + '\n');
      sent += batch.length;
      cursor = batch[batch.length - 1].id;
      if (batch.length < 5000) break;
    }
    return sent;
  }

  // ── archive / restore / retention ──────────────────────────────────────────

  /** Export an IPO's records to gz NDJSON on disk, then purge them from the DB. */
  async archiveIpo(ipoId: string) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { symbol: true } });
    if (!ipo) throw new NotFoundException('IPO not found.');
    const count = await this.prisma.allotmentRecord.count({ where: { ipoId } });
    if (count === 0) throw new BadRequestException('No allotment records in the DB for this IPO.');
    await this.enqueue(() => this.doArchive(ipoId, ipo.symbol));
    return this.prisma.allotmentArchive.findUnique({ where: { ipoId } });
  }

  private async doArchive(ipoId: string, symbol: string) {
    const fileName = `${symbol}-allotment.ndjson.gz`;
    const filePath = join(ARCHIVE_DIR, fileName);
    const prisma = this.prisma;
    let rows = 0;
    async function* lines() {
      let cursor: number | undefined;
      for (;;) {
        const page: any[] = await prisma.allotmentRecord.findMany({
          where: { ipoId },
          orderBy: { id: 'asc' },
          take: 20000,
          ...(cursor != null ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (page.length === 0) return;
        cursor = page[page.length - 1].id;
        for (const r of page) {
          rows++;
          const row: Row = [r.applicationNo, r.pan, r.dpClientId ?? '', r.category ?? '', r.name ?? '',
            r.appliedShares, Number(r.amount), r.allottedShares, Number(r.allottedAmount),
            Number(r.refundAmount), r.reason ?? ''];
          yield JSON.stringify(row) + '\n';
        }
      }
    }
    await pipeline(Readable.from(lines()), createGzip(), createWriteStream(filePath));
    const fileSize = statSync(filePath).size;
    await this.prisma.allotmentArchive.upsert({
      where: { ipoId },
      create: { ipoId, fileName, rows, fileSize },
      update: { fileName, rows, fileSize, createdAt: new Date() },
    });
    await this.purgeRecords({ ipoId });
    this.log.log(`archived ${rows} allotment rows of ${symbol} → ${fileName}`);
  }

  /**
   * Delete matching records in SLICES, never one giant transaction.
   *
   * Extracted from the archive purge so the two destructive paths cannot drift:
   * a million-row delete held in one transaction is the same mistake that
   * forces the PARSER into its own process.
   *
   * The `where` is deliberately a narrow union rather than a Prisma input type:
   * these are the ONLY two scopes a delete may ever have, and spelling them out
   * stops a looser filter reaching a bulk delete by accident.
   */
  private async purgeRecords(where: { ipoId: string } | { importId: string }): Promise<number> {
    let gone = 0;
    for (;;) {
      const slice: { id: number }[] =
        await this.prisma.allotmentRecord.findMany({ where, select: { id: true }, take: 50000 });
      if (slice.length === 0) return gone;
      const res = await this.prisma.allotmentRecord.deleteMany({ where: { id: { in: slice.map((s) => s.id) } } });
      gone += res.count;
    }
  }

  /**
   * Delete ONE uploaded file: its rows, then the import row itself.
   *
   * TWO THINGS IT DELIBERATELY DOES NOT TOUCH (operator's call, 2026-10-27):
   *
   *  - MATCHED APPLICATIONS. The import also writes our own Application rows
   *    (status allotted / not_allotted, allottedLots, allotmentReason) and
   *    notifies the investor. Reverting an investor who has already been told
   *    they were allotted is worse than leaving the record; re-uploading
   *    re-runs the matching anyway.
   *  - THE GZ ARCHIVE. Once an IPO is archived and purged, that file is the
   *    ONLY remaining copy, so deleting it here would make the operation
   *    unrecoverable with nothing to restore from.
   *
   * IT REFUSES when the import predates per-file tracking and its rows are
   * therefore unattributable (importId null on all of them). Removing the
   * record of a million-row import while the rows stay in the table is the
   * half-action that leaves somebody confused later; the message names the
   * per-IPO delete instead.
   */
  async deleteImport(id: string) {
    const imp = await this.prisma.allotmentImport.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('Import not found.');
    if (imp.status === 'processing') {
      throw new BadRequestException('That import is still running. Wait for it to finish or fail, then delete it.');
    }
    /* The closure pattern restoreIpo already uses: enqueue returns void, so
       the count comes back through a captured variable. */
    let deleted = 0;
    await this.enqueue(async () => { deleted = await this.purgeRecords({ importId: id }); });
    if (deleted === 0 && imp.imported > 0) {
      throw new BadRequestException(
        `This file was imported before per-file tracking (2026-10-27), so its ${imp.imported.toLocaleString('en-IN')} rows `
        + 'cannot be told apart from the other files for this IPO. Use "Delete all allotment data for this IPO" instead.',
      );
    }
    await this.prisma.allotmentImport.delete({ where: { id } });
    return { deleted, fileName: imp.fileName, matchedApplicationsLeftAlone: imp.matched };
  }

  /**
   * Delete EVERY allotment row for an IPO, plus all of its import rows.
   *
   * The catch-all, and the only thing that reaches rows imported before
   * per-file tracking. Same two exclusions as `deleteImport`: matched
   * applications and the gz archive are left alone.
   */
  async deleteIpoRecords(ipoId: string) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { symbol: true } });
    if (!ipo) throw new NotFoundException('IPO not found.');
    const running = await this.prisma.allotmentImport.count({ where: { ipoId, status: 'processing' } });
    if (running > 0) throw new BadRequestException('An import for this IPO is still running. Wait for it to finish, then delete.');
    let deleted = 0;
    await this.enqueue(async () => { deleted = await this.purgeRecords({ ipoId }); });
    const imports = await this.prisma.allotmentImport.deleteMany({ where: { ipoId } });
    this.log.log(`deleted ${deleted} allotment rows and ${imports.count} import rows for ${ipo.symbol}`);
    return { deleted, imports: imports.count, symbol: ipo.symbol };
  }

  /**
   * THE REGISTRAR'S THREE OUTCOMES, derived from the two columns that carry
   * them. Measured across 1.6M rows and the split is clean: allotted rows
   * NEVER carry a reason, so the three are mutually exclusive and exhaustive
   * (379,339 / 930,694 / 336,479).
   *
   * THE FILE ALSO STATES `APPLN_STATUS` IN ITS OWN COLUMN AND WE DISCARD IT —
   * `parse-allotment.worker.ts` reads it only as a fallback for files with no
   * shares-allotted column. So this is OUR word, not the document's, which is
   * weaker than this codebase normally accepts. Operator's call (2026-10-28):
   * derive it, because the derivation works on all 1.6M existing rows today
   * while capturing the column would only fill rows imported afterwards.
   * Storing it verbatim is the better answer the day a re-import is cheap.
   */
  private static applnStatus(r: { allottedShares: number; reason?: string | null }): PanStatus {
    if (r.allottedShares > 0) return 'ALLOTTED';
    return (r.reason ?? '').trim() ? 'REJECTED' : 'NOT ALLOTTED';
  }

  /** Allotted first, then not-allotted, then rejected — the operator's order. */
  private static readonly STATUS_RANK: Record<PanStatus, number> = {
    ALLOTTED: 0, 'NOT ALLOTTED': 1, REJECTED: 2,
  };

  /**
   * Bulk PAN lookup, pivoted to ONE LINE PER PAN.
   *
   * A PAN can hold several records in one issue — the worst in the data is 18,
   * all not-allotted across EMP and IND — so each record contributes its own
   * block of the registrar's own columns rather than being summed away
   * (operator's call: summing would hide which application was which).
   * `maxRecords` tells the caller how wide the table has to be.
   *
   * EXACT match on PAN, not the `startsWith` the single-PAN search uses: a
   * pasted list is a list of whole PANs, and a prefix match would silently pull
   * in strangers' records under somebody else's heading.
   *
   * SCOPED TO ONE IPO (operator's call). 18,840 PANs appear in more than one
   * issue, and putting two issues on one line would make Applied and Allotted
   * figures that belong to different offers read as one total.
   *
   * Measured: 10,000 PANs against JPL's 1.42M rows in 244 ms, because
   * `@@index([ipoId, pan])` already exists. The cap is about a sensible
   * response size rather than speed.
   */
  async panSummary(ipoId: string, rawPans: string[]) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { symbol: true, name: true } });
    if (!ipo) throw new NotFoundException('IPO not found.');

    /* Dedupe and validate before touching the database. An invalid PAN is
       REPORTED rather than dropped: a typo in a pasted column is the single
       likeliest reason a PAN "is not in the file". */
    const seen = new Set<string>();
    const pans: string[] = [];
    const invalid: string[] = [];
    for (const raw of rawPans) {
      const pan = String(raw ?? '').trim().toUpperCase();
      if (!pan) continue;
      if (seen.has(pan)) continue;
      seen.add(pan);
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) { invalid.push(pan); continue; }
      pans.push(pan);
    }
    if (pans.length === 0 && invalid.length === 0) throw new BadRequestException('Paste at least one PAN.');
    if (pans.length > PAN_SUMMARY_MAX) {
      throw new BadRequestException(
        `${pans.length.toLocaleString('en-IN')} PANs pasted — the limit is ${PAN_SUMMARY_MAX.toLocaleString('en-IN')} per search. Split the list.`,
      );
    }

    const found = pans.length
      ? await this.prisma.allotmentRecord.findMany({
        where: { ipoId, pan: { in: pans } },
        select: {
          pan: true, applicationNo: true, category: true, appliedShares: true,
          amount: true, allottedShares: true, reason: true,
        },
      })
      : [];

    const byPan = new Map<string, PanSummaryRecord[]>();
    for (const r of found) {
      const rec: PanSummaryRecord = {
        applicationNo: r.applicationNo,
        bidCatg: r.category ?? null,
        sharesApplied: r.appliedShares,
        amountPaid: Number(r.amount),
        sharesAllotted: r.allottedShares,
        applnStatus: AllotmentService.applnStatus(r),
        reasonForRejection: (r.reason ?? '').trim() || null,
      };
      const list = byPan.get(r.pan) ?? [];
      list.push(rec);
      byPan.set(r.pan, list);
    }

    /* Order inside a PAN: group rank, then application number, so two
       identical requests cannot come back in different orders. */
    for (const list of byPan.values()) {
      list.sort((a, b) =>
        AllotmentService.STATUS_RANK[a.applnStatus] - AllotmentService.STATUS_RANK[b.applnStatus]
        || a.applicationNo.localeCompare(b.applicationNo, undefined, { numeric: true }));
    }

    /* PANs in the order they were pasted, so the result lines up with the
       column the operator copied from. */
    const rows = pans.filter((p) => byPan.has(p)).map((pan) => {
      const records = byPan.get(pan)!;
      const counts = { allotted: 0, notAllotted: 0, rejected: 0 };
      for (const r of records) {
        if (r.applnStatus === 'ALLOTTED') counts.allotted++;
        else if (r.applnStatus === 'REJECTED') counts.rejected++;
        else counts.notAllotted++;
      }
      return { pan, records, counts };
    });

    return {
      symbol: ipo.symbol,
      name: ipo.name,
      requested: pans.length,
      invalid,
      /* Valid, but this registrar file has no row for them. Often the answer
         the operator actually wants, and it would otherwise just be absent. */
      notFound: pans.filter((p) => !byPan.has(p)),
      maxRecords: rows.reduce((m, r) => Math.max(m, r.records.length), 0),
      rows,
    };
  }

  /**
   * The same pivot as CSV, from the SAME builder — so a download is what the
   * screen showed rather than a second opinion about it, the rule the record
   * export already follows with `recordWhere`.
   *
   * Headers use the REGISTRAR'S OWN column names, which is what the operator
   * reads: every one of the seven was confirmed verbatim against the header
   * row stored on `AllotmentImport.headers`.
   */
  async panSummaryCsv(ipoId: string, rawPans: string[]) {
    const res = await this.panSummary(ipoId, rawPans);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const per = ['APPLICATION_NO', 'BID_CATG', 'SHARES_APPLIED', 'AMOUNT_PAID', 'SHARES_ALLOTED', 'APPLN_STATUS', 'REASON_FOR_REJECTION'];
    const width = Math.max(1, res.maxRecords);
    const head = ['PAN'];
    for (let i = 1; i <= width; i++) for (const c of per) head.push(width === 1 ? c : `${c}_${i}`);
    const lines = [head.join(',')];
    for (const row of res.rows) {
      const cells: unknown[] = [row.pan];
      for (let i = 0; i < width; i++) {
        const r = row.records[i];
        cells.push(
          r?.applicationNo ?? '', r?.bidCatg ?? '', r?.sharesApplied ?? '', r?.amountPaid ?? '',
          r?.sharesAllotted ?? '', r?.applnStatus ?? '', r?.reasonForRejection ?? '',
        );
      }
      lines.push(cells.map(esc).join(','));
    }
    /* Not-found PANs ride along rather than being dropped from the file. */
    for (const pan of res.notFound) {
      lines.push([pan, ...Array(width * per.length).fill('')].map(esc).join(','));
    }
    return { symbol: res.symbol, csv: lines.join('\n') + '\n', rows: res.rows.length, notFound: res.notFound.length };
  }

  /** Re-import an archived IPO's records from the gz file, then drop the archive. */
  async restoreIpo(ipoId: string) {
    const archive = await this.prisma.allotmentArchive.findUnique({ where: { ipoId } });
    if (!archive) throw new NotFoundException('No archive for this IPO.');
    const filePath = join(ARCHIVE_DIR, archive.fileName);
    if (!existsSync(filePath)) throw new NotFoundException('Archive file is missing from disk.');
    let restored = 0;
    await this.enqueue(async () => {
      const gunzip = createGunzip();
      const rl = createInterface({ input: createReadStream(filePath).pipe(gunzip), crlfDelay: Infinity });
      let batch: ReturnType<typeof toRecord>[] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        const res = await this.prisma.allotmentRecord.createMany({ data: batch, skipDuplicates: true });
        restored += res.count;
        batch = [];
      };
      for await (const line of rl) {
        if (!line) continue;
        /* null: the archive format carries no importId, so a restored row is
           only ever removable by the per-IPO delete. */
        batch.push(toRecord(ipoId, null, JSON.parse(line) as Row));
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      await this.prisma.allotmentArchive.delete({ where: { ipoId } });
      try { unlinkSync(filePath); } catch { /* ignore */ }
      this.log.log(`restored ${restored} allotment rows for IPO ${ipoId}`);
    });
    return { restored };
  }

  /** Auto-archive IPOs whose listing is older than the retention window. */
  private async retentionSweep() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const withRecords = await this.prisma.allotmentRecord.groupBy({ by: ['ipoId'] });
    for (const { ipoId } of withRecords) {
      const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { symbol: true, listingDate: true } });
      if (!ipo?.listingDate || ipo.listingDate > cutoff) continue;
      this.log.log(`retention: archiving ${ipo.symbol} (listed ${ipo.listingDate.toISOString().slice(0, 10)})`);
      await this.doArchive(ipoId, ipo.symbol).catch((e) => this.log.warn(`retention archive ${ipo.symbol}: ${e?.message ?? e}`));
    }
  }
}
