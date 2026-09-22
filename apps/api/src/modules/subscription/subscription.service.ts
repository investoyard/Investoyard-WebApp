import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BseDemandRow, BseQueryAdapter, CatwiseRow, MemberCredential, NseQueryAdapter } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { RailService } from '../rail/rail.service';
import { ProviderConfigService } from '../../common/provider-config.service';
import { tenantContext } from '../../common/tenant-context';

// ── tunables ─────────────────────────────────────────────────────────────────
// Base loop cadence — how often tick() runs. NOT the per-IPO refresh; that
// comes from the runtime tuning below. Env-only (rarely changed).
const TICK_MS = Number(process.env.SUBSCRIPTION_TICK_MS) || 10_000;
// Per-IPO cadence DEFAULTS. These are the fallback when nothing's saved in
// admin → Integrations → Live subscription poller. Every value below is
// live-overridable via that admin card (operator ask, 2026-09-21).
const DEFAULT_NORMAL_SEC = 60;   // refresh once a minute during the bidding window
const DEFAULT_FAST_SEC = 5;      // closing rush: every 5s
const DEFAULT_FAST_WINDOW_MIN = 90;
const DEFAULT_POLL_FROM_MIN = 10 * 60;   // 10:00 IST — matches SEBI bidding open
const DEFAULT_POLL_TO_MIN = 18 * 60;     // 18:00 IST — 1h grace past 17:00 bidding close
// BIDDING cutoff (SEBI): 17:00 IST — drives the fast-cadence "closing rush"
// trigger (fast mode kicks in at 17:00 − fastWindowMin, e.g. 15:30 IST for
// the default 90-min window). Fixed by regulation; NOT tunable.
const BIDDING_CLOSE_MIN = 17 * 60;

/**
 * The seven buckets that come out of merging NSE + BSE (matches the operator's
 * legacy C# workflow: QIB / HNI-Above-10L / HNI-Below-10L / RETAIL / EMPLOYEE /
 * SHAREHOLDER-or-POLICYHOLDER, plus a rolled-up `total`). `hni` is Big-HNI
 * (>₹10 L, SEBI's larger 2/3 of NII); `hni2` is Small-HNI (<₹10 L) — same
 * naming shared-types uses in `CATEGORY_LABELS` and `computeIssue`.
 */
type Bucket = 'qib' | 'hni' | 'hni2' | 'retail' | 'employee' | 'shareholder';

/**
 * NSE category code → our bucket. Follows the operator's C# workflow:
 *   QIB → qib; NIBBT (Below-10L S-HNI) → hni2; NIBAT (Above-10L B-HNI) → hni;
 *   INDIV / RETAIL → retail; EMPRET → employee; SHARET / POLRET → shareholder.
 * Aggregate legacy codes (NIB / NII / HNI) route to `hni` as a best-effort
 * fallback — we lose the Big/Small split when the exchange doesn't send it.
 */
function bucketNse(cat: string): Bucket | null {
  const c = cat.toUpperCase();
  if (c === 'QIB') return 'qib';
  if (c === 'NIBBT') return 'hni2';
  if (c === 'NIBAT') return 'hni';
  if (c === 'NIB' || c === 'NII' || c === 'HNI' || c === 'SNII' || c === 'BNII') return 'hni';
  if (c === 'INDIV' || c === 'RETAIL' || c === 'IND' || c === 'RII') return 'retail';
  if (c === 'EMPRET' || c === 'EMP' || c === 'EMPLOYEE' || c === 'EMPL') return 'employee';
  if (c === 'SHARET' || c === 'POLRET' || c === 'SHA' || c === 'POL') return 'shareholder';
  return null;
}

/**
 * BSE (category, subCategory) → our bucket. Same C# workflow:
 *   QIB / IC / FI / FII / OTH / MF → qib;
 *   (CO|NOH, BT) or (IND, OTHERBT) → hni2 (Below-10L);
 *   (CO|NOH, AT) or (IND, OTHERAT) → hni  (Above-10L);
 *   (IND, RII) → retail; EMP → employee; SHA / POL → shareholder.
 * The BT / AT split lives in the SUB-category — bucketing on category alone
 * would collapse Big-HNI and Small-HNI into one row (the mistake the old
 * 4-bucket NII map made).
 */
