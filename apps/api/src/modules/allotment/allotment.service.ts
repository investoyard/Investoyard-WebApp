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
import {
  appNoBulkMax, bumpByte, cleanAppNo, isAppNoMode, memberAt, memberFor, normaliseEnds,
  padMember, rangeProblem, rangeSpan, SERIES_BATCH, SERIES_STATUS_LABEL, seriesParts,
  seriesProblem, seriesStatus, seriesWindow, type AppNoMode, type SeriesStatus,
} from '@investoyard/shared-types';

export const ALLOTMENT_TMP_DIR = join(UPLOAD_DIR, 'allotment-tmp');
const ARCHIVE_DIR = join(UPLOAD_DIR, 'allotment-archive');

/** DB rows are archived (gz NDJSON on disk) and purged this long after listing. */
const RETENTION_DAYS = 60;
const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const BATCH = 5000;
/** Pasted PANs per bulk search. 10,000 measured at 244 ms, so this is about a
    sensible response size rather than speed. */
const PAN_SUMMARY_MAX = 5000;
/** Rows a bulk application-number search may return.
    Exact cannot exceed its term count, but a PREFIX or a FRAGMENT can match
    many rows each - 'GROWW' alone matches 48 lakh - so without this a short
    prefix would pull millions of rows into one JSON response. Reported as
    `truncated` rather than silently cut, because a result that is quietly
    partial is worse than one that says so. */
const APP_NO_ROW_MAX = 20000;
/** Rows per purge statement. Bounded so a million-row delete is never ONE
    transaction; the subquery form means the old 32,767 bind-variable ceiling
    cannot be reached whatever this is set to. 20,000 ids measured at 161 ms,
    so 10,000 keeps each statement well inside a second. */
const PURGE_BATCH = 10000;
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

/**
 * What the allotment list can be filtered by — ONE shape, so the on-screen
 * search and the CSV export cannot drift into meaning different things. It is
 * named rather than inlined because three methods now take it.
 *
 * `appFrom`/`appTo` are a RANGE and `appNo`/`appNoMode` a single typed number;
 * they are mutually exclusive and the range wins. See `recordWhere`.
 */
export interface RecordFilter {
  ipoId: string;
  pan?: string;
  appNo?: string;
  appNoMode?: string;
  appFrom?: string;
  appTo?: string;
  amountOp?: string;
  amount?: number;
  amountField?: string;
  status?: string;
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

