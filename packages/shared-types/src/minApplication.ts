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

  /*
   * The RESERVED quotas bid in ONE LOT, and this was settled with data rather
   * than argument (2026-09-30). These used to return 0 — "no standard min-bid
   * rule" — which made `Req 1x` print 0 and was the whole reason employee and
   * shareholder were dropped from the Application-wise table on 2026-09-28.
   *
   * The demand says otherwise. Every employee row carrying real share data is
   * an EXACT multiple of the lot (4 of 4, with retail 20 of 20 as the control),
   * so employees bid in whole lots and the minimum is at least one. And it is
   * exactly one, not two: three of those four are NOT multiples of two lots
   * (NSE, NITYAS, RUNWALENTR), which a two-lot minimum could not produce.
   * Average bid runs 1.47 to 7.80 lots.
   *
   * ONLY MAINBOARD IS EVIDENCED — all four rows are mainboard, and no SME issue
   * in the catalogue carries an employee quota. One lot is the conservative
   * floor on either board, since no bid can be smaller; revisit if an SME issue
   * with a reserved quota ever appears.
   */
  if (category === 'employee' || category === 'shareholder' || category === 'policyholder') return 1;

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

/**
 * Minimum ALLOTMENT in LOTS — a different question from the minimum BID above,
 * and the two must not be conflated.
 *
 * `minApplicationLots` answers "what is the smallest legal bid in this
 * category", which is what the LOT LADDER shows a reader: a bHNI bid really
 * must exceed ₹10 L. This answers "what is the smallest parcel an applicant in
 * this category can be allotted", which is what "applications required for 1×"
 * is actually counting — how many applicants the quota can serve.
 *
 * THE TWO NII BANDS SHARE ONE MINIMUM, and that is the whole substance of this
 * function (operator ruling, 2026-10-20). The ₹10 L line SPLITS the NII quota
 * into its two sub-buckets — two thirds to bHNI, one third to sHNI — it is not
 * a second allotment unit. Under ICDR the minimum allotment to an NII is the
 * NII minimum APPLICATION size, which is the ₹2 L + one lot figure for both
 * bands. So a bHNI applicant and an sHNI applicant can be allotted the same
 * smallest parcel.
 *
 * THE TEST THAT SETTLES IT IS THE QUOTA RATIO. A mainboard issue reserves 10%
 * to bHNI and 5% to sHNI — exactly 2:1 — so with one divisor the bHNI count
 * must come out at exactly double the sHNI count. It does: JPL reads
 * 1,34,980 against 67,490. Dividing bHNI by its own ₹10 L minimum instead
 * produced 26,996 — a QUARTER of sHNI's figure, from a book twice the size,
 * which is the shape that made the operator look.
 *
 * KNOWN DISAGREEMENT, worth stating rather than burying: an RHP's own
 * "applications" column is derived on the minimum-BID basis. Sai Urja's
 * published table reads bHNI 21 · sHNI 28 · Retail 296, and this function
 * gives bHNI 56. The document and this column are answering two different
 * questions; 56 is "how many bHNI applicants can be allotted", 21 is "how many
 * ₹10 L bids fill the quota". Reverting is one line — see `minApplicationLots`.
 */
export function minAllotmentLots(category: string, inp: MinApplicationInputs): number {
  /* bHNI borrows sHNI's minimum verbatim. Writing it as a delegation rather
     than a second copy of the arithmetic is deliberate: the ₹2 L figure is
     derived differently on SME (at least one lot above the fixed individual
     bid) and a duplicate would drift from it the first time that changed. */
  return minApplicationLots(category === 'hni' ? 'hni2' : category, inp);
}

/** Minimum allotment in SHARES. Zero where no minimum is derivable (QIB). */
export function minAllotmentShares(category: string, inp: MinApplicationInputs): number {
  const lots = minAllotmentLots(category, inp);
  return lots > 0 ? lots * (Number(inp.lotSize) || 0) : 0;
}
