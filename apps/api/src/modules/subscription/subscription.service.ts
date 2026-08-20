import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BseDemandRow, BseQueryAdapter, CatwiseRow, IpoMasterEntry, MemberCredential, NseQueryAdapter } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { RailService } from '../rail/rail.service';
import { tenantContext } from '../../common/tenant-context';

// ── tunables (env-overridable) ────────────────────────────────────────────────
const TICK_MS = Number(process.env.SUBSCRIPTION_TICK_MS) || 10_000;        // base loop cadence
const NORMAL_MS = Number(process.env.SUBSCRIPTION_NORMAL_MS) || 20_000;    // per-IPO cadence, normal
const FAST_MS = Number(process.env.SUBSCRIPTION_FAST_MS) || 10_000;        // per-IPO cadence, closing rush
const FAST_WINDOW_MIN = Number(process.env.SUBSCRIPTION_FAST_WINDOW_MIN) || 90; // final N min → fast
const OPEN_FROM_MIN = 10 * 60; // 10:00 IST
const OPEN_TO_MIN = 17 * 60;   // 17:00 IST

/**
 * NSE category code → our subscription bucket (shared-types SubscriptionRow).
 * Unlisted categories still count toward `total`, they just don't get a named row.
 */
const BUCKET: Record<string, 'qib' | 'nii' | 'retail' | 'employee'> = {
  QIB: 'qib',
  NIB: 'nii', NII: 'nii', HNI: 'nii', SNII: 'nii', BNII: 'nii',
  RETAIL: 'retail', IND: 'retail', INDIV: 'retail', RII: 'retail',
  EMP: 'employee', EMPLOYEE: 'employee', EMPL: 'employee',
};

interface SubRow {
  category: string;
  timesSubscribed: number;          // by shares
  bidCount?: number;                // applications in this category
  applicationsSubscribed?: number;  // by applications (drives retail allotment odds)
}
interface OpenIpo {
  id: string;
  symbol: string;
  lotSize: number | null;
  openDate: Date | null;
  closeDate: Date | null;
}
/** Active credentials for one poll sweep (either may be null). */
interface SweepCreds {
  nse: MemberCredential | null;
  bse: MemberCredential | null;
  bseToken: string | null;
}
/** Per-NSE-category demand aggregate: q = shares demanded, b = applications/bids. */
interface CatAgg {
  q: number;
  b: number;
}

/**
 * SubscriptionService — live IPO subscription poller (NSE Query Server → `ipoSubscription`).
 *
 * A single ${TICK_MS}ms loop, gated so it only calls NSE when it should:
 *   • market window  — 10:00–17:00 IST, Mon–Fri, not an NSE holiday (holidaymaster)
 *   • per IPO        — status=open, within [openDate,closeDate], autoPollSubscription=true
 *   • adaptive       — each IPO refreshes every ${NORMAL_MS/1000}s, tightening to ${FAST_MS/1000}s
 *                      in the final ${FAST_WINDOW_MIN} min of its closing day
 *   • cheap          — ipomaster (offered) + holidays cached once/day; DB rows rewritten only on change
 *
 * Computes two metrics from /catwise: by SHARES (demand÷offered) and by APPLICATIONS
 * (bidCount÷max-allottees) — the latter drives retail allotment odds on Portfolio.
 * Self-healing: no credential / down Query Server / one bad IPO never aborts the loop.
 */
