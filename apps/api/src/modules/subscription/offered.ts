/**
 * The poller's DENOMINATOR, extracted from `subscription.service.ts` on
 * 2026-10-06 so it can be tested.
 *
 * It had none, and it has now produced three separate operator reports: the
 * reserved categories whose demand was discarded for want of a Book Size
 * (September), and ten SME issues closing with no subscription data at all
 * (October). The service itself cannot be imported into a spec — it pulls in
 * Prisma's `Decimal` types, which do not compile under the test tsconfig — and
 * that is the same reason `parseAnchorRows` was split out of `parseAnchor` and
 * `offerTotals()` was moved out of `IpoForm.tsx`: a function nothing can reach
 * is a function nobody writes a test for.
 *
 * See `subscription.spec.ts` for the cases, each one a real record.
 */
import { carveoutAt } from '@investoyard/shared-types';

export type Bucket = 'qib' | 'hni' | 'hni2' | 'retail' | 'employee' | 'shareholder' | 'policyholder';

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
export function offeredFromIpo(
  src: {
    issueSize?: number | null;
    priceBandMax?: number | null;
    /** The FIXED price lives here with `priceBandMax` null — see the note below. */
    priceBandMin?: number | null;
    extra: any;
  },
): Map<Bucket, number> | null {
  const { issueSize, priceBandMax, priceBandMin, extra } = src;
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
  /*
   * THE OPERATOR'S STATED SHARE COUNT, ahead of the quotient below (added
   * 2026-10-06). `totalOfferedShares()` in `ipoCalc.ts` is documented as the
   * one resolver — *stated count first, `issueSize ÷ upper band` second* — and
   * `issueInputsFrom()` honours it; this function only ever computed the
   * quotient, so a figure read off the RHP was ignored.
   *
   * ONLY WHEN `totalSharesSource` IS `operator`, AND THAT CAVEAT IS THE WHOLE
   * POINT. `Total issue size (shares)` DERIVES ITSELF when left blank, stamping
   * `derived`, and such a count is our own `round(₹ total ÷ cap)` snapshot —
   * which goes stale the moment the issue size is corrected underneath it.
   * NITYAS is the live proof: its `derived` count of 1,44,65,333 implies
   * ₹108.49 Cr against a current ₹108.42 Cr, so honouring it would have moved a
   * LIVE denominator by 0.065% in favour of a figure nothing stands behind.
   * Preferring a stale derivation over the current size is strictly worse than
   * the quotient, so provenance decides it — the same `source` discipline
   * `shareResv[]` rows have used since 2026-09-24.
   *
   * It sits BELOW the implied-total loop, not above it, and that order is
   * deliberate too. The implied total is reverse-engineered from this record's
   * own stored counts, which sit beside the per-bucket `direct` values used in
   * the same breath — so letting a document figure outrank them could put a
   * denominator on one bucket that disagrees with its neighbour's numerator.
   *
   * Measured across all 1,268 visible records before shipping: no record the
   * poller has ever written a row for changes.
   */
  if (derivedTotal <= 0 && extra?.totalSharesSource === 'operator') {
    const stated = Number(extra?.totalShares);
    if (Number.isFinite(stated) && stated > 0) derivedTotal = stated;
  }
  /*
   * Last-resort fallback — raw issueSize ÷ price. Only kicks in when no bucket
   * has a share count entered and no total is stated (legacy imports).
   *
   * THE PRICE FALLS BACK TO `priceBandMin`, because a FIXED-PRICE issue keeps
   * its one price there and leaves `priceBandMax` NULL. Reading the cap alone
   * meant such a record had no price at all from here, so it could never get a
   * denominator however complete its reservation table was — SJP and SOLLFEGE
   * were both blocked that way while open (operator report, 2026-10-06).
   */
  if (derivedTotal <= 0) {
    const size = Number(issueSize);
    const price = Number(priceBandMax) || Number(priceBandMin);
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

  /*
   * Source 3: the CARVE-OUTS. Employee and shareholder reservations come off
   * the top and live in `extra.carveouts`, never in `shareResv` — so this
   * function produced no denominator for them and `computeSubs` therefore
   * wrote no row AT ALL, even when the exchange was reporting their demand.
   * RUNWALENTR reserved 1,20,275 employee shares and the entire category was
   * missing from the subscription data (operator, 2026-09-28).
   *
   * Only fills a bucket `shareResv` did not already cover — a typed count
   * still wins, as everywhere else.
   */
  /* Same fixed-price fallback as the quotient above: a ₹-based carve-out is
     divided by a price, and on a fixed-price issue that price is in
     `priceBandMin`. Reading only the cap gave such a record no employee or
     shareholder denominator at all. */
  const priceForCarveouts = Number(priceBandMax) || Number(priceBandMin);
  if (priceForCarveouts > 0) {
    for (const key of ['employee', 'shareholder', 'policyholder'] as const) {
      if ((out.get(key) ?? 0) > 0) continue;
      const shares = carveoutAt(key, extra ?? {}, priceForCarveouts).shares;
      if (shares > 0) out.set(key, shares);
    }
  }
  return out.size > 0 ? out : null;
}
