/** Derives the per-metric detail shown when an IPO card tile is expanded.
    Everything is computed from the IpoFull fields (band, lot, issue size,
    reservation %, subscription ×, dates) — matches the app mockups. */
import type { IpoFull } from '@/lib/api';
import { computeIssue, rulePackFor, inferRegulationBasis, offerLegFrom, type IssueInputs } from '@investoyard/shared-types';

/**
 * The ₹2 L / ₹10 L band thresholds used to be literals here AND in
 * lib/api.ts AND in mobile. They now come from the rule pack, so a
 * regulatory change is one edit in packages/shared-types/src/issueRules.ts.
 */
function packFor(ipo: IpoFull) {
  const sr: any = (ipo as any).extra?.shareResv;
  const qib = Number(String(sr?.qib?.pct ?? '').replace(/[^\d.]/g, '')) || 0;
  const ex: any = (ipo as any).extra ?? {};
  return rulePackFor(
    ipo.type === 'sme' ? 'sme' : 'mainboard',
    ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    ex.regulationBasis || inferRegulationBasis(qib),
  );
}

/**
 * Map an IPO onto the engine's inputs. ONE mapper for the whole web app —
 * lib/api.ts calls this too, so the public figures and the admin/card panels
 * can no longer be derived from differently-shaped inputs.
 */
export function issueInputsFor(ipo: IpoFull): IssueInputs {
  const ex: any = (ipo as any).extra ?? {};
  const sr: any = ex.shareResv ?? {};
  const pct = (k: string) => { const r = sr[k]; const v = Number(String(r?.pct ?? '').replace(/[^\d.]/g, '')); return r?.on && Number.isFinite(v) ? v : 0; };
  return {
    board: ipo.type === 'sme' ? 'sme' : 'mainboard',
    mechanism: ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    regulationBasis: ex.regulationBasis || undefined,
    lotSize: ipo.lotSize,
    priceFloor: ipo.priceBandMin,
    priceCap: ipo.priceBandMax ?? ipo.priceBandMin,
    issueSizeCr: parseIssueValue(ipo.issueSize) / 1e7 || undefined,
    // the stated count outranks the ₹ total — see IssueInputs.totalShares
    totalShares: Number(ex.totalShares) || undefined,
    // read through offerLegFrom — the importer stores these as flat keys the
    // engine never saw, which hid a fresh-issue count on 596 records
    fresh: offerLegFrom(ex, 'fresh'),
    ofs: offerLegFrom(ex, 'ofs'),
    reservation: { qib: pct('qib'), hni: pct('hni'), hni2: pct('hni2'), retail: pct('retail'), employee: pct('employee'), shareholder: pct('shareholder'), other: pct('other') },
    discounts: { retail: Number(ex.retailDiscount) || 0 },
    // pctOfQib drives the split; shares/price record what the book actually took
    anchor: Number(ex.anchorPct) || Number(ex.anchorShares)
      ? {
          pctOfQib: Number(ex.anchorPct) || undefined,
          mfPct: Number(ex.anchorMfPct) || undefined,
          shares: Number(ex.anchorShares) || undefined,
          price: Number(ex.anchorPrice) || undefined,
        }
      : undefined,
  };
}

/** The single derivation for this IPO. */
export const derive = (ipo: IpoFull) => computeIssue(issueInputsFor(ipo));

export function parseIssueValue(s?: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*Cr/i);
  if (m) return parseFloat(m[1]) * 1e7;
  const n = s.replace(/[^\d.]/g, '');
  return n ? parseFloat(n) : 0;
}
export function crOrInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
const up = (ipo: IpoFull) => ipo.priceBandMax ?? ipo.priceBandMin ?? 0;

