/**
 * EVERY DERIVED IPO FIGURE THE READER SEES — Book Size, subscription multiples,
 * the lot ladder, the reservation split, the anchor deduction and the timeline.
 *
 * WHY IT IS HERE AND NOT IN A UI FOLDER (moved out of apps/web/lib/ipoCalc.ts
 * on 2026-10-07). It lived in web, and mobile carried its own copies of three of
 * these functions — copies that had never received the September rebuild. The
 * consequence was not drift in the abstract: MOBILE WAS SHOWING INVESTORS WRONG
 * NUMBERS.
 *
 *   • Its subscriptionTable ignored the record's reservation table entirely and
 *     divided a hardcoded { qib: 50, nii: 15, retail: 35 }. The map has no key
 *     for hni, hni2, shareholder or policyholder, so all four rendered a Book
 *     Size of ZERO — 59 rows across 24 + 24 + 10 + 1 IPOs — and SME rendered a
 *     zero QIB because the SME map literally says qib: 0.
 *   • No anchor was ever deducted, so QIB was always gross.
 *   • No carve-out was ever counted, so a reserved quota had no Book Size.
 *   • Its lotLadder always returned the five-row MAINBOARD shape, so an SME
 *     issue showed Retail at ONE lot where the minimum is two.
 *
 * This is the fifth time the same shape has cost something — three mappers into
 * computeIssue, four readers of sharesUpper, two wrong copies of
 * minApplicationShares, offerTotals stranded inside IpoForm where nothing could
 * test it — and it keeps proving the rule already in CLAUDE.md: a derived figure
 * used by more than one surface belongs in ONE helper. Web and mobile both
 * re-export from here now and neither holds arithmetic of its own.
 *
 * Verified on the move: the output of all five entry points was captured across
 * every one of the 1,269 visible records before and after, and is IDENTICAL.
 * Nothing web publishes moved; mobile simply started agreeing with it.
 */
import { computeIssue, type IssueInputs } from './computeIssue';
import { rulePackFor, inferRegulationBasis } from './issueRules';
import { carveoutAt, CARVEOUT_KEYS } from './carveouts';
import { minApplicationShares, minApplicationLots } from './minApplication';
import { issueInputsFrom, parseIssueSizeRupees, type IssueInputSource } from './issueInputs';
/* TYPE-only, and from the barrel on purpose: `SubscriptionRow` is declared in
   index.ts, which re-exports this file. A value import would be a cycle; a type
   import is erased at compile time and cannot be one. */
import type { SubscriptionRow } from './index';

/**
 * The fields these derivations read — ten of them, structural on purpose,
 * because web and mobile hold differently-shaped IpoFull types over the same
 * API response and neither should have to change to use this.
 */
/**
 * A subscription row as the API hands it over, plus the `reservedPct` that
 * `enrich()` attaches on each surface. It is a FALLBACK only — `offeredByBucket`
 * answers first, and this is what remains for a record with no reservation
 * table. Mobile used to treat it as the primary source, which is how a
 * hardcoded 50/15/35 ended up on investors' screens.
 */
export type DerivedSubRow = SubscriptionRow & { reservedPct?: number };

export interface IpoDerivationSource extends IssueInputSource {
  subscription?: DerivedSubRow[];
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
}

/** Local alias so the body below reads as it always has. */
type IpoFull = IpoDerivationSource;

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
 * Map an IPO onto the engine's inputs.
 *
 * NOW A ONE-LINE DELEGATION to `issueInputsFrom()` in shared-types (2026-10-03).
 * It used to be spelled out here, and spelled out AGAIN in
 * `apps/mobile/lib/ipoCalc.ts` under a comment claiming the two mirrored each
 * other. They did not: this copy passed `instrument` and not `policyholder`,
 * mobile passed `policyholder` and not `instrument`, and NEITHER passed
 * `carveouts` — so everything built on `derive()` split the GROSS offer. The
 * shared version has 19 tests built from the RUNWALENTR and SAIURJA records;
 * read the note at the top of that file before changing any of this.
 */
