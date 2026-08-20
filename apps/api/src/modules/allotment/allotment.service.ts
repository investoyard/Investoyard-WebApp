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

/** normalized row — same tuple the parser worker emits, one JSON array per line */
type Row = [string, string, string, string, string, number, number, number, number, number, string];

const toRecord = (ipoId: string, r: Row) => ({
  ipoId,
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
      const totalRows = await this.runWorker(filePath, ndjsonPath, (n) => patch({ totalRows: n }));
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
        batch.push(toRecord(ipoId, row));
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

  /** spawn the parser worker (own 4 GB heap); resolves with the row count */
  private runWorker(inPath: string, outPath: string, onProgress: (rows: number) => unknown): Promise<number> {
    return new Promise((resolve, reject) => {
      const worker = join(__dirname, 'parse-allotment.worker.js');
      const child = spawn(process.execPath, ['--max-old-space-size=4096', worker, inPath, outPath], { stdio: ['ignore', 'pipe', 'pipe'] });
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

  listImports(ipoId?: string) {
    return this.prisma.allotmentImport.findMany({
      where: ipoId ? { ipoId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
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
  async searchRecords(q: {
    ipoId: string; pan?: string; amountOp?: string; amount?: number;
    amountField?: string; status?: string; page?: number;
  }) {
    const pageSize = 50;
    const page = Math.max(1, q.page ?? 1);
    const where: any = { ipoId: q.ipoId };
    const pan = (q.pan ?? '').trim().toUpperCase();
    if (pan) where.pan = { startsWith: pan };
    if (q.amount != null && Number.isFinite(q.amount) && q.amount >= 0) {
      const field = q.amountField === 'allotted' ? 'allottedAmount' : 'amount';
      const op = q.amountOp === '>' ? 'gt' : q.amountOp === '<' ? 'lt' : 'equals';
      where[field] = { [op]: Math.round(q.amount) };
    }
    if (q.status === 'allotted') where.allottedShares = { gt: 0 };
    else if (q.status === 'not_allotted') where.allottedShares = 0;
    const [total, rows] = await Promise.all([
      this.prisma.allotmentRecord.count({ where }),
      this.prisma.allotmentRecord.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, rows };
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
            r.appliedShares, r.amount, r.allottedShares, r.allottedAmount, r.refundAmount, r.reason ?? ''];
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
    // purge in slices so we never hold a single giant delete transaction
    for (;;) {
      const slice: { id: number }[] = await this.prisma.allotmentRecord.findMany({ where: { ipoId }, select: { id: true }, take: 50000 });
      if (slice.length === 0) break;
      await this.prisma.allotmentRecord.deleteMany({ where: { id: { in: slice.map((s) => s.id) } } });
    }
    this.log.log(`archived ${rows} allotment rows of ${symbol} → ${fileName}`);
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
        batch.push(toRecord(ipoId, JSON.parse(line) as Row));
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