function bucketBse(cat: string, subCat?: string): Bucket | null {
  const c = cat.toUpperCase();
  const s = (subCat ?? '').toUpperCase();
  if (['QIB', 'IC', 'FI', 'FII', 'OTH', 'MF'].includes(c)) return 'qib';
  if ((c === 'CO' || c === 'NOH') && s === 'BT') return 'hni2';
  if ((c === 'CO' || c === 'NOH') && s === 'AT') return 'hni';
  if (c === 'IND' && s === 'OTHERBT') return 'hni2';
  if (c === 'IND' && s === 'OTHERAT') return 'hni';
  if (c === 'IND' && (s === 'RII' || s === '')) return 'retail';
  if (c === 'RII') return 'retail';
  if (c === 'EMP' || c === 'EMPLOYEE') return 'employee';
  if (c === 'SHA' || c === 'POL') return 'shareholder';
  return null;
}

/** Per-bucket per-exchange accumulator — the shape sir's plan calls out for step 2 to persist. */
interface CatAgg {
  nseShares: number;
  bseShares: number;
  nseBids: number;
  bseBids: number;
}
function emptyAgg(): CatAgg { return { nseShares: 0, bseShares: 0, nseBids: 0, bseBids: 0 }; }

/**
 * Bucket raw NSE + BSE demand rows into the 7-category accumulator. BSE only
 * ships `totalapplication` as a scalar for the whole issue (not per category),
 * so we back-solve per-category BSE bid counts from the NSE average
 * shares-per-bid — the fudge the operator's C# workflow uses:
 *
 *   bseBids[hni]         = round( bseShares[hni]         ÷ (nseShares[hni]         ÷ nseBids[hni]) )
 *   bseBids[hni2]        = round( bseShares[hni2]        ÷ (nseShares[hni2]        ÷ nseBids[hni2]) )
 *   bseBids[shareholder] = round( bseShares[shareholder] ÷ (nseShares[shareholder] ÷ nseBids[shareholder]) )
 *   bseBids[employee]    = round( bseShares[employee]    ÷ (nseShares[employee]    ÷ nseBids[employee]) )
 *   bseBids[retail]      = totalapplication − (hni + hni2 + shareholder + employee)
 *
 * QIB BSE bids stay 0 — institutional app counts are naturally tiny beside
 * retail, and folding them into the retail residual keeps the approximation
 * simple. Employee was previously excluded here too (operator report,
 * 2026-09-21: NSE showed 12k+ Employee BSE bids missing — extracted below).
 * When NSE has no bids yet (early minutes), the ratio blows up — we skip
 * the fudge for the affected bucket and let retail absorb the full BSE
 * totalapplication.
 */
function bucketize(nseRows: CatwiseRow[], bseRows: BseDemandRow[]): {
  buckets: Map<Bucket, CatAgg>;
  bseTotalApps: number;
} {
  const buckets = new Map<Bucket, CatAgg>();
  const get = (k: Bucket): CatAgg => {
    let v = buckets.get(k);
    if (!v) { v = emptyAgg(); buckets.set(k, v); }
    return v;
  };

  for (const r of nseRows) {
    const b = bucketNse(r.category);
    if (!b) continue;
    const a = get(b);
    a.nseShares += r.quantity ?? 0;
    a.nseBids += r.bidCount ?? 0;
  }

  // BSE `totalapplication` is repeated on every row — take MAX so partial
  // parses don't undercount, and defend against absent applications field.
  let bseTotalApps = 0;
  for (const r of bseRows) {
    const b = bucketBse(r.category, r.subCategory);
    if (b) {
      const a = get(b);
      a.bseShares += r.quantity ?? 0;
    }
    if (r.applications != null && r.applications > bseTotalApps) bseTotalApps = r.applications;
  }

  // Back-solve BSE per-category bids from NSE's shares-per-bid ratio.
  // Employee added 2026-09-21 (operator report: NSE had 12,057 BSE Employee
  // bids getting silently folded into Retail's residual).
  let nonRetailBseBids = 0;
  for (const b of ['hni', 'hni2', 'shareholder', 'employee'] as Bucket[]) {
    const a = buckets.get(b);
    if (!a || a.bseShares <= 0 || a.nseShares <= 0 || a.nseBids <= 0) continue;
    const nseAvg = a.nseShares / a.nseBids;
    if (nseAvg <= 0) continue;
    a.bseBids = Math.max(0, Math.round(a.bseShares / nseAvg));
    nonRetailBseBids += a.bseBids;
  }
  if (bseTotalApps > 0) {
    const retail = get('retail');
    retail.bseBids = Math.max(0, bseTotalApps - nonRetailBseBids);
  }

  return { buckets, bseTotalApps };
}