@Injectable()
export class SubscriptionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('SubscriptionPoll');
  private timer?: NodeJS.Timeout;
  private readonly query = new NseQueryAdapter();
  private readonly bseQuery = new BseQueryAdapter();

  // per-IPO cadence + change-detection state
  private readonly lastFetchAt = new Map<string, number>();
  private readonly lastSnapshot = new Map<string, string>();
  // daily caches (keyed by IST yyyy-mm-dd)
  private offeredCache: { day: string; map: Map<string, Map<string, number>> } | null = null;
  private holidayCache: { day: string; dates: Set<string> } | null = null;

  constructor(private prisma: PrismaService, private rail: RailService) {}

  onModuleInit() {
    if (process.env.SUBSCRIPTION_POLL_DISABLED === 'true') return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.warn(e.message)), TICK_MS);
    this.timer.unref(); // never keep the process alive just for the poll
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── the scheduled loop ──────────────────────────────────────────────────────
  private async tick(): Promise<void> {
    const ist = this.istParts();
    if (!this.isTradingDay(ist)) return;                 // Sat/Sun (holiday check happens after cred)
    const mins = ist.hour * 60 + ist.minute;
    if (mins < OPEN_FROM_MIN || mins >= OPEN_TO_MIN) return; // outside 10:00–17:00 IST

    await tenantContext.runUnscoped(async () => {
      const sweep = await this.resolveSweep();
      if (!sweep.nse && !sweep.bse) return; // no rail configured → idle

      // holidays (once/day). If the calendar says today is a holiday, stop.
      const holidays = await this.ensureHolidays(ist.ymd);
      if (holidays.has(ist.ymd)) return;

      const ipos = await this.openAutoIpos(ist.ymd);
      if (ipos.length === 0) return;

      const now = Date.now();
      const due = ipos.filter((i) => now - (this.lastFetchAt.get(i.id) ?? 0) >= this.intervalMs(i, ist));
      if (due.length === 0) return;

      const offered = await this.ensureOffered(ist.ymd);
      for (const ipo of due) await this.refreshIpo(ipo, sweep, offered);
    });
  }

  // ── manual triggers (admin) ────────────────────────────────────────────────
  /** Refresh ALL open IPOs now, ignoring the market window + cadence (the admin "Refresh now" button). */
  async pollOnce(): Promise<{ open: number; updated: number; reason?: string }> {
    return tenantContext.runUnscoped(async () => {
      const sweep = await this.resolveSweep();
      if (!sweep.nse && !sweep.bse) return { open: 0, updated: 0, reason: 'no-credential' };
      const ipos = await this.openAutoIpos(this.istParts().ymd, /*ignoreAutoFlag*/ true);
      if (ipos.length === 0) return { open: 0, updated: 0 };
      const offered = await this.ensureOffered(this.istParts().ymd);
      let updated = 0;
      for (const ipo of ipos) if (await this.refreshIpo(ipo, sweep, offered)) updated++;
      return { open: ipos.length, updated };
    });
  }

  /** Refresh one IPO now (admin per-row "refresh"). */
  async pollIpo(ipoId: string): Promise<{ ok: boolean; changed?: boolean; reason?: string }> {
    return tenantContext.runUnscoped(async () => {
      const sweep = await this.resolveSweep();
      if (!sweep.nse && !sweep.bse) return { ok: false, reason: 'no-credential' };
      const ipo = await this.prisma.ipo.findUnique({
        where: { id: ipoId },
        select: { id: true, symbol: true, lotSize: true, openDate: true, closeDate: true },
      });
      if (!ipo) return { ok: false, reason: 'not-found' };
      const offered = await this.ensureOffered(this.istParts().ymd);
      const changed = await this.refreshIpo(ipo, sweep, offered);
      return { ok: true, changed };
    });
  }

  // ── one IPO: fetch BOTH exchanges → combine per category → write-on-change ───
  private async refreshIpo(ipo: OpenIpo, sweep: SweepCreds, offered: Map<string, Map<string, number>>): Promise<boolean> {
    try {
      // Gather per-category demand from each exchange we have a credential for, then
      // merge (sum) by category. Either side failing/absent → the other still counts.
      const sources: Map<string, CatAgg>[] = [];
      if (sweep.nse) {
        try {
          sources.push(fromCatwise(await this.query.getCatwise(ipo.symbol, sweep.nse)));
        } catch (e: any) { this.log.warn(`${ipo.symbol} NSE: ${e.message}`); }
      }
      if (sweep.bse && sweep.bseToken) {
        try {
          sources.push(fromBseDemand(await this.bseQuery.getDemandSchedule(ipo.symbol, sweep.bseToken, sweep.bse)));
        } catch (e: any) { this.log.warn(`${ipo.symbol} BSE: ${e.message}`); }
      }
      const merged = mergeDemand(sources);
      const subs = this.computeSubs(merged, offered.get(ipo.symbol.toUpperCase()), ipo.lotSize ?? undefined);
      this.lastFetchAt.set(ipo.id, Date.now());
      if (subs.length === 0) {
        this.log.warn(`${ipo.symbol}: no computable subscription (missing offered qty for its categories?)`);
        return false;
      }
      const now = new Date();
      const snap = JSON.stringify(subs);
      const changed = this.lastSnapshot.get(ipo.id) !== snap;
      if (changed) {
        // Day-wise trend log for the detail page — one entry per IST day,
        // the day's LATEST snapshot wins. Kept to the last 14 days in extra.subLog.
        const day = this.istParts().ymd;
        const row = await this.prisma.ipo.findUnique({ where: { id: ipo.id }, select: { extra: true } });
        const ex: any = (row?.extra as any) ?? {};
        const pick = (c: string) => { const s = subs.find((x) => x.category === c); return s ? Number(s.timesSubscribed) : null; };
        const subLog = [
          ...(Array.isArray(ex.subLog) ? ex.subLog : []).filter((e: any) => e?.d !== day),
          { d: day, total: pick('total'), qib: pick('qib'), nii: pick('nii'), retail: pick('retail') },
        ].slice(-14);
        await this.prisma.$transaction([
          this.prisma.ipoSubscription.deleteMany({ where: { ipoId: ipo.id } }),
          this.prisma.ipoSubscription.createMany({
            data: subs.map((s) => ({
              ipoId: ipo.id, category: s.category, timesSubscribed: s.timesSubscribed,
              bidCount: s.bidCount, applicationsSubscribed: s.applicationsSubscribed,
            })),
          }),
          this.prisma.ipo.update({ where: { id: ipo.id }, data: { subscriptionAsOf: now, extra: { ...ex, subLog } } }),
        ]);
        this.lastSnapshot.set(ipo.id, snap);
      } else {
        // numbers unchanged — just record that we checked (cheap single-field update)
        await this.prisma.ipo.update({ where: { id: ipo.id }, data: { subscriptionAsOf: now } });
      }
      return changed;
    } catch (e: any) {
      this.lastFetchAt.set(ipo.id, Date.now()); // don't hammer a failing symbol
      this.log.warn(`${ipo.symbol}: ${e.message}`);
      return false;
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private async openAutoIpos(_istYmd: string, ignoreAutoFlag = false): Promise<OpenIpo[]> {
    return this.prisma.ipo.findMany({
      where: { status: 'open', ...(ignoreAutoFlag ? {} : { autoPollSubscription: true }) },
      select: { id: true, symbol: true, lotSize: true, openDate: true, closeDate: true },
    });
  }

  /** Per-IPO cadence: tighten to FAST_MS in the last FAST_WINDOW_MIN minutes of the closing day. */
  private intervalMs(ipo: OpenIpo, ist: IstParts): number {
    if (ipo.closeDate) {
      const closeYmd = this.istYmd(ipo.closeDate);
      if (ist.ymd === closeYmd && ist.hour * 60 + ist.minute >= OPEN_TO_MIN - FAST_WINDOW_MIN) return FAST_MS;
    }
    return NORMAL_MS;
  }

  /** symbol → (NSE category → offered shares), from ipomaster; cached for the IST day. */
  private async ensureOffered(istYmd: string): Promise<Map<string, Map<string, number>>> {
    if (this.offeredCache?.day === istYmd) return this.offeredCache.map;
    let map = new Map<string, Map<string, number>>();
    try {
      map = this.buildOfferedMap(await this.rail.getIpoMaster());
    } catch (e: any) {
      this.log.warn(`ipomaster fetch failed (times-subscribed skipped this cycle): ${e.message}`);
    }
    this.offeredCache = { day: istYmd, map };
    return map;
  }

  /** Resolve both exchanges' active credentials for a sweep; BSE also gets a Message-API token. */
  private async resolveSweep(): Promise<SweepCreds> {
    const [nse, bse] = await Promise.all([
      this.rail.activeNseCredentialOrNull(),
      this.rail.activeBseCredentialOrNull(),
    ]);
    let bseToken: string | null = null;
    if (bse) {
      try { bseToken = await this.bseQuery.login(bse); }
      catch (e: any) { this.log.warn(`BSE message login failed (NSE-only subscription this cycle): ${e.message}`); }
    }
    return { nse, bse, bseToken };
  }

  /** NSE IPO-segment holiday dates (yyyy-mm-dd), cached for the IST day. Empty ⇒ weekday-only gating. */
  private async ensureHolidays(istYmd: string): Promise<Set<string>> {
    if (this.holidayCache?.day === istYmd) return this.holidayCache.dates;
    const dates = new Set<string>();
    try {
      const from = this.ddmmyyyy(new Date());
      const to = this.ddmmyyyy(new Date(Date.now() + 90 * 86_400_000));
      const rows = await this.rail.fetchHolidays(from, to);
      for (const h of rows) {
        const segs = (h.segments ?? []).map((s) => String(s).toUpperCase());
        const ipoSegment = segs.length === 0 || segs.some((s) => ['EQUITY', 'SME', 'FPO', 'IPO'].includes(s));
        const ymd = this.ddmmyyyyToYmd(h.date);
        if (ipoSegment && ymd) dates.add(ymd);
      }
    } catch (e: any) {
      this.log.warn(`holidaymaster fetch failed (weekday-only gating): ${e.message}`);
    }
    this.holidayCache = { day: istYmd, dates };
    return dates;
  }

  private buildOfferedMap(master: IpoMasterEntry[]): Map<string, Map<string, number>> {
    const m = new Map<string, Map<string, number>>();
    for (const e of master) {
      const per = new Map<string, number>();
      for (const c of e.categories ?? []) if (c.offered != null) per.set(String(c.code).toUpperCase(), c.offered);
      m.set(String(e.symbol).toUpperCase(), per);
    }
    return m;
  }

  /**
   * Combine per-category demand (already merged NSE+BSE) into our buckets. Two metrics:
   *   timesSubscribed        = Σ demand shares ÷ Σ offered shares
   *   applicationsSubscribed = Σ bids ÷ max allottees (offered ÷ lotSize)  — retail allotment-odds driver
   */
  private computeSubs(perCat: Map<string, CatAgg>, offeredByCat: Map<string, number> | undefined, lotSize?: number): SubRow[] {
    if (!offeredByCat || offeredByCat.size === 0 || perCat.size === 0) return [];

    const agg: Record<string, { d: number; o: number; b: number }> = {};
    let tD = 0, tO = 0, tB = 0;
    for (const [c, e] of perCat) {
      const o = offeredByCat.get(c);
      if (o == null || o <= 0) continue;
      tD += e.q; tO += o; tB += e.b;
      const bucket = BUCKET[c];
      if (bucket) {
        agg[bucket] ??= { d: 0, o: 0, b: 0 };
        agg[bucket].d += e.q; agg[bucket].o += o; agg[bucket].b += e.b;
      }
    }

    const mk = (category: string, d: number, o: number, b: number): SubRow => {
      const row: SubRow = { category, timesSubscribed: round2(d / o) };
      if (b > 0) row.bidCount = b;
      if (lotSize && lotSize > 0 && b > 0) {
        const maxAllottees = o / lotSize;
        if (maxAllottees > 0) row.applicationsSubscribed = round2(b / maxAllottees);
      }
      return row;
    };

    const out: SubRow[] = [];
    for (const [category, v] of Object.entries(agg)) if (v.o > 0) out.push(mk(category, v.d, v.o, v.b));
    if (tO > 0) out.push(mk('total', tD, tO, tB));
    return out;
  }

  // ── IST date/time helpers (server TZ is unknown, so compute IST explicitly) ──
  private istParts(d = new Date()): IstParts {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    });
    const p: any = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
  }
  private istYmd(d: Date): string {
    return this.istParts(d).ymd;
  }
  private isTradingDay(ist: IstParts): boolean {
    return ist.weekday !== 'Sat' && ist.weekday !== 'Sun';
  }
  /** Date → "dd-MM-yyyy" in IST (holidaymaster path params). */
  private ddmmyyyy(d: Date): string {
    const p = this.istParts(d).ymd.split('-');
    return `${p[2]}-${p[1]}-${p[0]}`;
  }
  /** "dd-MM-yyyy" → "yyyy-mm-dd" (or null if unparseable). */
  private ddmmyyyyToYmd(s?: string): string | null {
    if (!s) return null;
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
}