export function issueInputsFor(ipo: IpoFull): IssueInputs {
  return issueInputsFrom(ipo as IssueInputSource);
}

/** The single derivation for this IPO. */
export const derive = (ipo: IpoFull) => computeIssue(issueInputsFor(ipo));

/** One parser, shared with mobile and with the mapper above. */
export const parseIssueValue = (s?: string | number | null): number => parseIssueSizeRupees(s);
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
  const isSme = ipo.type === 'sme';
  const mk = (cat: string, sub: string, lots: number): LotRow => ({ cat, sub, lots, shares: lots * lot, amount: lots * perLot });
  if (isSme) {
    // SEBI SME framework (post-2024 amendment, operator ask 2026-09-22):
    // retail min is 2 lots — not the 1-lot mainboard convention. sHNI = min
    // bid above retail cutoff (2 + 1 lot at least, or wherever ₹2 L would
    // land, whichever is higher). bHNI = first lot count where the bid
    // amount crosses ₹10 L. Single-row-per-category ladder (no min-max
    // range) because SME retail is effectively a fixed 2-lot bid.
    // Same source as subscriptionTable's Req 1× and the card's formsFor1x —
    // this function had the right answer and the other two did not.
    const mlots = (cat: string) => minApplicationLots(cat, { lotSize: lot, priceCap: up(ipo), sme: true });
    const indMin = mlots('retail');
    const sMin = mlots('hni2');
    const bMin = mlots('hni');
    return [
      mk('Individual', 'up to ₹2 L', indMin),
      mk('sHNI', '₹2 L to ₹10 L', sMin),
      mk('bHNI', 'Above ₹10 L', bMin),
    ];
  }
  const rMax = Math.max(1, Math.floor((th.hni2?.above ?? 0) / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor((th.hni?.above ?? 0) / perLot));
  const bMin = sMax + 1;
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
 *     pct as `shares ÷ totalShares × 100` (upper band, see below). Skip if both are missing.
 *   • Label rows via `subCatLabel()` so the bar reads "HNI (10L+)" / "HNI
 *     (2-10L)" / "Retail" — matching the subscription page's vocabulary
 *     (was showing raw "HNI2" / uppercased "RETAIL").
 */
/**
 * Total offered shares at the UPPER band.
 *
 * The offer document's own share count wins over `₹ total ÷ price` whenever
 * the operator has entered it — the form's field says so, `issueInputsFor()`
 * has always honoured it, and until 2026-09-24 nothing on the public side did.
 * That left the admin screen and the subscription page derived from two
 * different totals: VARMORA's stated 4,78,38,855 against 4,78,39,155 from
 * ₹708.02 Cr ÷ 148, a 300-share gap that showed up as 303 on QIB.
 *
 * The stated count is also the more accurate of the two — it is the figure the
 * exchanges and every information site publish, and it involves no division to
 * round, which is where the ₹-derived path loses its last few hundred shares.
 */
export function totalOfferedShares(ipo: IpoFull): number {
  const stated = Number(String((ipo as any).extra?.totalShares ?? '').replace(/[,\s]/g, ''));
  if (Number.isFinite(stated) && stated > 0) return stated;
  const priceMax = up(ipo);
  /* ROUNDED. You cannot offer 0.1976 of a share, and the raw quotient was the
     third of three disagreeing totals: the admin form now derives
     round(₹ ÷ upper band) and persists it, while `computeIssue` floors its own
     fallback to a lot. For a record the form has not touched this at least puts
     the public page on the same whole number the form would have written —
     ₹90.17 Cr ÷ ₹167 = 53,99,401, not 53,99,401.1976. */
  return priceMax > 0 ? Math.round(parseIssueValue(ipo.issueSize) / priceMax) : 0;
}

export function reservation(ipo: IpoFull): ResRow[] {
  const priceMax = up(ipo) || 1;
  const totalShares = totalOfferedShares(ipo);
  const resv: any = (ipo as any).extra?.shareResv;
  if (resv && typeof resv === 'object') {
    const hasHni = !!(resv.hni && (Number(resv.hni.sharesLower) > 0 || Number(resv.hni.sharesUpper) > 0 || Number(resv.hni.pct) > 0));
    const hasHni2 = !!(resv.hni2 && (Number(resv.hni2.sharesLower) > 0 || Number(resv.hni2.sharesUpper) > 0 || Number(resv.hni2.pct) > 0));
    const buckets = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder', 'policyholder', 'other'];
    const rows: ResRow[] = [];
    for (const k of buckets) {
      // Dedupe synthetic 'nii' — but we don't iterate 'nii' anyway (not in
      // the operator's table). Kept below for completeness in case a caller
      // extends the buckets list.
      if (k === ('nii' as any) && hasHni && hasHni2) continue;
      const row = resv[k];
      if (!row || row.on === false) continue;
      /* UPPER band first — the same precedence `directOffered()` / `directOf()`
         already use, and the industry convention: exchanges, Chittorgarh,
         Bumtaria and IPOPremium all publish the offered count at the cap price.
         This preferred `sharesLower` until 2026-09-28, so the detail page's
         reservation legend ran 5–7% high on every record that stores both
         bands — all 37 recent ones — and disagreed with the Live Subscription
         panel on the SAME page, which has always read `sharesUpper`.
         RUNWALENTR's legend said QIB 85.6 L beside a Book Size of 81.4 L gross.
         It also fixes the derived `pct` below: dividing a FLOOR-band count by
         a CAP-band total overstated the percentage by the width of the band. */
      const shares = Number(row.sharesUpper) > 0
        ? Number(row.sharesUpper)
        : Number(row.sharesLower) > 0 ? Number(row.sharesLower) : 0;
      /*
       * THE COUNT DECIDES THE PERCENTAGE (2026-10-09). This used to print the
       * stored `pct` whenever one existed and only derive when it was blank —
       * and the two are on DIFFERENT BASES. An operator's percentage is the
       * ICDR split, a share of the NET offer; the count beside it is a share of
       * the GROSS. So SPECTRAA printed `QIB 49.95%` next to a count that is
       * 47.42% of the issue size: the percentage and the number on its own row
       * disagreed, on 7 records.
       *
       * Deriving from the count fixes that and makes the column reconcile to
       * the issue size, which is the basis every reference publishes (verified
       * against IPOPremium's RKFAL table: QIB 1.01%, Individual 56.32% — ours
       * to the digit). The stored percentage is still the fallback for a record
       * that has percentages and no counts yet.
       */
      let pct = totalShares > 0 && shares > 0
        ? +((shares / totalShares) * 100).toFixed(2)
        : Number(row.pct);
      if (!Number.isFinite(pct) || pct <= 0) pct = 0;
      if (pct <= 0 && shares <= 0) continue;
      const amount = pct > 0 ? (parseIssueValue(ipo.issueSize) * pct) / 100 : shares * priceMax;
      const effShares = shares > 0 ? shares : Math.round((totalShares * pct) / 100);
      rows.push({ key: k, cat: subCatLabel(k), pct, shares: effShares, amount });
    }

    /*
     * CARVE-OUT ROWS — the reason this table did not add up to the issue size.
     *
     * A preferential reservation lives in `extra.carveouts`, never in
     * `shareResv`, and the bucket list above does not even contain
     * `marketmaker`. So on RKFAL the legend showed four rows summing to 94.97%
     * and the missing 5.02% WAS the market maker — the operator's report, and
     * the last of the carve-out blind spots.
     *
     * Appended after the split rows, which is also the order IPOPremium and
     * Chittorgarh print them in: the split first, then what came off the top.
     * Skipped when the same category is already present as a `shareResv` row
     * with a count, so a legacy record that holds its employee quota in the
     * table is not counted twice.
     */
    const already = new Set(rows.filter((r) => r.shares > 0).map((r) => r.key));
    for (const key of CARVEOUT_KEYS) {
      if (already.has(key)) continue;
      const { shares, rupees } = carveoutAt(key, ((ipo as any).extra ?? {}) as any, priceMax);
      if (shares <= 0) continue;
      rows.push({
        key,
        cat: subCatLabel(key),
        pct: totalShares > 0 ? +((shares / totalShares) * 100).toFixed(2) : 0,
        shares,
        // Its OWN price — a discounted quota valued at the band price reads high.
        amount: rupees,
      });
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
  /** ₹ per share for THIS category — band price less its own discount. Use it
   *  rather than the issue's price when valuing a row, or a discounted quota
   *  (employee / shareholder / retail) reads high. */
  price?: number;
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
    case 'policyholder': return 'Policyholder';
    // "Market maker", the wording every reference uses (IPOPremium,
    // Chittorgarh). Without this case it fell through to `key.toUpperCase()`
    // and would have rendered "MARKETMAKER".
    case 'marketmaker': return 'Market maker';
    case 'total': return 'Total';
    default: return key.toUpperCase();
  }
}
/** Direct offered-share count on a shareResv row.
 *
 * Prefers `sharesUpper` (industry convention on Bumtaria / Chittorgarh /
 * IPOPremium and the offered-shares figure the exchanges' own subscription
 * APIs report — shares at the upper band). Falls back to `sharesLower`
 * (NSE PREANCHOR prints figures at the lower band) for records that only
 * have preanchor data. Zero when neither is a real number.
 *
 * Was preferring sharesLower until 2026-09-22 — flipped when the reservation
 * normalisation script rewrote both bands from the operator's percentages so
 * every IPO's shareResv holds both bands cleanly. sharesUpper is now the
 * authoritative field. */
function directOffered(row: any): number {
  const upper = Number(row?.sharesUpper);
  if (upper > 0) return upper;
  const lower = Number(row?.sharesLower);
  if (lower > 0) return lower;
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
  const BUCKETS = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder', 'policyholder'];
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
  // Last-resort fallback — the stated share count, else raw issueSize ÷ priceMax.
  if (derivedTotal <= 0) derivedTotal = totalOfferedShares(ipo);
  const out: Record<string, number> = {};
  for (const b of BUCKETS) {
    const row = resv[b]; if (!row || row.on === false) continue;
    const direct = directOffered(row);
    if (direct > 0) { out[b] = direct; continue; }
    const pct = Number(row.pct);
    if (pct > 0 && derivedTotal > 0) out[b] = (derivedTotal * pct) / 100;
  }
  /* CARVE-OUTS. Employee, shareholder and policyholder reservations come off
     the top and are
     stored in `extra.carveouts`, never in `shareResv` — so a category with a
     real reserved quota had no Book Size here and the Share-wise panel simply
     omitted the row. RUNWALENTR reserves 1,20,275 employee shares and showed no
     employee line at all (operator, 2026-09-28). A typed `shareResv` count
     still wins; this only fills what that table does not cover. */
  const priceMax = up(ipo);
  if (priceMax > 0) {
    for (const key of ['employee', 'shareholder', 'policyholder'] as const) {
      if ((out[key] ?? 0) > 0) continue;
      const shares = carveoutAt(key, ((ipo as any).extra ?? {}), priceMax).shares;
      if (shares > 0) out[key] = shares;
    }
  }
  // Synthetic combined HNI (nii) row — used by ShareWisePanel when both
  // split rows are present.
  if (out.hni > 0 && out.hni2 > 0) out.nii = out.hni + out.hni2;
  else if (out.hni > 0) out.nii = out.hni;
  else if (out.hni2 > 0) out.nii = out.hni2;
  return out;
}

/** Anchor shares totalled off the per-IPO roster (`extra.anchors[].shares`).
 *
 *  Returns 0 unless EVERY named investor carries a share count. A half-typed
 *  roster — ten of fourteen rows priced — would otherwise sum to a number that
 *  looks like an anchor allocation, deduct too little from QIB, and be wrong in
 *  a way nothing on the page could reveal. Better to leave QIB gross and say so
 *  than to net it against a partial total. */
export function anchorRosterShares(ipo: IpoFull): number {
  const rows = (ipo as any).extra?.anchors;
  if (!Array.isArray(rows)) return 0;
  const named = rows.filter((r: any) => String(r?.name ?? '').trim());
  if (!named.length) return 0;
  const n = (v: any) => Number(String(v ?? '').replace(/[,\s]/g, '')) || 0;
  if (named.some((r: any) => n(r.shares) <= 0)) return 0;   // partially priced
  return named.reduce((a: number, r: any) => a + n(r.shares), 0);
}

/** Where the anchor deduction came from — the letter, or our own arithmetic. */
export type AnchorBasis = 'actual' | 'estimated' | null;

export function subscriptionTable(ipo: IpoFull): { rows: SubRowT[]; total: SubRowT; anchorDeducted: number; anchorBasis: AnchorBasis } | null {
  const total = parseIssueValue(ipo.issueSize);
  /*
   * Drop `total` (rendered separately). The synthetic `nii` roll-up is kept
   * unless it would DUPLICATE a split row, and the three cases are different:
   *
   *   BOTH hni and hni2  → keep it, as the combined "HNI" subtotal above them
   *                        (operator spec, 2026-09-18).
   *   NEITHER            → keep it. It is the ONLY NII information the record
   *                        has, and dropping it removes ~15% of the offer from
   *                        the table entirely.
   *   EXACTLY ONE        → drop it. `nii` equals that one row, so rendering
   *                        both prints the same figure twice.
   *
   * The condition used to be `both ? keep : drop`, which handled the third case
   * and swept up the second with it — and the second is nearly the whole
   * catalogue. **295 of the 319 records with subscription data carry only the
   * combined `nii`** (the pre-2026 importer never split NII), so every one of
   * them was showing QIB and Retail with no NII line between them. Found
   * 2026-10-07 while porting this file, by noticing GSBPL lose a row.
   */
  const all = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  const hasHni = all.some((r) => r.category === 'hni');
  const hasHni2 = all.some((r) => r.category === 'hni2');
  const exactlyOneSplit = hasHni !== hasHni2;
  const subs = exactlyOneSplit ? all.filter((r) => r.category !== 'nii') : all;
  if (!subs.length || !total) return null;
  const totalShares = totalOfferedShares(ipo);
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
  /* One definition, shared with `lotLadder()` and the card's `formsFor1x`.
     This used to hand the ₹2 L figure to BOTH HNI bands and a single lot to
     retail, so bHNI "applications for 1×" ran ~4.8× high on every issue and
     SME retail ran 2× high — `lotLadder` ten lines away had it right the whole
     time and nothing compared them (2026-09-29). */
  const minApp = (cat: string): number =>
    minApplicationShares(cat, { lotSize: lot, priceCap: priceMax, sme: ipo.type === 'sme' });
  const sharesPerApp = (cat: string): number => minApp(cat);
  // Anchor-share deduction — QIB rows are stored GROSS (matching how the
  // reservation table reads: "QIB (Anchor Included) 50% of the offer, N
  // Shares"). Exchange APIs report QIB `timesSubscribed` against NET QIB
  // (anchor is pre-allocated, never enters the public bidding window), so
  // Book Size × Times only cross-checks with Subscribed when Book is also
  // NET. Deduction reads the operator's own values — `extra.anchorShares`
  // first, else the ROSTER sum (`extra.anchors[].shares`), else
  // `extra.anchorPct` × gross QIB / 100. If none of the three is there we
  // leave gross alone rather than assume 60% — a silent no-op is safer than
  // fabricating a deduction (operator ask, 2026-09-21), and `anchorDeducted`
  // on the returned object lets a caller say so instead of claiming "Net".
  //
  // The roster is read because the IPO form only ever CROSS-CHECKS it against
  // the total, never sums it in: an operator who typed all fourteen investor
  // rows from the intimation letter and left the total blank had a record that
  // looked complete and still published a gross QIB (MPIMANIPAL, found
  // 2026-09-23). The roster IS the anchor allocation, so summing it invents
  // nothing.
  const ex: any = (ipo as any).extra ?? {};
  /* Per-category discounts, in ₹ off the band price. Only the three the RHP
     ever states — QIB and HNI never bid at a discount. A category with none
     falls back to the band price, which is why this is safe to apply to every
     row rather than only the carve-outs. */
  const discountOf = (cat: string): number => {
    const raw = cat === 'employee' ? ex.employeeDiscount
      : cat === 'shareholder' ? ex.shareholderDiscount
        : cat === 'policyholder' ? ex.policyholderDiscount
          : cat === 'retail' ? ex.retailDiscount : 0;
    const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const bandPrice = up(ipo);
  const categoryPrice = (cat: string): number => {
    const net = bandPrice - discountOf(cat);
    return net > 0 ? net : bandPrice;
  };
  const anchorSharesInput = Number(ex.anchorShares) || anchorRosterShares(ipo);
  const anchorPctInput = Number(ex.anchorPct) || 0;
  let anchorDeducted = 0;
  /* ACTUAL vs ESTIMATED, and the two are worth telling apart on the page. A
     share count comes off the anchor intimation letter — it is what was
     allotted, and a reader can check it against the exchange. A percentage is
     our own arithmetic against a ceiling the issue may not have used: the
     anchor book can close under 60%, so an estimate is an upper bound, not a
     figure. Both give a Net QIB; only one of them is a fact. */
  let anchorBasis: AnchorBasis = null;
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
      if (deduct > 0 && deduct < book) {
        book = book - deduct;
        anchorDeducted = deduct;
        anchorBasis = anchorSharesInput > 0 ? 'actual' : 'estimated';
      }
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
      /* The price THIS category's applicants pay — the band price less its own
         discount. Employees and shareholders bid at a discount, so valuing
         their book at the band price overstates it: RUNWALENTR's 1,20,275
         employee shares read ₹3.67 Cr at ₹305 where they cost ₹3.50 Cr at the
         discounted ₹291 (operator, 2026-09-28). Carried on the row so every
         display site values a category the same way. */
      price: categoryPrice(r.category),
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
    // 0 when the record carries no anchor figure at all — the caller must not
    // then tell the reader QIB Book Size is "Net (post anchor)".
    anchorDeducted,
    anchorBasis,
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

/**
 * The percentage to stamp on a subscription row as `reservedPct`.
 *
 * THE RECORD'S OWN RESERVATION TABLE FIRST, the generic split only when a
 * category is missing from it — which is most of the catalogue, and the honest
 * fallback for a legacy imported row.
 *
 * Shared because the two surfaces disagreed (2026-10-07). Web's `enrich()` read
 * `extra.shareResv` and fell back; MOBILE'S ONLY EVER USED THE CONSTANT, so
 * every issue whose split is not exactly 50/15/35 was stamped with figures that
 * belong to no actual IPO. It is a fallback in `subscriptionTable` now rather
 * than the primary source — `offeredByBucket` answers first — but a wrong
 * fallback is still wrong, and the two enrichers must agree about it.
 */
export function reservedPctFor(
  extra: Record<string, any> | null | undefined,
  category: string,
  generic: Record<string, number>,
): number {
  if (category === 'total') return 100;
  const resv: any = (extra ?? {}).shareResv ?? {};
  if (category === 'nii') {
    // the poller's synthetic roll-up row: Big HNI + Small HNI
    const a = Number(resv.hni?.pct), b = Number(resv.hni2?.pct);
    if (a > 0 || b > 0) return (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
  } else {
    const p = Number(resv[category]?.pct);
    if (p > 0) return p;
  }
  return generic[category] ?? 0;
}