/**
 * Per-bucket offered shares from OUR IPO metadata (the reservation table the
 * operator enters). Per bucket, three possible sources — prefer the direct
 * ones over the compound-derived one:
 *
 *   1. `shareResv[bucket].sharesLower` (or `sharesUpper` — same field, two
 *      naming conventions) — the operator's per-bucket offered share count.
 *      ONE field, ONE failure point.
 *   2. `derivedTotal × pct ÷ 100` where `derivedTotal` is inferred from ANY
 *      bucket that has BOTH a share count AND a pct (e.g. qib.sharesUpper=
 *      6.32 Cr at pct=50% implies total=12.64 Cr shares; that same total
 *      is then used to compute hni/hni2 offered when THEIR own share counts
 *      are missing or zero). Self-consistent — takes the largest implied
 *      total across all buckets so an under-populated bucket doesn't shrink
 *      the divisor.
 *   3. `issueSize (₹) ÷ priceBandMax (₹/share) × pct ÷ 100` — the raw
 *      compound derivation. Only used when NO bucket carries a share count.
 *      Compound of three inputs; a single stale/missing one silently multiplies
 *      the divisor by orders of magnitude (see NSE IPO 2026-09: issueSize
 *      shipped with 4 extra zeros → times ≈ 0 for every category).
 *
 * The two naming conventions (`sharesLower` / `sharesUpper`) exist because
 * older data-entry entered lower-price-band offered qty and newer data-entry
 * enters upper-price-band. Both are legitimate — for a "how oversubscribed?"
 * ratio either bound is close enough (the price hasn't been fixed yet).
 *
 * Returns null when NO bucket produced a usable offered — the caller then
 * skips the times-subscribed math for this cycle rather than fabricating one.
 */
function offeredFromIpo(
  issueSize: number | null | undefined,
  priceBandMax: number | null | undefined,
  extra: any,
): Map<Bucket, number> | null {
  const resv = extra?.shareResv;
  if (!resv || typeof resv !== 'object') return null;
  const BUCKETS: Bucket[] = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder'];
  // Prefer sharesUpper (industry convention on Bumtaria / Chittorgarh /
  // IPOPremium and the offered-shares figure exchanges' subscription APIs
  // report — shares at the upper band). Falls back to sharesLower (NSE
  // PREANCHOR prints at the lower band). Flipped 2026-09-22 when the
  // reservation normalisation script rewrote both bands from percentages.
  const directOf = (row: any): number => {
    const upper = Number(row?.sharesUpper);
    if (upper > 0) return upper;
    const lower = Number(row?.sharesLower);
    if (lower > 0) return lower;
    return 0;
  };

  // Derive a self-consistent totalOffered by picking the largest implied
  // total from any bucket with both a share count and a pct. Larger wins
  // so a mis-entered small bucket doesn't shrink the divisor for others.
  let derivedTotal = 0;
  for (const b of BUCKETS) {
    const row = resv[b];
    if (!row) continue;
    const shares = directOf(row);
    const pct = Number(row.pct);
    if (shares > 0 && pct > 0) {
      const implied = shares / (pct / 100);
      if (implied > derivedTotal) derivedTotal = implied;
    }
  }
  // Last-resort fallback — raw issueSize × pct. Only kicks in when no bucket
  // has a share count entered at all (rare, legacy imports).
  if (derivedTotal <= 0) {
    const size = Number(issueSize);
    const price = Number(priceBandMax);
    if (size > 0 && price > 0) derivedTotal = size / price;
  }

  const out = new Map<Bucket, number>();
  for (const b of BUCKETS) {
    const row = resv[b];
    if (!row || row.on === false) continue;
    // Source 1: direct sharesLower/Upper — wins whenever present.
    const direct = directOf(row);
    if (direct > 0) { out.set(b, direct); continue; }
    // Source 2: derived total × this bucket's pct.
    const pct = Number(row.pct);
    if (pct > 0 && derivedTotal > 0) out.set(b, (derivedTotal * pct) / 100);
  }
  return out.size > 0 ? out : null;
}