  /**
   * Serialise a job AND LET ITS FAILURE REACH THE CALLER.
   *
   * `enqueue` ends in a `.catch` that logs and swallows, which is right for a
   * background sweep and WRONG for anything whose result is reported back. It
   * is how `deleteIpoRecords` came to answer "Deleted 0 records and 2 import
   * rows": the purge threw on its first batch, the error went to a log that
   * `web.config` disables (`loggingEnabled="false"`), and the method carried
   * on to delete the import rows and report success.
   *
   * The chain is kept alive either way, so one failed job cannot wedge every
   * later import behind a rejected promise.
   */
  private enqueueResult<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
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
  /**
   * ONE filter builder for the list and its export — see `exportRecordsCsv`.
   *
   * APPLICATION NUMBER IS NEVER UPPERCASED, unlike PAN. 47,92,920 of JPL's
   * 1.60 crore rows contain a lowercase letter (every Groww value does), so
   * folding case would fail to match nearly 48 lakh rows while looking like a
   * perfectly ordinary empty result.
   */
  private recordWhere(q: RecordFilter) {
    const where: any = { ipoId: q.ipoId };
    const pan = (q.pan ?? '').trim().toUpperCase();
    if (pan) where.pan = { startsWith: pan };

    /* A RANGE AND A TYPED NUMBER ARE MUTUALLY EXCLUSIVE, range first: they both
       constrain the same column, and ANDing them would answer a question the
       operator did not ask. The UI only ever sends one. */
    const from = cleanAppNo(q.appFrom);
    const to = cleanAppNo(q.appTo);
    if (from || to) {
      const problem = rangeProblem(from, to);
      if (problem) throw new BadRequestException(problem);
      /* THE MATCH MODE APPLIES TO A RANGE TOO (operator, 2026-11-02): every
         number in the range is a NEEDLE and each stored number the HAYSTACK.
         One builder, so the table, its CSV and the series export cannot
         disagree about what the mode meant. */
      this.applyRangeFilter(where, from, to, isAppNoMode(q.appNoMode) ? q.appNoMode : 'exact');
    } else {
      const appNo = cleanAppNo(q.appNo);
      if (appNo) {
        const mode: AppNoMode = isAppNoMode(q.appNoMode) ? q.appNoMode : 'exact';
        where.applicationNo =
          mode === 'exact' ? appNo
            : mode === 'prefix' ? { startsWith: appNo }
              /* The only mode that cannot use the index: a parallel seq scan,
                 2.3 s on JPL today and slower with every file. Offered because
                 the operator asked for it, never used by the bulk path above
                 its own cap. */
              : { contains: appNo };
      }
    }
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

  /**
   * The range's two ends, RESOLVED - re-padded to the width the file actually
   * uses when the operator wrote the numbers without their leading zeros.
   *
   * ONE resolver for the table, its CSV and the series export. Resolving it in
   * the export alone would put 20,000 rows on screen and the right 728 in the
   * file, which is the disagreement the single filter builder exists to stop.
   *
   * THE TEST IS 'IS THERE ANYTHING AT THE WIDTH TYPED', and it needs raw SQL
   * for the length filter. The obvious test - did the window match nothing -
   * is useless here: a string window at width 9 also admits 13-character
   * values whose first 9 characters fall inside it, so it always matches
   * something (measured: UPJPL0001..UPJPL1000 returns 20,000 rows of width
   * 13), and the re-padding would never fire.
   *
   * Skipped for a digits-only series: the prefix is empty, so there is nothing
   * to anchor a width lookup on, and `LIKE '%'` would scan the whole table.
   * `AllotmentRecord` carries no RLS policy, so no tenant GUC is involved.
   */
  private async resolveRangeEnds(ipoId: string, fromRaw?: string, toRaw?: string) {
    const from = cleanAppNo(fromRaw);
    const to = cleanAppNo(toRaw);
    const plain = { from, to, normalised: false };
    if (!from && !to) return plain;

    const problem = rangeProblem(from, to);
    if (problem) throw new BadRequestException(problem);

    const p = seriesParts(from, to);
    if (!p || !p.prefix) return plain;

    const atWidth = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT count(*) AS c
        FROM "AllotmentRecord"
       WHERE "ipoId" = ${ipoId}
         AND "applicationNo" >= ${from}
         AND "applicationNo" <= ${to}
         AND length("applicationNo") = ${p.width}`;
    if (atWidth.length && Number(atWidth[0].c) > 0) return plain;

    const stored = await this.seriesStoredWidth(ipoId, p.prefix);
    const re = stored != null ? normaliseEnds(p, stored) : null;
    return re ? { from: re.from, to: re.to, normalised: true } : plain;
  }

  async searchRecords(q: RecordFilter & { page?: number }) {
    const pageSize = 50;
    const page = Math.max(1, q.page ?? 1);
    const ends = await this.resolveRangeEnds(q.ipoId, q.appFrom, q.appTo);
    const where = this.recordWhere({ ...q, appFrom: ends.from, appTo: ends.to });
    /* A RANGE READS IN SERIES ORDER, "start to end" as the operator asked.
       Everything else keeps insertion order, which is what it has always
       shown. Sorting by applicationNo is free for a range: it is the order of
       the index the range already scans. */
    const ranged = !!ends.from || !!ends.to;
    const orderBy = ranged
      ? ({ applicationNo: 'asc' } as const)
      : ({ id: 'asc' } as const);
    const [total, rows] = await Promise.all([
      this.prisma.allotmentRecord.count({ where }),
      this.prisma.allotmentRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    /* How many numbers the range COVERS, so the screen can say "8,240 of
       10,000" and a gap is visible without listing it. Null when it cannot be
       stated honestly — a Groww hex tail has no count. */
    const span = ranged ? rangeSpan(ends.from, ends.to) : null;
    return {
      total, page, pageSize, rangeSpan: span,
      /* What the range was actually read as, so the screen can say it was
         re-padded rather than leaving the operator to wonder. */
      rangeFrom: ends.from || undefined,
      rangeTo: ends.to || undefined,
      rangeNormalised: ends.normalised,
      rows: rows.map(moneyToNumber),
    };
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
    q: RecordFilter,
    write: (chunk: string) => unknown,
  ): Promise<number> {
    const ends = await this.resolveRangeEnds(q.ipoId, q.appFrom, q.appTo);
    const where = this.recordWhere({ ...q, appFrom: ends.from, appTo: ends.to });
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    write('Application No,PAN,Name,DP/Client ID,Category,TM Name,Applied Shares,Amount,Allotted Shares,Allotted Amount,Refund Amount,Reason\n');
    /* A RANGE STREAMS IN SERIES ORDER AND CURSORS ON applicationNo, not on
       `id`. Ordering by one column while paging on another silently repeats and
       skips rows; and because the range is already an index scan on
       (ipoId, applicationNo), advancing its lower bound keeps the whole export
       inside that one index. Everything else keeps the `id` cursor it has
       always used. */
    const rangeMode: AppNoMode = isAppNoMode(q.appNoMode) ? q.appNoMode : 'exact';
    const rangeTo = ends.to;
    /* PREFIX carries an OPEN upper bound and exact a CLOSED one, so the
       cursor has to advance against the right one or it re-reads and skips.
       CONTAINS has no bound at all - its filter is an OR of terms - so it
       keeps the `id` cursor it has always used. */
    const rangeStop = rangeMode === 'prefix' ? bumpByte(rangeTo) : null;
    const upper = rangeStop ? { lt: rangeStop } : { lte: rangeTo };
    const ranged = (!!ends.from || !!ends.to)
      && rangeMode !== 'contains'
      && (rangeMode !== 'prefix' || rangeStop !== null);
    let cursor: number | undefined;
    let afterAppNo: string | undefined;
    let sent = 0;
    for (;;) {
      const batch = await this.prisma.allotmentRecord.findMany({
        where: ranged && afterAppNo !== undefined
          ? { ...where, applicationNo: { gt: afterAppNo, ...upper } }
          : where,
        orderBy: ranged ? { applicationNo: 'asc' } : { id: 'asc' },
        take: 5000,
        ...(!ranged && cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      write(batch.map((r) => [
        r.applicationNo, r.pan, r.name, r.dpClientId, r.category, r.tmName,
        r.appliedShares, r.amount, r.allottedShares, r.allottedAmount, r.refundAmount, r.reason,
      ].map(esc).join(',')).join('\n') + '\n');
      sent += batch.length;
      const last = batch[batch.length - 1];
      cursor = last.id;
      afterAppNo = last.applicationNo;
      if (batch.length < 5000) break;
    }
    return sent;
  }

  /**
   * The MOST COMMON stored width for a series, so a list written without the
   * leading zeros can be re-padded to what the file actually holds.
   *
   * Only ever called when the typed window matched NOTHING, which is the
   * signal that the width is wrong — so it costs nothing in the normal case.
   * Skipped for a digits-only series, where the prefix is empty and `LIKE '%'`
   * is a full scan of 1.6 crore rows to answer a question nobody asked.
   *
   * Raw SQL because `length()` is not expressible in a Prisma filter.
   * `AllotmentRecord` carries no RLS policy (`setup-rls.sql` names six tables
   * and this is not one), so no tenant GUC is involved.
   */
  private async seriesStoredWidth(ipoId: string, prefix: string): Promise<number | null> {
    if (!prefix) return null;
    const rows = await this.prisma.$queryRaw<{ len: number }[]>`
      SELECT length("applicationNo")::int AS len
        FROM "AllotmentRecord"
       WHERE "ipoId" = ${ipoId}
         AND "applicationNo" LIKE ${prefix + '%'}
       GROUP BY 1
       ORDER BY count(*) DESC
       LIMIT 1`;
    return rows.length ? Number(rows[0].len) : null;
  }

  /** What one series export found, reported at the top of the file. */
  private seriesCounts() {
    return { members: 0, full: 0, partial: 0, missing: 0, rows: 0, truncated: false };
  }

  /**
   * ONE LINE PER APPLICATION NUMBER IN THE RANGE — the reconciliation the
   * operator asked for, not a second opinion about the rows on screen.
   *
   * The table above answers "what is between these two numbers"; this answers
   * "which of my numbers are in the file, which are not, and where the file
   * holds a longer number under the same opening digits, which one matched".
   * So a member with no match still gets a line, which is the only way a gap
   * is visible without counting.
   *
   * ENUMERATED IN BATCHES, never member by member and never all at once.
   * `SERIES_BATCH` members become ONE index window, the rows that come back
   * are attributed by a fixed-length slice, and the batch is then written in
   * member order — so memory is bounded by one batch and the file reads in
   * series order. A query per member would be a million round trips; one query
   * for the whole span would hold every matching row in memory.
   *
   * CONTEXT AT THE TOP, TALLY AT THE BOTTOM, and that split is forced rather
   * than chosen: what the range IS can be written before a single row is read,
   * while the match counts are only known once every batch has been. Buffering
   * a million lines to put the counts first is not an option, so they close the
   * file instead. Both blocks are labelled, so neither reads as data.
   */
  async exportSeriesCsv(
    q: { ipoId: string; from?: string; to?: string; mode?: string },
    write: (chunk: string) => unknown,
  ) {
    const ipo = await this.prisma.ipo.findUnique({
      where: { id: q.ipoId }, select: { symbol: true, name: true },
    });
    if (!ipo) throw new NotFoundException('IPO not found.');

    const mode: AppNoMode = isAppNoMode(q.mode) ? q.mode : 'exact';
    /* Refused BEFORE anything runs, with the figure that caused it named - a
       span of a crore is not something to discover from a stalled download. */
    const problem = seriesProblem(q.from, q.to, mode);
    if (problem) throw new BadRequestException(problem);

    let parts = seriesParts(q.from, q.to);
    if (!parts) throw new BadRequestException('This range is not a series that can be listed.');

    /* THE SAME RESOLVER THE TABLE USES, so a short-typed range reads as the
       same two ends on the screen and in the file. */
    const ends = await this.resolveRangeEnds(q.ipoId, q.from, q.to);
    if (ends.normalised) {
      const next = seriesParts(ends.from, ends.to);
      if (next) parts = next;
    }
    const normalisedFrom = ends.normalised ? ends.from : null;

    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const n = this.seriesCounts();
    n.members = parts.span;

    /* Buffered, because the stats are only known at the end and they belong at
       the top. One batch's lines at a time, never the whole file. */
    const body: string[] = [];

    const MODE_LABEL: Record<AppNoMode, string> = {
      exact: 'Exact', prefix: 'Starts with', contains: 'Contains',
    };
    const ctx: [string, string][] = [
      ['IPO', `${ipo.symbol}${ipo.name ? ' - ' + ipo.name : ''}`],
      ['Series from', padMember(parts.prefix, parts.from, parts.tailWidth)],
      ['Series to', padMember(parts.prefix, parts.to, parts.tailWidth)],
      ['Application numbers in series', String(parts.span)],
      ['Match mode', MODE_LABEL[mode]],
    ];
    if (normalisedFrom != null) {
      ctx.push(['Note', 'The range as typed matched nothing at its own width, so both ends were'
        + ' re-padded to the width this file uses.']);
    }
    for (const [k, v] of ctx) write(`${esc(k)},${esc(v)}\n`);
    write('\n');
    write('Application no,Matched application no,Status,PAN,Name,DP/Client ID,Category,TM Name,'
      + 'Applied Shares,Amount,Allotted Shares,Allotted Amount,Refund Amount,Reason\n');

    const select = {
      applicationNo: true, pan: true, name: true, dpClientId: true, category: true, tmName: true,
      appliedShares: true, amount: true, allottedShares: true, allottedAmount: true,
      refundAmount: true, reason: true,
    } as const;
    type Rec = { applicationNo: string } & Record<string, unknown>;

    const line = (member: string, r: Rec | null) => {
      const status: SeriesStatus = r ? seriesStatus(r.applicationNo, member) : 'missing';
      if (status === 'full') n.full++;
      else if (status === 'partial') n.partial++;
      else n.missing++;
      if (r) n.rows++;
      body.push([
        member,
        r ? r.applicationNo : '',
        SERIES_STATUS_LABEL[status],
        r ? r.pan : '', r ? r.name : '', r ? r.dpClientId : '', r ? r.category : '', r ? r.tmName : '',
        r ? r.appliedShares : '', r ? r.amount : '', r ? r.allottedShares : '',
        r ? r.allottedAmount : '', r ? r.refundAmount : '', r ? r.reason : '',
      ].map(esc).join(','));
    };

    for (let start = 0; start < parts.span; start += SERIES_BATCH) {
      const count = Math.min(SERIES_BATCH, parts.span - start);
      const lo = parts.from + BigInt(start);
      const hi = lo + BigInt(count - 1);

      let found: Rec[];
      if (mode === 'contains') {
        /* No index to use, so this is one scan with the terms OR'd together -
           which is why `seriesProblem` caps it at a handful of numbers. */
        const terms: string[] = [];
        for (let i = 0; i < count; i++) terms.push(padMember(parts.prefix, lo + BigInt(i), parts.tailWidth));
        found = await this.prisma.allotmentRecord.findMany({
          where: { ipoId: q.ipoId, OR: terms.map((t) => ({ applicationNo: { contains: t } })) },
          select, take: APP_NO_ROW_MAX + 1, orderBy: { applicationNo: 'asc' },
        }) as Rec[];
      } else {
        const w = seriesWindow(parts, mode, lo, hi)!;
        found = await this.prisma.allotmentRecord.findMany({
          where: { ipoId: q.ipoId, applicationNo: this.windowFilter(w) },
          select, take: APP_NO_ROW_MAX + 1, orderBy: { applicationNo: 'asc' },
        }) as Rec[];
      }
      if (found.length > APP_NO_ROW_MAX) { n.truncated = true; found.length = APP_NO_ROW_MAX; }

      /* Attribution: a fixed-length slice for exact and prefix, a scan over the
         handful of terms for contains. NOT members x rows - that is the
         quadratic shape already fixed once in the bulk search. */
      const byMember = new Map<string, Rec[]>();
      for (const r of found) {
        let member: string | null = null;
        if (mode === 'contains') {
          for (let i = 0; i < count && member === null; i++) {
            const t = padMember(parts.prefix, lo + BigInt(i), parts.tailWidth);
            if (r.applicationNo.includes(t)) member = t;
          }
        } else {
          member = memberFor(r.applicationNo, parts);
        }
        if (member === null) continue;
        const list = byMember.get(member);
        if (list) list.push(r); else byMember.set(member, [r]);
      }

      for (let i = 0; i < count; i++) {
        const member = padMember(parts.prefix, lo + BigInt(i), parts.tailWidth);
        const rows = byMember.get(member);
        if (!rows || rows.length === 0) line(member, null);
        else for (const r of rows) line(member, r);
      }

      write(body.join('\n') + '\n');
      body.length = 0;
    }

    /* `missing` counts MEMBERS with no match; full and partial count LINES,
       because one member can match several rows under prefix or contains. So
       the two are labelled differently rather than being summed. */
    write('\n');
    const tally: [string, string][] = [
      ['Application numbers matched', String(parts.span - n.missing)],
      ['Application numbers not found', String(n.missing)],
      ['Rows - matched (full)', String(n.full)],
      ['Rows - matched (partial)', String(n.partial)],
      ['Rows written', String(n.rows)],
    ];
    if (n.truncated) {
      tally.push(['Note', 'One batch matched more rows than this export returns, so some are'
        + ' missing from the file. Narrow the range, or use Exact.']);
    }
    for (const [k, v] of tally) write(`${esc(k)},${esc(v)}\n`);

    return {
      symbol: ipo.symbol,
      name: ipo.name,
      mode,
      from: padMember(parts.prefix, parts.from, parts.tailWidth),
      to: padMember(parts.prefix, parts.to, parts.tailWidth),
      normalised: normalisedFrom != null,
      ...n,
    };
  }

  /** A `SeriesWindow` as a Prisma filter. `lt` is absent unless prefix mode set it. */
  private windowFilter(w: { gte: string; lte?: string; lt?: string }) {
    if (w.lt !== undefined) return { gte: w.gte, lt: w.lt };
    if (w.lte !== undefined) return { gte: w.gte, lte: w.lte };
    return { gte: w.gte };
  }

  /**
   * The application-number RANGE as a filter, in the mode the operator chose.
   *
   * Each number in the range is a NEEDLE and each stored number the HAYSTACK:
   * exact means the stored number IS it, prefix means the stored number begins
   * with it, contains means it appears anywhere inside.
   *
   * PREFIX COLLAPSES TO ONE RANGE and that is the whole reason it is as cheap
   * as exact: the members are contiguous and the same width and the collation
   * is C, so `>= first AND < bumpByte(last)` is the union of all of them -
   * checked against the OR of 1,000 `startsWith` and identical, 2 ms against
   * 92 ms. It needs no decimal tail either, so it works on a Groww id.
   *
   * CONTAINS cannot collapse, so it becomes an OR of its terms and is capped at
   * a handful of numbers by `seriesProblem`.
   */
  private applyRangeFilter(where: any, from: string, to: string, mode: AppNoMode) {
    if (mode === 'prefix') {
      const stop = bumpByte(to);
      where.applicationNo = stop ? { gte: from, lt: stop } : { gte: from };
      return;
    }
    if (mode === 'contains') {
      const problem = seriesProblem(from, to, mode);
      if (problem) throw new BadRequestException(problem);
      const p = seriesParts(from, to)!;
      const terms: string[] = [];
      for (let i = 0; i < p.span; i++) terms.push(memberAt(p, i));
      where.OR = terms.map((t) => ({ applicationNo: { contains: t } }));
      return;
    }
    /* Inside one fixed-width series text order IS numeric order, so this is
       exact - and it resolves to an Index Scan on (ipoId, applicationNo),
       measured at 0.036 ms against 1.60 crore rows. */
    where.applicationNo = { gte: from, lte: to };
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
   * Delete matching records in SLICES, never one giant transaction - a
   * million-row delete held in one is the same mistake that forces the PARSER
   * into its own process. Shared by both destructive paths so they cannot
   * drift, and the `where` is a narrow union rather than a Prisma input type:
   * these are the ONLY two scopes a delete may ever have, and spelling them
   * out stops a looser filter reaching a bulk delete by accident.
   *
   * NO `id IN (...)` LIST, AND THAT IS THE FIX RATHER THAN A SMALLER NUMBER.
   * This was `findMany({ take: 50000 })` then `deleteMany({ id: { in: ids } })`,
   * which throws on the FIRST batch:
   *
   *     too many bind variables in prepared statement,
   *     expected maximum of 32767, received 50000
   *
   * The ceiling is 32,767, not the 65,535 a reading of the wire protocol
   * suggests. Tuning 50,000 down would have worked and left the same class of
   * bug one data-growth step away; a subquery sends TWO parameters whatever the
   * batch size, so the limit stops being reachable at all. It also drops the
   * separate `findMany`, halving the round trips.
   *
   * INHERITED, NOT INTRODUCED: this is the archive-purge loop, extracted here
   * on 2026-10-27. So `doArchive` has had the same defect since it was written
   * — it had simply never run (0 AllotmentArchive rows), and `retentionSweep`
   * fires it automatically 60 days after listing. It would have archived an
   * IPO to gz, failed to purge, and left the database unbounded while
   * reporting success, which is the exact thing that feature exists to stop.
   * Two IPOs already hold more than 32,767 records.
   *
   * The SQL strings are literals and only values are parameters — the column is
   * chosen by branch, never interpolated. `AllotmentRecord` carries no RLS
   * policy (`setup-rls.sql` scopes six other tables), so a raw statement here
   * needs no tenant GUC.
   */
  private async purgeRecords(where: { ipoId: string } | { importId: string }): Promise<number> {
    const byIpo = 'ipoId' in where;
    const value = byIpo ? where.ipoId : where.importId;
    const sql = byIpo
      ? 'DELETE FROM "AllotmentRecord" WHERE id IN (SELECT id FROM "AllotmentRecord" WHERE "ipoId" = $1 LIMIT $2)'
      : 'DELETE FROM "AllotmentRecord" WHERE id IN (SELECT id FROM "AllotmentRecord" WHERE "importId" = $1 LIMIT $2)';
    let gone = 0;
    for (;;) {
      const n = await this.prisma.$executeRawUnsafe(sql, value, PURGE_BATCH);
      if (n === 0) return gone;
      gone += n;
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
    /* enqueueResult, not enqueue: if the purge fails the caller must hear
       about it rather than be told 0 rows were deleted. */
    const deleted = await this.enqueueResult(() => this.purgeRecords({ importId: id }));
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
    /* THE PURGE FIRST, AND THE IMPORT ROWS ONLY IF IT SUCCEEDS. Reversed, a
       failed purge still destroyed the import history and left 1,419,960
       records orphaned with nothing left to describe them — which is exactly
       what happened on 2026-10-28. enqueueResult rethrows, so this line is
       never reached on failure. */
    const deleted = await this.enqueueResult(() => this.purgeRecords({ ipoId }));
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

  /**
   * Bulk lookup by APPLICATION NUMBER — flat, one row per number.
   *
   * NO PIVOT, and that is the whole difference from `panSummary`. A PAN can
   * hold several applications in one issue (the worst in the data is 18), which
   * is why that report has to spread each record across the line. An
   * application number is UNIQUE per issue — `@@unique([ipoId, applicationNo])`
   * — so one number is one row and there is nothing to spread.
   *
   * ROWS COME BACK IN THE ORDER THEY WERE PASTED, so the result lines up with
   * the column the operator copied from, and not-found numbers are listed
   * separately rather than being silently absent.
   *
   * Scoped to one IPO, like the PAN search: an application number is only
   * unique within an issue, so a cross-issue search could return two different
   * applications under one heading.
   *
   * THE CAP DEPENDS ON THE MODE and the gap is three orders of magnitude.
   * `exact` and `prefix` resolve to index ranges and answer in milliseconds;
   * `contains` is one parallel seq scan with the terms OR'd together, measured
   * on JPL at a 2.3 s floor plus ~280 ms per extra term. See
   * `APP_NO_BULK_CONTAINS_MAX` for the numbers and for why a regex alternation
   * is not the way out.
   */
  async appNoSummary(ipoId: string, rawList: string[], modeRaw?: string) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId }, select: { symbol: true, name: true } });
    if (!ipo) throw new NotFoundException('IPO not found.');
    const mode: AppNoMode = isAppNoMode(modeRaw) ? modeRaw : 'exact';

    /* Dedupe, preserving the pasted order. Case is NOT touched — see
       `recordWhere`. */
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const raw of rawList) {
      const t = cleanAppNo(raw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      terms.push(t);
    }
    if (terms.length === 0) throw new BadRequestException('Paste at least one application number.');

    const max = appNoBulkMax(mode);
    if (terms.length > max) {
      throw new BadRequestException(
        `${terms.length.toLocaleString('en-IN')} application numbers pasted — the limit for `
        + `“${mode === 'contains' ? 'Contains' : mode === 'prefix' ? 'Starts with' : 'Exact'}” is `
        + `${max.toLocaleString('en-IN')} per search.`
        + (mode === 'contains'
          ? ' Contains cannot use the index, so each extra number adds about a third of a second to one full scan.'
            + ' Use Exact or Starts with for a long list.'
          : ' Split the list.'),
      );
    }

    const select = {
      applicationNo: true, pan: true, name: true, category: true, tmName: true,
      appliedShares: true, amount: true, allottedShares: true, allottedAmount: true,
      refundAmount: true, reason: true,
    } as const;

    /* ONE query for every term rather than one per term. For exact that is an
       `IN` the index serves; for the other two it is an OR list, which for
       `contains` means a single scan instead of N of them. */
    const found = mode === 'exact'
      ? await this.prisma.allotmentRecord.findMany({ where: { ipoId, applicationNo: { in: terms } }, select })
      : await this.prisma.allotmentRecord.findMany({
        where: {
          ipoId,
          OR: terms.map((t) => ({
            applicationNo: mode === 'prefix' ? { startsWith: t } : { contains: t },
          })),
        },
        select,
        /* One over the cap, so the caller can tell "exactly at the cap" from
           "there were more". */
        take: APP_NO_ROW_MAX + 1,
        orderBy: { applicationNo: 'asc' },
      });

    const toRow = (r: typeof found[number]) => ({
      applicationNo: r.applicationNo,
      pan: r.pan,
      name: r.name ?? null,
      bidCatg: r.category ?? null,
      tmName: r.tmName ?? null,
      sharesApplied: r.appliedShares,
      amountPaid: Number(r.amount),
      sharesAllotted: r.allottedShares,
      amountAllotted: Number(r.allottedAmount),
      amountRefunded: Number(r.refundAmount),
      applnStatus: AllotmentService.applnStatus(r),
      reasonForRejection: (r.reason ?? '').trim() || null,
      /* WHICH PASTED TERM BROUGHT THIS ROW BACK. Under exact it is the number
         itself, but a prefix or a fragment can return rows that do not look
         like what was typed, and then the operator needs to see why. */
      matchedTerm: '',
    });

    const rows: ReturnType<typeof toRow>[] = [];
    const hit = new Set<string>();

    if (mode === 'exact') {
      const byNo = new Map(found.map((r) => [r.applicationNo, r]));
      for (const t of terms) {
        const r = byNo.get(t);
        if (!r) continue;
        hit.add(t);
        rows.push({ ...toRow(r), matchedTerm: t });
      }
    } else {
      /* A prefix or a fragment can match many rows, and two terms can match the
         same row, so each row is attributed to the FIRST term in pasted order
         that explains it and appears once.
         `where` is the index of each term, so "first in pasted order" is a
         comparison rather than a scan. */
      const where = new Map(terms.map((t, i) => [t, i]));

      if (mode === 'prefix') {
        /* NOT terms x rows. That is quadratic, and prefix allows 5,000 terms:
           against 5,000 found rows it is 25 million startsWith calls, and
           against short prefixes matching thousands of rows each it is far
           worse. A prefix match is a fixed-length slice, and a pasted list has
           only a handful of distinct LENGTHS — so look the slice up instead. */
        const lengths = [...new Set(terms.map((t) => t.length))];
        for (const r of found) {
          let best: string | null = null;
          for (const len of lengths) {
            const cand = r.applicationNo.slice(0, len);
            if (cand.length !== len) continue;
            const idx = where.get(cand);
            if (idx === undefined) continue;
            if (best === null || idx < (where.get(best) as number)) best = cand;
          }
          if (best === null) continue;
          hit.add(best);
          rows.push({ ...toRow(r), matchedTerm: best });
        }
      } else {
        /* `contains` has nowhere to look a slice up from, so this stays a scan
           — bounded by APP_NO_BULK_CONTAINS_MAX terms, which is why that cap
           is 25 and not 5,000. */
        for (const r of found) {
          let best: string | null = null;
          for (const t of terms) {
            if (!r.applicationNo.includes(t)) continue;
            if (best === null || (where.get(t) as number) < (where.get(best) as number)) best = t;
          }
          if (best === null) continue;
          hit.add(best);
          rows.push({ ...toRow(r), matchedTerm: best });
        }
      }

      /* Pasted order for the OUTPUT too, so a prefix result reads in the order
         the operator's column did rather than in whatever order the database
         returned; application number breaks a tie inside one term. */
      rows.sort((a, b) =>
        (where.get(a.matchedTerm) as number) - (where.get(b.matchedTerm) as number)
        || a.applicationNo.localeCompare(b.applicationNo));
    }

    const truncated = rows.length > APP_NO_ROW_MAX;
    if (truncated) rows.length = APP_NO_ROW_MAX;

    return {
      symbol: ipo.symbol,
      name: ipo.name,
      mode,
      requested: terms.length,
      /* More rows matched than are being returned. Only reachable from prefix
         or contains, where one term can match many rows. */
      truncated,
      rowMax: APP_NO_ROW_MAX,
      /* Pasted, valid, and this registrar file has no row for it. Frequently
         the answer the operator actually wants. */
      notFound: terms.filter((t) => !hit.has(t)),
      rows,
    };
  }

  /**
   * The same rows as CSV, from the SAME builder — a download is what the screen
   * showed rather than a second opinion about it, the rule `recordWhere` and
   * `panSummaryCsv` already follow.
   *
   * Headers are the REGISTRAR'S OWN column names, which is what the operator
   * reads; each was confirmed verbatim against the header row stored on
   * `AllotmentImport.headers`.
   */
  async appNoSummaryCsv(ipoId: string, rawList: string[], mode?: string) {
    const res = await this.appNoSummary(ipoId, rawList, mode);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = [
      'APPLICATION_NO', 'PAN', 'NAME', 'BID_CATG', 'BID_BROKER', 'SHARES_APPLIED',
      'AMOUNT_PAID', 'SHARES_ALLOTED', 'AMOUNT_ALLOTED', 'AMOUNT_REFUND',
      'APPLN_STATUS', 'REASON_FOR_REJECTION',
    ];
    /* The term column only earns its place when a row need not look like what
       was typed. Under exact it would repeat APPLICATION_NO on every line. */
    if (res.mode !== 'exact') head.push('SEARCHED_FOR');

    const lines = [head.join(',')];
    for (const r of res.rows) {
      const cells: unknown[] = [
        r.applicationNo, r.pan, r.name, r.bidCatg, r.tmName, r.sharesApplied,
        r.amountPaid, r.sharesAllotted, r.amountAllotted, r.amountRefunded,
        r.applnStatus, r.reasonForRejection,
      ];
      if (res.mode !== 'exact') cells.push(r.matchedTerm);
      lines.push(cells.map(esc).join(','));
    }
    /* Not-found numbers ride along rather than being dropped from the file. */
    for (const t of res.notFound) {
      const cells: unknown[] = [t, ...Array(head.length - (res.mode === 'exact' ? 1 : 2)).fill('')];
      if (res.mode !== 'exact') cells.push(t);
      lines.push(cells.map(esc).join(','));
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
