import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, OnModuleInit, Post, Query, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';

/**
 * GMP + issue-detail feed.
 *
 * The operator was already taking these numbers by hand — the stored GMP for
 * PRIORITY (₹37 / 18.5%) is character-for-character the upstream figure — so
 * this automates an existing practice rather than starting a new one. It stays
 * OFF until an operator links each IPO, and the manual `/gmp/entry` path
 * remains the fallback and always wins.
 *
 * Two rules the rest of this file exists to keep:
 *
 *   1. FILL, NEVER OVERWRITE. Dates, lot size, issue size and price are
 *      written only where our record is empty. Operator data comes from the
 *      RHP; a third-party summary must never quietly replace it.
 *   2. LINK ONCE, THEN BY ID. Name matching is fuzzy, and hanging the wrong
 *      company's GMP on an IPO is worse than showing none. A match is
 *      suggested, an operator confirms it, and every later poll uses the id.
 */

/** report 331 = the GMP table. Path is /page/month/year/FY/0/category. */
const FEED_HOST = 'https://webnodejs.investorgain.com';
const REPORT = '331';
const TICK_MS = 30 * 60_000;

interface FeedRow {
  id: string;
  name: string;
  gmp: number | null;
  gmpPct: number | null;
  /** the day-range the feed shows beside the premium */
  gmpLow: number | null;
  gmpHigh: number | null;
  /** Upcoming | Open | Closing today | Closed | Listing pending | Listed */
  status: string;
  price: string | null;
  lot: number | null;
  sizeCr: number | null;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  category: string;
}

/** The feed writes rupees as `&#8377;` and ampersands as `&amp;`. Decode once. */
const decode = (v: unknown): string => String(v ?? '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ');