interface SubRow {
  category: string;                 // qib | nii | retail | employee | shareholder | total
  timesSubscribed: number;          // by shares
  bidCount?: number;                // applications in this category (= nseBids + bseBids)
  applicationsSubscribed?: number;  // by applications (drives retail allotment odds)
  // Per-exchange breakdown — matches the additive `IpoSubscription` columns
  // added in step 2. The day-wise report page reads these directly and the
  // front-site subscription card will read them in step 3 to compute times
  // at display without a poll-time offered divisor. `null` = unknown for
  // that exchange (e.g. NSE credential missing this cycle, or BSE bid split
  // skipped because NSE hadn't opened yet — see bucketize).
  nseShares?: number;
  bseShares?: number;
  nseBids?: number;
  bseBids?: number;
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

/**
 * SubscriptionService — live IPO subscription poller (NSE catwise + BSE demandschedule → `ipoSubscription`).
 *
 * A single ${TICK_MS}ms loop, gated so it only calls the exchanges when it should:
 *   • market window  — 10:00–18:00 IST default (last hour is a grace window
 *                      for post-close settlement), Mon–Fri, not an NSE holiday
 *   • per IPO        — open-date ≤ today ≤ close-date, `hidden:false`, `autoPollSubscription:true`
 *   • adaptive       — each IPO refreshes every ${DEFAULT_NORMAL_SEC}s, tightening to ${DEFAULT_FAST_SEC}s
 *                      in the final ${DEFAULT_FAST_WINDOW_MIN} min before the 17:00 bidding cutoff
 *                      (and through the post-close grace hour). All four values are
 *                      live-tunable via admin → Integrations → Live subscription poller
 *   • cheap          — holidays cached once/day; DB rows rewritten only on snapshot change
 *
 * Buckets match the operator's legacy C# workflow — 7 categories
 * (qib/hni/hni2/retail/employee/shareholder + total). Offered shares come from
 * OUR reservation table (`extra.shareResv × issueSize/priceBandMax`) since the
 * NSE ipomaster endpoint doesn't carry per-category offered qty for
 * current-day issues.
 *
 * For step-1 backwards compatibility with the current front-site subscription card,
 * hni and hni2 are ROLLED UP into a single `nii` output row (the C# split is used
 * internally to drive the BSE bid-count fudge). Step 2 will add the per-exchange
 * columns to `IpoSubscription`; step 3 will emit hni/hni2 separately and move the
 * times computation to the display layer.
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
  // daily holiday cache (keyed by IST yyyy-mm-dd)
  private holidayCache: { day: string; dates: Set<string> } | null = null;

  constructor(
    private prisma: PrismaService,
    private rail: RailService,
    private providers: ProviderConfigService,
  ) {}

  /**
   * Live tuning read from admin → Integrations → Live subscription poller
   * (provider key `subscription`). Every knob has an env fallback, so an
   * unconfigured deploy behaves exactly as before this card existed. The
   * ProviderConfigService caches with a 60s TTL, so reading on every 10s
   * tick is effectively free. Missing / non-numeric / <=0 values fall back
   * to defaults so a bad admin entry can't stall the poller.
   */
  private async tuning(): Promise<{
    normalMs: number; fastMs: number; fastWindowMin: number;
    fromMin: number; toMin: number;
  }> {
    let s: Record<string, any> = {};
    try {
      const cfg = await this.providers.effective('subscription');
      s = (cfg?.settings ?? {}) as Record<string, any>;
    } catch { /* provider not configured — env/defaults win */ }
    const positive = (v: any, def: number): number => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : def;
    };
    return {
      normalMs: positive(s.normalSec, Number(process.env.SUBSCRIPTION_NORMAL_SEC) || DEFAULT_NORMAL_SEC) * 1000,
      fastMs: positive(s.fastSec, Number(process.env.SUBSCRIPTION_FAST_SEC) || DEFAULT_FAST_SEC) * 1000,
      fastWindowMin: positive(s.fastWindowMin, Number(process.env.SUBSCRIPTION_FAST_WINDOW_MIN) || DEFAULT_FAST_WINDOW_MIN),
      fromMin: positive(s.fromMin, Number(process.env.SUBSCRIPTION_POLL_FROM_MIN) || DEFAULT_POLL_FROM_MIN),
      toMin: positive(s.toMin, Number(process.env.SUBSCRIPTION_POLL_TO_MIN) || DEFAULT_POLL_TO_MIN),
    };
  }

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
    const t = await this.tuning();
    const mins = ist.hour * 60 + ist.minute;
    if (mins < t.fromMin || mins >= t.toMin) return;     // outside operator-configured window

    await tenantContext.runUnscoped(async () => {
      const sweep = await this.resolveSweep();
      if (!sweep.nse && !sweep.bse) return; // no rail configured → idle

      // holidays (once/day). If the calendar says today is a holiday, stop.
      const holidays = await this.ensureHolidays(ist.ymd);
      if (holidays.has(ist.ymd)) return;

      const ipos = await this.openAutoIpos(ist.ymd);
      if (ipos.length === 0) return;

      const now = Date.now();
      const due = ipos.filter((i) => now - (this.lastFetchAt.get(i.id) ?? 0) >= this.intervalMs(i, ist, t));
      if (due.length === 0) return;

      for (const ipo of due) await this.refreshIpo(ipo, sweep);
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
      let updated = 0;
      for (const ipo of ipos) if (await this.refreshIpo(ipo, sweep)) updated++;
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
      const changed = await this.refreshIpo(ipo, sweep);
      return { ok: true, changed };
    });
  }

  // ── one IPO: fetch BOTH exchanges → 7-cat accumulator → write-on-change ─────
  private async refreshIpo(ipo: OpenIpo, sweep: SweepCreds): Promise<boolean> {
    try {
      // Read the offered-qty inputs alongside `extra` (used for subLog) in one
      // query. shareResv × issueSize/priceBandMax is the denominator for
      // times-subscribed — the NSE ipomaster endpoint doesn't carry it.
      const row = await this.prisma.ipo.findUnique({
        where: { id: ipo.id },
        select: { extra: true, issueSize: true, priceBandMax: true },
      });
      const ex: any = (row?.extra as any) ?? {};
      const offeredByBucket = offeredFromIpo(row?.issueSize as any, row?.priceBandMax as any, ex);

      const nseRows: CatwiseRow[] = [];
      const bseRows: BseDemandRow[] = [];
      if (sweep.nse) {
        try { nseRows.push(...(await this.query.getCatwise(ipo.symbol, sweep.nse))); }
        catch (e: any) { this.log.warn(`${ipo.symbol} NSE: ${e.message}`); }
      }
      if (sweep.bse && sweep.bseToken) {
        try { bseRows.push(...(await this.bseQuery.getDemandSchedule(ipo.symbol, sweep.bseToken, sweep.bse))); }
        catch (e: any) { this.log.warn(`${ipo.symbol} BSE: ${e.message}`); }
      }

      const { buckets } = bucketize(nseRows, bseRows);
      const subs = this.computeSubs(buckets, offeredByBucket, ipo.lotSize ?? undefined, Number(row?.priceBandMax ?? 0) || undefined);
      this.lastFetchAt.set(ipo.id, Date.now());
      if (subs.length === 0) {
        // Either the issue has no demand yet (early minutes), or the IPO row is
        // missing shareResv / issueSize / priceBandMax so we can't derive offered.
        this.log.warn(`${ipo.symbol}: no computable subscription (no demand yet, or missing reservation table / issue size / price band)`);
        return false;
      }
      const now = new Date();
      const snap = JSON.stringify(subs);
      const changed = this.lastSnapshot.get(ipo.id) !== snap;
      if (changed) {
        // Day-wise trend log — one entry per day (the latest snapshot each
        // day wins, capped at 14 days). Front-site detail page's day-wise
        // table reads this. Extra keys ignored by legacy readers.
        const istNow = this.istParts();
        const day = istNow.ymd;
        const pick = (c: string): number | null => { const s = subs.find((x) => x.category === c); return s ? Number(s.timesSubscribed) : null; };
        const snapshot = {
          total: pick('total'), qib: pick('qib'), nii: pick('nii'), retail: pick('retail'),
          hni: pick('hni'), hni2: pick('hni2'),
          employee: pick('employee'), shareholder: pick('shareholder'),
        };
        const subLog = [
          ...(Array.isArray(ex.subLog) ? ex.subLog : []).filter((e: any) => e?.d !== day),
          { d: day, ...snapshot },
        ].slice(-14);

        // Hourly rolling window (2026-09-22 operator ask) — one snapshot per
        // (day, hour). The LATEST snapshot within each hour wins, so the
        // 60s poller writes ~60x per hour but only the last value sticks.
        // Cap at 72 entries = 3 days × 24 hours (operator confirmed).
        // Front-site expands each day-wise row to reveal the hourly trail.
        const hh = String(istNow.hour).padStart(2, '0');
        const t = `${hh}:00`;
        const hourKey = `${day}T${hh}`;
        const subLogHour = [
          ...(Array.isArray(ex.subLogHour) ? ex.subLogHour : [])
            .filter((e: any) => `${e?.d}T${String(e?.t ?? '').slice(0, 2)}` !== hourKey),
          { d: day, t, ...snapshot },
        ].slice(-72);

        await this.prisma.$transaction([
          this.prisma.ipoSubscription.deleteMany({ where: { ipoId: ipo.id } }),
          this.prisma.ipoSubscription.createMany({
            data: subs.map((s) => ({
              ipoId: ipo.id, category: s.category, timesSubscribed: s.timesSubscribed,
              bidCount: s.bidCount, applicationsSubscribed: s.applicationsSubscribed,
              nseShares: s.nseShares, bseShares: s.bseShares,
              nseBids: s.nseBids, bseBids: s.bseBids,
            })),
          }),
          this.prisma.ipo.update({ where: { id: ipo.id }, data: { subscriptionAsOf: now, extra: { ...ex, subLog, subLogHour } } }),
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
  /**
   * Which IPOs are OPEN for polling today.
   *
   * `Ipo.status` is dead per CLAUDE.md — all rows carry `upcoming` and true state
   * is derived at read time. Filtering on `status:'open'` here was matching zero
   * rows, so the poller silently skipped every genuinely-open IPO. Switch to the
   * date window everyone else uses (`stageOf()`): today falls inside
   * `[openDate, closeDate]` (IST calendar). `hidden` rows are excluded — those
   * are bulk-imported drafts the operator hasn't published.
   */
  private async openAutoIpos(istYmd: string, ignoreAutoFlag = false): Promise<OpenIpo[]> {
    // IST midnight → IST end-of-day, represented as the UTC instants that bracket
    // the IST calendar day. IST is UTC+5:30, so IST 2026-09-17 00:00 = UTC 2026-09-16 18:30.
    const istMidnightUtc = new Date(`${istYmd}T00:00:00+05:30`);
    const istEndOfDayUtc = new Date(istMidnightUtc.getTime() + 86_400_000 - 1);
    return this.prisma.ipo.findMany({
      where: {
        openDate: { lte: istEndOfDayUtc },
        closeDate: { gte: istMidnightUtc },
        hidden: false,
        ...(ignoreAutoFlag ? {} : { autoPollSubscription: true }),
      },
      select: { id: true, symbol: true, lotSize: true, openDate: true, closeDate: true },
    });
  }

  /** Per-IPO cadence: tighten to FAST_MS in the last FAST_WINDOW_MIN minutes of the closing day. */
  private intervalMs(
    ipo: OpenIpo,
    ist: IstParts,
    t: { normalMs: number; fastMs: number; fastWindowMin: number },
  ): number {
    if (ipo.closeDate) {
      const closeYmd = this.istYmd(ipo.closeDate);
      // Fast mode from BIDDING close − fastWindowMin (15:30 IST default)
      // and ALL THE WAY through the poller's post-bidding grace hour —
      // the final consolidated numbers are exactly what we want fast.
      if (ist.ymd === closeYmd && ist.hour * 60 + ist.minute >= BIDDING_CLOSE_MIN - t.fastWindowMin) return t.fastMs;
    }
    return t.normalMs;
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

  /**
   * Emit one row per bucket (qib / hni [HNI-Above-10L] / hni2 [HNI-Below-10L] /
   * retail / employee / shareholder) plus a `total` roll-up. Matches ipopremium's
   * category breakdown so the front-site can render "HNI (10L+) / HNI (2-10L)"
   * alongside the combined NII figure. Two metrics per row:
   *   timesSubscribed        = (nseShares + bseShares) ÷ offered[bucket]
   *   applicationsSubscribed = (nseBids   + bseBids  ) ÷ (offered[bucket] ÷ shares-per-app)
   *
   * Shares-per-app varies by bucket:
   *   - Retail / Employee / Shareholder — shares-per-app = `lotSize` (1 lot).
   *   - HNI (10L+ AND 2-10L) — shares-per-app = min shares for a ≥ ₹2 L bid
   *     = ceil(2_00_000 ÷ (lotSize × priceBandMax)) × lotSize. Same divisor
   *     for BOTH HNI categories (matches ipopremium's convention and the
   *     operator's spec on 2026-09-18: e.g. NSE lotSize=8 × price=₹1785 →
   *     15 lots × 8 sh = 120 sh min HNI application).
   *   - QIB — no per-application ratio meaningful (institutional).
   *
   * We also emit a synthetic `nii` row (Big + Small combined) — the compact home
   * card wants one NII line, and the aggregate is cheaper to compute here than
   * to re-derive on the client. Downstream readers pick whichever they need.
   */
  private computeSubs(
    buckets: Map<Bucket, CatAgg>,
    offeredByBucket: Map<Bucket, number> | null,
    lotSize?: number,
    priceBandMax?: number,
  ): SubRow[] {
    if (!offeredByBucket || offeredByBucket.size === 0 || buckets.size === 0) return [];

    // Min shares for a ≥ ₹2 L HNI application. Used as the denominator for
    // applications-for-1× on both HNI categories per operator convention.
    const HNI_MIN_AMOUNT = 200_000;
    const shniMinShares = (lotSize && lotSize > 0 && priceBandMax && priceBandMax > 0)
      ? Math.ceil(HNI_MIN_AMOUNT / (lotSize * priceBandMax)) * lotSize
      : 0;
    const sharesPerApp = (category: string): number => {
      if (category === 'hni' || category === 'hni2' || category === 'nii') return shniMinShares;
      return lotSize && lotSize > 0 ? lotSize : 0;
    };

    interface Rolled { d: number; o: number; b: number; ns: number; bs: number; nb: number; bb: number }
    const zero = (): Rolled => ({ d: 0, o: 0, b: 0, ns: 0, bs: 0, nb: 0, bb: 0 });
    const accum = (r: Rolled, a: CatAgg, offered: number) => {
      r.d += a.nseShares + a.bseShares;
      r.o += offered;
      r.b += a.nseBids + a.bseBids;
      r.ns += a.nseShares;
      r.bs += a.bseShares;
      r.nb += a.nseBids;
      r.bb += a.bseBids;
    };

    const perBucket: Partial<Record<Bucket, Rolled>> = {};
    const totals = zero();
    const nii = zero();  // combined hni + hni2 for compact readers

    for (const [bucket, a] of buckets) {
      const offered = offeredByBucket.get(bucket) ?? 0;
      accum(totals, a, offered);
      if (offered <= 0) continue;
      const r = perBucket[bucket] ??= zero();
      accum(r, a, offered);
      if (bucket === 'hni' || bucket === 'hni2') accum(nii, a, offered);
    }

    const mk = (category: string, r: Rolled): SubRow => {
      const row: SubRow = { category, timesSubscribed: round2(r.d / r.o) };
      if (r.b > 0) row.bidCount = r.b;
      const spa = sharesPerApp(category);
      if (spa > 0 && r.b > 0) {
        const maxAllottees = r.o / spa;
        if (maxAllottees > 0) row.applicationsSubscribed = round2(r.b / maxAllottees);
      }
      // Per-exchange columns — always emit when we saw any demand on that side,
      // so the day-wise report can show a zero-BSE cycle differently from an
      // unknown-BSE cycle.
      if (r.ns > 0) row.nseShares = r.ns;
      if (r.bs > 0) row.bseShares = r.bs;
      if (r.nb > 0) row.nseBids = r.nb;
      if (r.bb > 0) row.bseBids = r.bb;
      return row;
    };

    // Fixed emission order — front-site reads this without re-sorting.
    const order: Bucket[] = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder'];
    const out: SubRow[] = [];
    for (const b of order) {
      const r = perBucket[b];
      if (r && r.o > 0) out.push(mk(b, r));
    }
    if (nii.o > 0) out.push(mk('nii', nii));
    if (totals.o > 0) out.push(mk('total', totals));
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
