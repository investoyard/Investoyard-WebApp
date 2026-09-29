/**
 * The minimum application size, in SHARES, for each bidding category.
 *
 * ONE definition, because three surfaces had their own and two were wrong.
 * `lotLadder()` (the ladder shown to readers) distinguished sHNI from bHNI
 * correctly; `subscriptionTable()` and `api.ts`'s `formsFor1x` both used the
 * ₹2 L figure as the divisor for BOTH HNI bands, so every bHNI
 * "applications required for 1×" came out about 4.8× too high — measured
 * across 29 mainboard and 13 SME issues on 2026-09-29. On SME the retail and
 * sHNI divisors were wrong as well.
 *
 * The numbers this produces are the ones a reader compares against a broker,
 * so they belong beside the other regulatory constants rather than inline at a
 * call site. `RETAIL_MAX_AMOUNT` (₹2 L) and `SNII_MAX_AMOUNT` (₹10 L) stay the
 * single source for the thresholds.
 */
import { RETAIL_MAX_AMOUNT, SNII_MAX_AMOUNT } from './issueRules';

export interface MinApplicationInputs {
  lotSize?: number | null;
  /** upper band — a minimum bid is always measured at the CAP price */
  priceCap?: number | null;
  sme?: boolean;
}

/**
 * Minimum LOTS per category.
 *
 * SME and mainboard differ in kind, not just in number:
 *   • SME retail is a FIXED size — an individual bids exactly the minimum, so
 *     sHNI has to start one lot ABOVE it. Deriving sHNI from ₹2 L alone can
 *     land it on the same lot count as retail, which is what happened: Sai
 *     Urja's individual and sHNI minimums both came out at 2,400 shares.
 *   • Mainboard retail is a RANGE (1 lot up to ₹2 L), so sHNI begins one lot
 *     past whatever fits under ₹2 L.
 * Both then place bHNI one lot past the ₹10 L ceiling.
 */
export function minApplicationLots(category: string, inp: MinApplicationInputs): number {
  const lot = Number(inp.lotSize) || 0;
  const cap = Number(inp.priceCap) || 0;
  const perLot = lot * cap;
  if (perLot <= 0) return 0;

  if (inp.sme) {
    // Post-2024 SEBI SME framework: the individual bid is two lots.
    const ind = 2;
    const sMin = Math.max(ind + 1, Math.ceil(RETAIL_MAX_AMOUNT / perLot));
    const bMin = Math.max(sMin + 1, Math.ceil(SNII_MAX_AMOUNT / perLot));
    if (category === 'retail' || category === 'individual') return ind;
    if (category === 'hni2' || category === 'nii') return sMin;
    if (category === 'hni') return bMin;
    return 0;
  }

  const rMax = Math.max(1, Math.floor(RETAIL_MAX_AMOUNT / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor(SNII_MAX_AMOUNT / perLot));
  const bMin = sMax + 1;
  if (category === 'retail' || category === 'individual') return 1;
  // `nii` is the combined HNI bucket and has two different minimums inside it;
  // it takes the sHNI one, as it always has. A single "applications for 1×"
  // for a mixed bucket is approximate whichever way it is cut.
  if (category === 'hni2' || category === 'nii') return sMin;
  if (category === 'hni') return bMin;
  return 0;
}

/**
 * Minimum application in SHARES. Zero for a category with no regulatory
 * minimum — employee, shareholder and other have no standard minimum bid, so
 * "applications for 1×" is not derivable for them and must not be guessed.
 */
export function minApplicationShares(category: string, inp: MinApplicationInputs): number {
  const lots = minApplicationLots(category, inp);
  return lots > 0 ? lots * (Number(inp.lotSize) || 0) : 0;
}