export interface AppBand { cat: string; sub: string; lots: number; amount: number; }
export function applicationBands(ipo: IpoFull): AppBand[] {
  const perLot = (ipo.lotSize ?? 0) * up(ipo);
  if (!perLot) return [];
  const th = packFor(ipo).thresholds;
  // one more lot than fits under the threshold — the bands are STRICT
  const lotsAbove = (amt?: number) => (amt ? Math.floor(amt / perLot) + 1 : 1);
  const hni1 = lotsAbove(th.hni2?.above);
  const hni2 = lotsAbove(th.hni?.above);
  return [
    { cat: 'Retail', sub: 'upto ₹2 L', lots: 1, amount: perLot },
    { cat: 'HNI 1', sub: '₹2 L – ₹10 L', lots: hni1, amount: hni1 * perLot },
    { cat: 'HNI 2', sub: 'above ₹10 L', lots: hni2, amount: hni2 * perLot },
  ];
}

export interface LotRow { cat: string; sub: string; lots: number; shares: number; amount: number; }
export function lotLadder(ipo: IpoFull): LotRow[] {
  const lot = ipo.lotSize ?? 0;
  const perLot = lot * up(ipo);
  if (!perLot) return [];
  const th = packFor(ipo).thresholds;
  const rMax = Math.max(1, Math.floor((th.hni2?.above ?? 0) / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor((th.hni?.above ?? 0) / perLot));
  const bMin = sMax + 1;
  const mk = (cat: string, sub: string, lots: number): LotRow => ({ cat, sub, lots, shares: lots * lot, amount: lots * perLot });
  return [
    mk('Retail', 'Up to ₹2 L', 1),
    mk('Retail', 'Up to ₹2 L', rMax),
    mk('S-HNI', '₹2 L to ₹10 L', sMin),
    mk('S-HNI', '₹2 L to ₹10 L', sMax),
    mk('B-HNI', 'Above ₹10 L', bMin),
  ];
}

export interface ResRow { key: string; cat: string; pct: number; shares: number; amount: number; }
/**
 * Reservation bar segments — one per category, summing to ≈100%.
 *
 * DIRECT read of `extra.shareResv` (the operator's own table), not through
 * the shared engine — that engine's residual allocator has been synthesizing
 * a duplicate `nii` roll-up when both `hni` and `hni2` are present (visual
 * bug: total > 100%, 2026-09-22 operator report on NSE). Reading the table
 * directly avoids that: we take what the operator entered, no residuals.
 *
 * Rules:
 *   • Drop the synthetic `nii` row when BOTH split rows (`hni` + `hni2`) are
 *     present — otherwise it double-counts HNI demand (10% + 5% + 15% = 30%
 *     for the same slice).
 *   • For any row with a blank `pct` but a real `sharesLower`, derive the
 *     pct as `sharesLower ÷ totalShares × 100`. Skip if both are missing.
 *   • Label rows via `subCatLabel()` so the bar reads "HNI (10L+)" / "HNI
 *     (2-10L)" / "Retail" — matching the subscription page's vocabulary
 *     (was showing raw "HNI2" / uppercased "RETAIL").
 */
export function reservation(ipo: IpoFull): ResRow[] {
  const priceMax = up(ipo) || 1;
  const totalShares = parseIssueValue(ipo.issueSize) / priceMax || 0;
  const resv: any = (ipo as any).extra?.shareResv;
  if (resv && typeof resv === 'object') {
    const hasHni = !!(resv.hni && (Number(resv.hni.sharesLower) > 0 || Number(resv.hni.sharesUpper) > 0 || Number(resv.hni.pct) > 0));
    const hasHni2 = !!(resv.hni2 && (Number(resv.hni2.sharesLower) > 0 || Number(resv.hni2.sharesUpper) > 0 || Number(resv.hni2.pct) > 0));
    const buckets = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder', 'other'];
    const rows: ResRow[] = [];
    for (const k of buckets) {
      // Dedupe synthetic 'nii' — but we don't iterate 'nii' anyway (not in
      // the operator's table). Kept below for completeness in case a caller
      // extends the buckets list.
      if (k === ('nii' as any) && hasHni && hasHni2) continue;
      const row = resv[k];
      if (!row || row.on === false) continue;
      const shares = Number(row.sharesLower) > 0
        ? Number(row.sharesLower)
        : Number(row.sharesUpper) > 0 ? Number(row.sharesUpper) : 0;
      let pct = Number(row.pct);
      if (!Number.isFinite(pct) || pct <= 0) {
        // pct blank — derive from sharesLower ÷ totalShares (2026-09-22 fix:
        // Employee had sharesLower=433437 but pct='' → an earlier engine
        // gave it a phantom 5%. Deriving from what's actually entered is
        // honest; skip if neither is present).
        pct = totalShares > 0 && shares > 0
          ? +((shares / totalShares) * 100).toFixed(2)
          : 0;
      }
      if (pct <= 0 && shares <= 0) continue;
      const amount = pct > 0 ? (parseIssueValue(ipo.issueSize) * pct) / 100 : shares * priceMax;
      const effShares = shares > 0 ? shares : Math.round((totalShares * pct) / 100);
      rows.push({ key: k, cat: subCatLabel(k), pct, shares: effShares, amount });
    }
    if (rows.length) return rows;
  }
  // no reservation table yet — fall back to the exchange's own category split
  const total = parseIssueValue(ipo.issueSize);
  if (!total) return [];
  const rows = (ipo.subscription ?? []).filter((r) => r.category !== 'total' && r.category !== 'nii');
  if (!rows.length) return [];
  return rows
    .map((r) => {
      const pct = (r as any).reservedPct ?? 0;
      const amount = (total * pct) / 100;
      return { key: r.category, cat: subCatLabel(r.category), pct, shares: Math.round(amount / priceMax), amount };
    })
    .filter((r) => r.pct > 0); // an all-zero table would render an empty bar
}

export interface SubRowT {
  /** Bucket key from the API — one of qib/hni/hni2/nii/retail/employee/shareholder/total. */
  key: string;
  /** Display label — "QIB" / "HNI (10L+)" / "HNI (2-10L)" / "Retail" / etc. */
  cat: string;
  bookSize: number;
  subscribed: number;
  times: number;
  /** Applications-wise times (bids ÷ max allottees) — drives the second
   * ipopremium-style breakup table under the shares grid. Overridden on the
   * front side using the correct per-bucket shares-per-app divisor so the
   * display updates without waiting for a pool cycle. */
  applicationsTimes?: number;
  bidCount?: number;
  /** Applications-for-1× — `bookSize ÷ shares-per-app-for-this-bucket`.
   * shares-per-app = `lotSize` for Retail/Employee, `sHNI-min` for HNI/HNI2
   * (min shares for a ≥ ₹2 L bid). Computed here so all display sites read
   * the same value. */
  req1x?: number;
  /** Per-exchange breakdown (shares demanded) — present once the API is
   * populating the new IpoSubscription columns; both undefined = legacy row. */
  nseShares?: number;
  bseShares?: number;
  /** Per-exchange bid/application counts — BSE is derived (see subscription.service.ts). */
  nseBids?: number;
  bseBids?: number;
}
/** Category label as the ipopremium-style breakup shows it. */
export function subCatLabel(key: string): string {
  switch (key) {
    case 'qib': return 'QIB';
    case 'hni': return 'HNI (10L+)';
    case 'hni2': return 'HNI (2-10L)';
    case 'nii': return 'NII';
    case 'retail': return 'Retail';
    case 'employee': return 'Employee';
    case 'shareholder': return 'Shareholder';
    case 'total': return 'Total';
    default: return key.toUpperCase();
  }
}
/** Direct offered-share count on a shareResv row — prefers `sharesLower`,
 *  falls back to `sharesUpper` (two data-entry conventions in the wild).
 *  Zero when neither is a real number. Mirrors the API poller's `directOf`. */
function directOffered(row: any): number {
  const lower = Number(row?.sharesLower);
  if (lower > 0) return lower;
  const upper = Number(row?.sharesUpper);
  if (upper > 0) return upper;
  return 0;
}

/** Per-bucket offered shares for an IPO — mirrors apps/api's `offeredFromIpo`
 *  so the front-site Book Size can never disagree with the poller's times.
 *  Same three-tier resolution: direct `sharesLower/Upper` first, then
 *  self-consistent `derivedTotal × pct`, then `issueSize/price × pct` last.
 *  Also emits `nii` = hni + hni2 for the synthetic combined "HNI" row. */
export function offeredByBucket(ipo: IpoFull): Record<string, number> {
  const resv: any = (ipo as any).extra?.shareResv;
  if (!resv || typeof resv !== 'object') return {};
  const BUCKETS = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder'];
  // Derive a self-consistent total from any bucket with both shares + pct.
  // Take the LARGEST implied total so a mis-entered small bucket doesn't
  // shrink the divisor for the others.
  let derivedTotal = 0;
  for (const b of BUCKETS) {
    const row = resv[b]; if (!row) continue;
    const shares = directOffered(row);
    const pct = Number(row.pct);
    if (shares > 0 && pct > 0) {
      const implied = shares / (pct / 100);
      if (implied > derivedTotal) derivedTotal = implied;
    }
  }
  // Last-resort fallback — raw issueSize ÷ priceMax.
  if (derivedTotal <= 0) {
    const total = parseIssueValue(ipo.issueSize);
    const priceMax = up(ipo);
    if (total && priceMax) derivedTotal = total / priceMax;
  }
  const out: Record<string, number> = {};
  for (const b of BUCKETS) {
    const row = resv[b]; if (!row || row.on === false) continue;
    const direct = directOffered(row);
    if (direct > 0) { out[b] = direct; continue; }
    const pct = Number(row.pct);
    if (pct > 0 && derivedTotal > 0) out[b] = (derivedTotal * pct) / 100;
  }
  // Synthetic combined HNI (nii) row — used by ShareWisePanel when both
  // split rows are present.
  if (out.hni > 0 && out.hni2 > 0) out.nii = out.hni + out.hni2;
  else if (out.hni > 0) out.nii = out.hni;
  else if (out.hni2 > 0) out.nii = out.hni2;
  return out;
}

export function subscriptionTable(ipo: IpoFull): { rows: SubRowT[]; total: SubRowT } | null {
  const total = parseIssueValue(ipo.issueSize);
  // Drop `total` (rendered separately). Keep the synthetic `nii` roll-up ONLY
  // when BOTH split rows (`hni` and `hni2`) are present — Share-wise renders
  // `nii` as a combined "HNI" subtotal above the two split rows (operator
  // spec, 2026-09-18). If only one split row exists, `nii` = that same value,
  // and rendering both would duplicate — so drop it in that case.
  const all = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  const hasHni = all.some((r) => r.category === 'hni');
  const hasHni2 = all.some((r) => r.category === 'hni2');
  const subs = (hasHni && hasHni2) ? all : all.filter((r) => r.category !== 'nii');
  if (!subs.length || !total) return null;
  const totalShares = total / (up(ipo) || 1);
  // Book Size sourced from OUR operator-entered shareResv (sharesLower or
  // sharesUpper). Falls back to `totalShares × reservedPct / 100` only when
  // the shareResv doesn't produce a bucket value — this stops the display
  // from disagreeing with what the operator typed.
  const offered = offeredByBucket(ipo);
  // Shares-per-application divisor (see SubRowT.req1x doc). Retail uses
  // `lotSize` (SEBI's strict 1-lot minimum for retail bids); HNI (both
  // 10L+ and 2-10L) use the min shares needed for a ≥ ₹2 L bid =
  // ceil(2L ÷ (lot × priceMax)) × lot. Employee / Shareholder have no
  // standard minimum-bid rule that would let us derive "applications for
  // 1×" — bidding patterns vary too widely — so we return 0 and let the
  // display show 0 for both Req 1× and Times columns (operator ask,
  // 2026-09-21, matching what other IPO information sources show).
  const lot = ipo.lotSize ?? 0;
  const priceMax = up(ipo);
  const shniMin = lot > 0 && priceMax > 0
    ? Math.ceil(200_000 / (lot * priceMax)) * lot
    : 0;
  const sharesPerApp = (cat: string): number => {
    if (cat === 'hni' || cat === 'hni2' || cat === 'nii') return shniMin;
    if (cat === 'retail') return lot > 0 ? lot : 0;
    // employee / shareholder / other → not derivable → 0
    return 0;
  };
  // Anchor-share deduction — QIB rows are stored GROSS (matching how the
  // reservation table reads: "QIB (Anchor Included) 50% of the offer, N
  // Shares"). Exchange APIs report QIB `timesSubscribed` against NET QIB
  // (anchor is pre-allocated, never enters the public bidding window), so
  // Book Size × Times only cross-checks with Subscribed when Book is also
  // NET. Deduction reads the operator's own values — `extra.anchorShares`
  // first, else `extra.anchorPct` × gross QIB / 100. If the operator hasn't
  // entered either, we leave gross alone rather than assume 60% — a silent
  // no-op is safer than fabricating a deduction (operator ask, 2026-09-21).
  const ex: any = (ipo as any).extra ?? {};
  const anchorSharesInput = Number(ex.anchorShares) || 0;
  const anchorPctInput = Number(ex.anchorPct) || 0;
  const rows: SubRowT[] = subs.map((r) => {
    // grossBook is what the reservation table gave the bucket, exchange-side
    // (QIB includes anchor here — that matches how NSE/BSE report `times`
    // for the QIB category: `times = actual_bids ÷ gross_QIB`).
    const grossBook = offered[r.category] ?? (totalShares * (r.reservedPct ?? 0)) / 100;
    // Displayed Book Size — net of anchor for QIB (operator ask, 2026-09-21).
    // Other buckets don't have anchor, so book == grossBook.
    let book = grossBook;
    if (r.category === 'qib' && book > 0) {
      const deduct = anchorSharesInput > 0
        ? anchorSharesInput
        : anchorPctInput > 0 ? Math.round((book * anchorPctInput) / 100) : 0;
      if (deduct > 0 && deduct < book) book = book - deduct;
    }
    // Subscribed = ACTUAL bid shares from the exchange side.
    // Prefer the raw per-exchange totals the poller records (nse+bse); fall
    // back to `grossBook × exchange_times` when a legacy row doesn't carry
    // the split. NEVER `netBook × times` — the exchange's `times` is against
    // GROSS QIB (anchor inclusive), so multiplying by net undercounts QIB
    // bids by the anchor portion (~60%). That was the 2026-09-21 report:
    // sir saw 12.77 Cr shown for an actual 31.97 Cr QIB subscription.
    const nseSh = Number((r as any).nseShares || 0);
    const bseSh = Number((r as any).bseShares || 0);
    const actualBidShares = (nseSh + bseSh) > 0
      ? nseSh + bseSh
      : Math.round(grossBook * r.timesSubscribed);
    // Displayed times — recomputed from what we show, so Book × Times ==
    // Subscribed always cross-checks. For QIB with net Book this yields a
    // HIGHER value than the exchange's raw `timesSubscribed` (which is
    // against gross); that's the honest oversubscription against
    // truly-available shares. For every other bucket book === grossBook and
    // this equals r.timesSubscribed anyway.
    const displayTimes = book > 0
      ? +(actualBidShares / book).toFixed(2)
      : r.timesSubscribed;
    // req1x = book ÷ shares-per-app-for-bucket. Re-derived here so it's
    // right even when the API's `applicationsSubscribed` still reflects
    // the old lot-size-for-everyone divisor (fixed 2026-09-18 spec).
    // When sharesPerApp returns 0 (employee / shareholder — no standard
    // minimum-bid rule) we do NOT derive: req1x stays 0 and Times stays 0
    // on those rows, matching how other IPO information sources show
    // these categories (operator ask, 2026-09-21).
    const spa = sharesPerApp(r.category);
    const canDerive = spa > 0;
    const req1xVal = canDerive && book > 0 ? Math.round(book / spa) : 0;
    // applicationsTimes = bidCount ÷ req1x. Falls back to the API's value
    // ONLY for derivable categories — for non-derivable ones we force 0.
    const bidCount = (r as any).bidCount as number | undefined;
    const localAppTimes = canDerive && req1xVal > 0 && bidCount != null
      ? +(bidCount / req1xVal).toFixed(2)
      : undefined;
    // For non-derivable categories (employee / shareholder) force Times to 0
    // rather than falling back to the API's `applicationsSubscribed` — those
    // rows show 0 for both Req 1× and Times per the operator ask.
    const applicationsTimesVal = canDerive
      ? (localAppTimes ?? (r as any).applicationsSubscribed)
      : 0;
    return {
      key: r.category,
      cat: subCatLabel(r.category),
      bookSize: Math.round(book),
      subscribed: actualBidShares,
      times: displayTimes,
      applicationsTimes: applicationsTimesVal,
      bidCount,
      req1x: req1xVal,
      nseShares: (r as any).nseShares,
      bseShares: (r as any).bseShares,
      nseBids: (r as any).nseBids,
      bseBids: (r as any).bseBids,
    };
  });
  // Total sums SKIP the synthetic `nii` row when both hni + hni2 are present
  // — otherwise HNI demand double-counts (once via the parent combined row,
  // once via each split row). The API's raw `total` row is the authoritative
  // times value; we prefer it over the locally-computed ratio.
  const summable = rows.filter((r) => r.key !== 'nii');
  const bookSum = summable.reduce((a, b) => a + b.bookSize, 0);
  const subSum = summable.reduce((a, b) => a + b.subscribed, 0);
  // Roll per-exchange totals across categories — used by the "NSE / BSE split"
  // footnote in <LiveSubscription>. Any category without the breakdown
  // (legacy row) contributes 0; the footnote hides itself when both are 0.
  const nseSum = summable.reduce((a, b) => a + (b.nseShares ?? 0), 0);
  const bseSum = summable.reduce((a, b) => a + (b.bseShares ?? 0), 0);
  const nseBidSum = summable.reduce((a, b) => a + (b.nseBids ?? 0), 0);
  const bseBidSum = summable.reduce((a, b) => a + (b.bseBids ?? 0), 0);
  const bidSum = summable.reduce((a, b) => a + (b.bidCount ?? 0), 0);
  // Total times = subSum / bookSum, so the displayed Total row cross-checks
  // exactly the same way category rows do (Book × Times == Subscribed).
  // The poller ships an `apiTotal` row too — kept as a last-resort fallback
  // for legacy rows that don't carry per-exchange share splits — but we
  // prefer the derived value because the poller's total is against GROSS
  // QIB and would disagree with the categories now that QIB Book Size shows
  // NET (operator ask, 2026-09-21).
  const apiTotal = (ipo.subscription ?? []).find((r) => r.category === 'total');
  const totalTimes = bookSum > 0
    ? +(subSum / bookSum).toFixed(2)
    : (apiTotal ? Number(apiTotal.timesSubscribed) : 0);
  return {
    rows,
    total: {
      key: 'total',
      cat: 'Total',
      bookSize: bookSum,
      subscribed: subSum,
      times: totalTimes,
      bidCount: bidSum > 0 ? bidSum : undefined,
      nseShares: nseSum > 0 ? nseSum : undefined,
      bseShares: bseSum > 0 ? bseSum : undefined,
      nseBids: nseBidSum > 0 ? nseBidSum : undefined,
      bseBids: bseBidSum > 0 ? bseBidSum : undefined,
    },
  };
}

export interface TlItem { label: string; date?: string; }
function addDays(d?: string, n = 1): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function timeline(ipo: IpoFull): TlItem[] {
  return [
    { label: 'Open date', date: ipo.openDate },
    { label: 'Close date', date: ipo.closeDate },
    { label: 'Basis of allotment', date: ipo.allotmentDate },
    { label: 'Initiation of refunds', date: addDays(ipo.allotmentDate, 1) },
    { label: 'Credit to demat', date: addDays(ipo.allotmentDate, 1) },
    { label: 'Listing date', date: ipo.listingDate },
  ];
}