/** tags out, entities decoded, whitespace collapsed */
const text = (v: unknown): string => decode(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** "&#8377;125.00 Cr" → 125 */
const num = (v: unknown): number | null => {
  const m = text(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/**
 * The GMP cell, which is the only place the real premium appears.
 *
 *   ₹<b>50</b> (60.98%)<br><small><b>46 ↓ / 63 ↑</b></small>
 *
 * `~max_gmp1` looks like the obvious field and is NOT the premium — it is the
 * day's HIGH. Measured across a full page: it equalled the high on every row
 * where the two differed, and never equalled the shown value alone. It agreed
 * with the shown GMP on 8 of 23 rows, purely because the premium happened to be
 * at its high, which is how reading it went unnoticed. It overstated ESDS as
 * ₹372 against a real ₹310, and Purple Style Labs as ₹34 against ₹3.
 *
 * The giveaway was already in our own data: `~gmp_percent_calc` matches the
 * DISPLAYED gmp on every row, so the percentage we stored never reconciled with
 * the premium we stored beside it.
 *
 * A premium of "--" means not known. It arrives as `~max_gmp1 = "0"`, so
 * reading that field also published a confident ₹0 for issues with no GMP yet.
 */
function parseGmpCell(html: unknown): { gmp: number | null; pct: number | null; low: number | null; high: number | null } {
  const raw = String(html ?? '');
  const bolds = [...raw.matchAll(/<b>(.*?)<\/b>/gi)].map((m) => decode(m[1]).trim());
  const shown = bolds[0] ?? '';
  const pct = decode(raw).match(/\(\s*(-?[\d.]+)\s*%\s*\)/);
  const range = (bolds[1] ?? '').match(/(-?[\d.]+)\s*↓\s*\/\s*(-?[\d.]+)\s*↑/);
  const n = (x?: string) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
  return {
    gmp: /^-+$/.test(shown) || shown === '' ? null : n(shown),
    pct: pct ? n(pct[1]) : null,
    low: range ? n(range[1]) : null,
    high: range ? n(range[2]) : null,
  };
}

/** `~ipo_status1` — the lifecycle stage the feed reports for a row. */
const FEED_STATUS: Record<string, string> = {
  U: 'Upcoming', O: 'Open', CT: 'Closing today', C: 'Closed',
  LP: 'Listing pending', LN: 'Listed',
};

const iso = (v: unknown): string | undefined =>
  (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : undefined);

/**
 * Company names, reduced to something comparable. Their "Tempsens Instruments
 * (India)" and our "TEMPSENS INSTRUMENTS (INDIA) LIMITED" have to meet.
 */
const norm = (s: unknown): string =>
  String(s ?? '').toUpperCase()
    .replace(/\b(LIMITED|LTD|PVT|PRIVATE|INDIA|IPO|SME)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');

@Injectable()
export class GmpFeedService implements OnModuleInit {
  private readonly log = new Logger('GmpFeed');
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // half-hourly, and never on the boot tick — a cold start should serve
    // traffic before it goes out to a third party
    this.timer = setInterval(() => this.sync(false).catch((e) => this.log.warn(e.message)), TICK_MS);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /**
   * The feed URL the operator set, if any. Stored in ProviderConfig alongside
   * the SMS/email integrations rather than in a new table — it is exactly that
   * shape: non-secret third-party config for the platform tenant.
   *
   * Cached for a minute. The poller runs every 30 minutes and a preview is a
   * handful of pages, so this costs one query per run, not one per page.
   */
  private cfgUrl: string | null = null;
  private cfgAt = 0;
  async storedUrl(): Promise<string | null> {
    if (Date.now() - this.cfgAt < 60_000) return this.cfgUrl;
    const row = await this.prisma.providerConfig
      .findUnique({ where: { tenantId_provider: { tenantId: 't-platform', provider: 'gmpfeed' } } })
      .catch(() => null);
    const u = String((row?.settings as any)?.url ?? '').trim();
    this.cfgUrl = u || null;
    this.cfgAt = Date.now();
    return this.cfgUrl;
  }

  async setUrl(url: string): Promise<{ url: string | null }> {
    const clean = String(url ?? '').trim();
    if (clean && !/^https:\/\/[^\s]+\/data-read\/\d+\/\d+\//.test(clean)) {
      throw new BadRequestException('That does not look like a report data-read URL.');
    }
    await this.prisma.providerConfig.upsert({
      where: { tenantId_provider: { tenantId: 't-platform', provider: 'gmpfeed' } },
      update: { settings: { url: clean } as any, enabled: !!clean },
      create: { tenantId: 't-platform', provider: 'gmpfeed', enabled: !!clean, settings: { url: clean } as any },
    });
    this.cfgUrl = clean || null;
    this.cfgAt = Date.now();
    return { url: this.cfgUrl };
  }

  /**
   * Turn a saved URL into the URL for one page.
   *
   * Only two things vary: the page segment (`/data-read/{report}/{page}/…`) and
   * the upstream cache-buster `v`. `v` is rewritten to the current HH-MM even
   * though the operator pasted one — a saved URL would otherwise pin whatever
   * snapshot was live the day it was pasted. Month, year and financial year are
   * left EXACTLY as given: the operator maintains those, which is the whole
   * point of making this editable.
   */
  private pageUrl(base: string, page: number, when = new Date()): string {
    let u = base.replace(/(\/data-read\/\d+\/)\d+(\/)/, `$1${page}$2`);
    const v = `${String(when.getHours()).padStart(2, '0')}-${String(when.getMinutes()).padStart(2, '0')}`;
    u = /[?&]v=/.test(u) ? u.replace(/([?&]v=)[^&]*/, `$1${v}`) : u + (u.includes('?') ? '&' : '?') + `v=${v}`;
    return u;
  }

  /** The report is per calendar month; the financial year runs April–March. */
  private url(page = 1, when = new Date()): string {
    const y = when.getFullYear();
    const m = when.getMonth() + 1;
    const fyStart = m >= 4 ? y : y - 1;
    const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
    // `v` is the upstream cache-buster: HH-MM
    const v = `${String(when.getHours()).padStart(2, '0')}-${String(when.getMinutes()).padStart(2, '0')}`;
    return `${FEED_HOST}/cloud/v2/report/data-read/${REPORT}/${page}/${m}/${y}/${fy}/0/all?search=&v=${v}`;
  }

  /** Every row for the current month, across pages. */
  async fetchRows(): Promise<FeedRow[]> {
    const out: FeedRow[] = [];
    const base = await this.storedUrl();
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(base ? this.pageUrl(base, page) : this.url(page), {
        headers: { accept: 'application/json', 'user-agent': 'Investoyard/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
      const body: any = await res.json();
      const rows: any[] = Array.isArray(body?.reportTableData) ? body.reportTableData : [];
      for (const r of rows) {
        const cell = parseGmpCell(r['GMP']);
        const id = String(r['~id'] ?? '').trim();
        const name = String(r['~ipo_name'] ?? '').trim();
        if (!id || !name) continue;
        out.push({
          id, name,
          gmp: cell.gmp,
          // the feed's own percentage agrees with the SHOWN gmp, so it is kept
          gmpPct: cell.pct ?? num(r['~gmp_percent_calc']),
          gmpLow: cell.low,
          gmpHigh: cell.high,
          status: FEED_STATUS[String(r['~ipo_status1'] ?? '').trim()] ?? '',
          price: text(r['Price (₹)']) || null,
          lot: num(r['Lot']),
          sizeCr: num(r['IPO Size']),
          openDate: iso(r['~Srt_Open']),
          closeDate: iso(r['~Srt_Close']),
          allotmentDate: iso(r['~Srt_BoA_Dt']),
          listingDate: iso(r['~Str_Listing']),
          category: String(r['~IPO_Category'] ?? '').trim(),
        });
      }
      if (page >= Number(body?.totalPages ?? 1)) break;
    }
    return out;
  }

  /**
   * Pair our catalog against the feed.
   *
   * A stored `extra.gmpSourceId` is authoritative — that is an operator's
   * confirmed link. Everything else is a SUGGESTION, and one corroborated by
   * the open/close dates is worth far more than a name that merely looks
   * similar, so the two are reported apart.
   */
  async match() {
    const ipos = await this.prisma.ipo.findMany({
      where: { hidden: false },
      select: { id: true, symbol: true, name: true, openDate: true, closeDate: true,
                lotSize: true, issueSize: true, priceBandMin: true, priceBandMax: true,
                allotmentDate: true, listingDate: true, extra: true },
    });
    const rows = await this.fetchRows();
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);

    const linked: { ipo: any; row: FeedRow }[] = [];
    const suggested: { ipo: any; row: FeedRow; datesAgree: boolean }[] = [];
    const unmatched: string[] = [];

    for (const ipo of ipos) {
      const ex: any = ipo.extra ?? {};
      if (ex.gmpSourceId) {
        const row = rows.find((r) => r.id === String(ex.gmpSourceId));
        if (row) { linked.push({ ipo, row }); continue; }
      }
      const on = norm(ipo.name);
      const row = rows.find((r) => {
        const n = norm(r.name);
        return n && on && (n === on || on.startsWith(n) || n.startsWith(on));
      });
      if (!row) { unmatched.push(ipo.symbol); continue; }
      const datesAgree = !!row.openDate && row.openDate === day(ipo.openDate)
        && !!row.closeDate && row.closeDate === day(ipo.closeDate);
      suggested.push({ ipo, row, datesAgree });
    }
    return { linked, suggested, unmatched, fetched: rows.length };
  }

  /**
   * Write what the feed knows into the gaps.
   *
   * `dryRun` returns exactly what WOULD change, which is what the admin
   * preview renders — nobody should have to read the logs to find out what a
   * third-party feed is about to do to the catalog.
   */
  /**
   * @param gmpOnly write the GMP readings and nothing else.
   *
   * GMP is a live number that moves through the day, so it is not the same kind
   * of data as a lot size or a close date. Readings are APPENDED with their own
   * timestamp and never overwrite each other — the answer to \"it changes every
   * minute\" is to record when each value was true, not to fight it. Catalog
   * fields stay on the preview-then-apply path, where a wrong value would sit
   * on the record until someone noticed.
   */
  async sync(dryRun = true, gmpOnly = false) {
    const { linked, suggested, unmatched, fetched } = await this.match();
    // only operator-confirmed links are ever written; suggestions are shown
    const pairs = linked;
    const changes: any[] = [];

    for (const { ipo, row } of pairs) {
      const ex: any = ipo.extra ?? {};
      if (ex.autoGmp === false) continue;

      const data: Record<string, any> = {};
      const filled: string[] = [];
      // FILL-IF-EMPTY only. An operator's RHP figure always stands.
      const fill = (field: string, value: any) => {
        if (value == null || (ipo as any)[field] != null) return;
        data[field] = value;
        filled.push(field);
      };
      fill('openDate', row.openDate ? new Date(`${row.openDate}T00:00:00Z`) : null);
      fill('closeDate', row.closeDate ? new Date(`${row.closeDate}T00:00:00Z`) : null);
      fill('allotmentDate', row.allotmentDate ? new Date(`${row.allotmentDate}T00:00:00Z`) : null);
      fill('listingDate', row.listingDate ? new Date(`${row.listingDate}T00:00:00Z`) : null);
      fill('lotSize', row.lot);
      // Ipo.issueSize is RUPEES; the feed quotes ₹ Cr. Mixing them is a 10^7 error.
      fill('issueSize', row.sizeCr != null ? row.sizeCr * 1e7 : null);

      const last = await this.prisma.ipoGmp.findFirst({
        where: { ipoId: ipo.id }, orderBy: { asOf: 'desc' },
      });
      // a person's entry is never replaced by the feed on the same day
      const manualToday = last && last.source !== 'feed'
        && last.asOf.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
      const gmpMoved = row.gmp != null && (!last || Number(last.value) !== row.gmp);
      const writeGmp = gmpMoved && !manualToday;

      if (!filled.length && !writeGmp) continue;
      changes.push({ symbol: ipo.symbol, from: row.name, filled, gmp: writeGmp ? row.gmp : undefined, skippedManual: !!manualToday });
      if (dryRun) continue;

      const ops: any[] = [];
      const ops0: any[] = [];
      if (writeGmp) {
        const today = new Date().toISOString().slice(0, 10);
        const nextExtra: any = { ...ex };
        const glog = Array.isArray(nextExtra.gmpLog) ? nextExtra.gmpLog : [];
        // same day-keyed shape the manual entry screen writes, so the
        // day-wise trend picks it up without knowing where it came from
        nextExtra.gmpLog = [...glog.filter((x: any) => x?.d !== today),
                            { d: today, gmp: row.gmp, pct: row.gmpPct }].slice(-30);
        Object.assign(data, { extra: nextExtra });
        // gmpOnly still needs the log written — it is part of the reading, not a field-fill
        if (gmpOnly) ops0.push(this.prisma.ipo.update({ where: { id: ipo.id }, data: { extra: nextExtra } as any }));
        ops.push(this.prisma.ipoGmp.create({
          data: { ipoId: ipo.id, value: row.gmp!, trend: 'flat', source: 'feed', submittedByName: 'Auto · feed' },
        }));
      }
      if (!gmpOnly && Object.keys(data).length) ops.push(this.prisma.ipo.update({ where: { id: ipo.id }, data: data as any }));
      const all = [...ops0, ...ops];
      if (all.length) await this.prisma.$transaction(all);
    }

    if (!dryRun && changes.length) this.log.log(`feed: updated ${changes.length} IPO(s)`);
    return {
      dryRun, fetched, changes,
      // every confirmed link, not just the ones with something to write —
      // otherwise a wrong link that happens to have no pending change is
      // invisible on the screen, and cannot be undone
      linked: linked.map((l) => ({
        symbol: l.ipo.symbol, ourName: l.ipo.name, theirName: l.row.name,
        sourceId: l.row.id, gmp: l.row.gmp, gmpPct: l.row.gmpPct, status: l.row.status,
        autoGmp: ((l.ipo.extra as any) ?? {}).autoGmp !== false,
      })),
      suggestions: suggested.map((s) => ({
        symbol: s.ipo.symbol, ourName: s.ipo.name, theirName: s.row.name,
        sourceId: s.row.id, gmp: s.row.gmp, gmpPct: s.row.gmpPct, status: s.row.status, datesAgree: s.datesAgree,
      })),
      unmatched,
    };
  }

  /** An operator confirms (or clears) the link for one IPO. */
  async link(symbol: string, sourceId: string | null) {
    const ipo = await this.prisma.ipo.findUnique({ where: { symbol }, select: { id: true, extra: true } });
    if (!ipo) return { ok: false, error: 'Unknown symbol.' };
    const extra: any = { ...((ipo.extra as any) ?? {}) };
    if (sourceId) extra.gmpSourceId = sourceId; else delete extra.gmpSourceId;
    await this.prisma.ipo.update({ where: { id: ipo.id }, data: { extra: extra as any } });
    return { ok: true, symbol, sourceId };
  }
}

@Controller('admin/gmp-feed')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GmpFeedController {
  constructor(private readonly feed: GmpFeedService) {}

  /** What the feed WOULD change, and what it cannot match. Writes nothing. */
  @Get('preview')
  @RequirePermissions('gmp.feed.view')
  preview() { return this.feed.sync(true); }

  @Post('sync')
  @RequirePermissions('gmp.feed.view')
  run() { return this.feed.sync(false); }

  /**
   * Pull the live GMP now. Writes the READINGS only — each is appended with its
   * own timestamp, so a number that moves through the day builds a history
   * instead of overwriting itself. Catalog fields still go through Apply.
   */
  @Post('refresh-gmp')
  @RequirePermissions('gmp.feed.view')
  refreshGmp() { return this.feed.sync(false, true); }

  @Post('link')
  @RequirePermissions('gmp.feed.view')
  link(@Query('symbol') symbol: string, @Query('sourceId') sourceId?: string) {
    return this.feed.link(symbol, sourceId || null);
  }

  /** The source URL, so the operator can see and change where rows come from. */
  @Get('config')
  @RequirePermissions('gmp.feed.view')
  async config() {
    const url = await this.feed.storedUrl();
    return { url, usingDefault: !url };
  }

  @Post('config')
  @RequirePermissions('gmp.feed.view')
  saveConfig(@Body() body: { url?: string }) {
    return this.feed.setUrl(body?.url ?? '');
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [GmpFeedController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard, GmpFeedService],
  exports: [GmpFeedService],
})
export class GmpFeedModule {}
