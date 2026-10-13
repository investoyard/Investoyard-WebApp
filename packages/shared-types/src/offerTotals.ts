/**
 * The offer total in SHARES at each end of the price band, and the NET offer
 * every reservation percentage divides.
 *
 * WHY THIS MOVED OUT OF `IpoForm.tsx`. It lived there as `offerTotalsOf()`,
 * where nothing could test it, and it carried a wrong assumption that only a
 * test would have caught:
 *
 *     floor = (net * priceCap) / priceFloor
 *
 * with the comment *"the same MONEY buying cheaper shares"*. That is true only
 * when every leg is priced in RUPEES. **A leg sized in SHARES is a COUNT and
 * does not move with the price at all.** On a mainboard offer of Fresh ₹500 Cr
 * plus an OFS of 1,00,00,000 shares, band ₹190–200, the old expression gave a
 * floor-band net of 3,65,78,947 where the truth is 3,60,52,632 — **1.46% high,
 * and it landed on every lower-band reservation count**. `computeIssue()` has
 * always resolved each leg at the scenario price; only this resolver did not.
 *
 * It was also wrong for an offer sized ENTIRELY in shares, which now exists in
 * the catalogue (SAIURJA, SPECTRAA): the count must be identical at both ends,
 * and the old expression inflated the floor by the width of the band. Those two
 * are shielded today only because the reservation table collapses to one column
 * when every priced leg is `shares` — the inflated `sharesLower` was still being
 * WRITTEN, and a `Replace all` would have published it.
 *
 * THE RULE, in one line: **an `amount` leg is money and buys more shares at a
 * lower price; a `shares` leg is a count and buys the same shares at any
 * price.** Carve-outs follow the same split, which `carveoutAt()` already
 * implements.
 *
 * Rounding here is the OFFERED rule — `Math.round`, never floored to a lot.
 * `computeIssue()` floors with residual absorption because allotment cannot
 * split a lot; that is a different question. Do not unify them.
 */
import { CARVEOUT_KEYS, CarveoutSource, carveoutAt, totalCarveoutShares } from './carveouts';

export interface OfferLegInput {
  /** 'amount' (₹ Cr) · 'shares' (a count) · 'none' */
  basis?: string | null;
  value?: unknown;
}

/** Loose on purpose — the admin form and the API hold different shapes. */
export interface OfferSource extends CarveoutSource {
  fresh?: OfferLegInput | null;
  ofs?: OfferLegInput | null;
  /** the legacy single figure in ₹ Cr, used only when no leg is set */
  issueSizeCr?: unknown;
  /** the count the offer document STATES. Authoritative, and read at the CAP. */
  totalShares?: unknown;
}

export interface OfferTotals {
  /** total offer shares at the cap / floor band */
  totalCap: number;
  totalFloor: number;
  /** NET of every carve-out — what each reservation percentage divides */
  cap: number;
  floor: number;
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** What a leg is worth in ₹ Cr at a given price. A share-sized leg is valued
 *  AT that price; a ₹-sized leg is that figure whatever the price. */
function legCrAt(leg: OfferLegInput | null | undefined, price: number): number {
  if (!leg || !leg.basis || leg.basis === 'none') return 0;
  const v = num(leg.value);
  if (v <= 0) return 0;
  return leg.basis === 'shares' ? (v * price) / 1e7 : v;
}

/**
 * The whole offer in SHARES at one price.
 *
 * A carve-out sold at a DISCOUNT buys more shares per rupee, so this is not
 * simply ₹ ÷ price: take the carve-out's rupees out, divide the rest at the
 * band price, then add the carve-out's own share count back. RUNWALENTR is the
 * proof — ₹500 Cr with 1,20,275 employee shares at ₹291 is 1,63,98,963 shares,
 * not the 1,63,93,442 that ₹500 Cr ÷ ₹305 gives, and Chittorgarh publishes
 * 1,63,98,962.
 */
export function totalSharesAt(src: OfferSource, price: number): number {
  if (!(price > 0)) return 0;
  const legs = legCrAt(src.fresh, price) + legCrAt(src.ofs, price);
  const cr = legs > 0 ? legs : num(src.issueSizeCr);
  if (!(cr > 0)) return 0;
  const cvRupees = CARVEOUT_KEYS.reduce((a, k) => a + carveoutAt(k, src, price).rupees, 0);
  const pub = Math.round((cr * 1e7 - cvRupees) / price);
  return pub > 0 ? pub + totalCarveoutShares(src, price) : 0;
}

/**
 * Both bands at once.
 *
 * A STATED total pins the CAP — that is the figure the offer document prints
 * and it involves no division to round away. The floor then moves by the DELTA
 * the legs imply rather than by a price ratio, which is what makes the three
 * cases come out right with one expression:
 *   • every leg in shares → the delta is 0, so the count does not move;
 *   • every leg in ₹      → the delta is exactly the price scaling;
 *   • mixed               → only the ₹ portion moves.
 */
export function offerTotals(src: OfferSource, priceCap: number, priceFloor?: number): OfferTotals {
  const pMax = num(priceCap);
  const pMin = num(priceFloor) || pMax;
  const empty = { totalCap: 0, totalFloor: 0, cap: 0, floor: 0 };
  if (!(pMax > 0)) return empty;

  const derivedCap = totalSharesAt(src, pMax);
  const stated = num(src.totalShares);
  const totalCap = stated > 0 ? stated : derivedCap;
  if (!(totalCap > 0)) return empty;

  const derivedFloor = totalSharesAt(src, pMin);
  const totalFloor = stated > 0
    ? Math.max(0, stated + (derivedFloor - derivedCap))
    : derivedFloor;

  const cap = totalCap - totalCarveoutShares(src, pMax);
  const floor = totalFloor - totalCarveoutShares(src, pMin);
  return {
    totalCap,
    totalFloor: totalFloor > 0 ? totalFloor : 0,
    cap: cap > 0 ? cap : 0,
    floor: floor > 0 ? floor : 0,
  };
}