interface IstParts {
  ymd: string;
  hour: number;
  minute: number;
  weekday: string; // 'Mon'..'Sun'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── per-exchange demand → normalized per-category aggregate, then merged ──────
/** NSE catwise rows → per-category {shares, applications}. */
function fromCatwise(rows: CatwiseRow[]): Map<string, CatAgg> {
  const m = new Map<string, CatAgg>();
  for (const r of rows) {
    const c = String(r.category).toUpperCase();
    const e = m.get(c) ?? { q: 0, b: 0 };
    e.q += r.quantity ?? 0;
    e.b += r.bidCount ?? 0;
    m.set(c, e);
  }
  return m;
}
/**
 * BSE demandschedule rows → per-category {shares, applications}.
 * Rows come per (category, subcategory, P/C type); sum shares across them.
 * `totalapplication` repeats across a category's rows, so take the MAX (not sum)
 * to avoid multiplying the application count by the number of price/cutoff rows.
 */
function fromBseDemand(rows: BseDemandRow[]): Map<string, CatAgg> {
  const q = new Map<string, number>();
  const apps = new Map<string, number>();
  for (const r of rows) {
    const c = String(r.category).toUpperCase();
    q.set(c, (q.get(c) ?? 0) + (r.quantity ?? 0));
    if (r.applications != null) apps.set(c, Math.max(apps.get(c) ?? 0, r.applications));
  }
  const m = new Map<string, CatAgg>();
  for (const [c, shares] of q) m.set(c, { q: shares, b: apps.get(c) ?? 0 });
  return m;
}
/** Sum several exchanges' per-category aggregates into one combined map. */
function mergeDemand(sources: Map<string, CatAgg>[]): Map<string, CatAgg> {
  const out = new Map<string, CatAgg>();
  for (const src of sources) {
    for (const [c, e] of src) {
      const cur = out.get(c) ?? { q: 0, b: 0 };
      cur.q += e.q;
      cur.b += e.b;
      out.set(c, cur);
    }
  }
  return out;
}
