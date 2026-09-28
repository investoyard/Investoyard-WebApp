/**
 * Resolve an IPO's preferential reservations (employee / shareholder / market
 * maker) from `extra.carveouts` into SHARE COUNTS.
 *
 * WHY THIS IS SHARED. A carve-out comes off the top before the category split,
 * so it is a real reserved quota with its own Book Size and its own subscription
 * — the exchange reports demand against it. But it does NOT live in
 * `extra.shareResv`, and every consumer of that table therefore missed it:
 *
 *   • the poller's `offeredFromIpo()` produced no denominator for `employee`,
 *     so no employee subscription row was ever written — RUNWALENTR reserved
 *     1,20,275 shares and the whole category was simply absent from the data;
 *   • the web's `offeredByBucket()` did the same, so the Share-wise panel had
 *     no employee row to render.
 *
 * The admin form had this arithmetic first and kept it private, which is how
 * two other surfaces went without it. One helper, three callers.
 *
 * TWO BASES, as everywhere else in this codebase: a `shares` carve-out is the
 * count the document STATES and is taken verbatim (RUNWALENTR's 1,20,275 is not
 * a multiple of its 49 lot); an `amount` carve-out is rupees and must be divided
 * by ITS OWN price, because employees and shareholders bid at a discount.
 * `computeIssue()` separately floors these to a lot — that is the ALLOCATION
 * question and deliberately a different number.
 */

export type CarveoutKey = 'employee' | 'shareholder' | 'marketmaker';
export const CARVEOUT_KEYS: CarveoutKey[] = ['employee', 'shareholder', 'marketmaker'];

/** The `extra` fields this reads. Loose on purpose — callers hold different shapes. */
export interface CarveoutSource {
  carveouts?: Record<string, unknown> | null;
  /** `{ employee: 'shares' | 'amount', … }`. Absent means 'amount' (legacy). */
  carveoutBasis?: Record<string, unknown> | null;
  employeeDiscount?: unknown;
  shareholderDiscount?: unknown;
}

export interface CarveoutAmount {
  /** shares reserved — the OFFERED count, not floored to a lot */
  shares: number;
  /** what those shares cost at this carve-out's own price */
  rupees: number;
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The per-category price discount that applies to a carve-out, in ₹. */
function discountFor(key: CarveoutKey, src: CarveoutSource): number {
  if (key === 'employee') return num(src.employeeDiscount);
  if (key === 'shareholder') return num(src.shareholderDiscount);
  return 0; // a market maker buys at the issue price
}

/** One carve-out at a given price. Zero when it is not set. */
export function carveoutAt(key: CarveoutKey, src: CarveoutSource, price: number): CarveoutAmount {
  const value = num(src.carveouts?.[key]);
  if (value <= 0 || !(price > 0)) return { shares: 0, rupees: 0 };
  const basis = String(src.carveoutBasis?.[key] ?? 'amount');
  const net = price - discountFor(key, src);
  const at = net > 0 ? net : price;
  if (basis === 'shares') {
    const shares = Math.round(value);
    return { shares, rupees: shares * at };
  }
  const rupees = value * 1e7; // stored in ₹ Cr
  return { shares: Math.round(rupees / at), rupees };
}

/** Every carve-out at a given price, keyed by category. */
export function carveoutsAt(src: CarveoutSource, price: number): Record<CarveoutKey, CarveoutAmount> {
  return {
    employee: carveoutAt('employee', src, price),
    shareholder: carveoutAt('shareholder', src, price),
    marketmaker: carveoutAt('marketmaker', src, price),
  };
}

/** Total shares held back by every carve-out — what the net offer excludes. */
export function totalCarveoutShares(src: CarveoutSource, price: number): number {
  return CARVEOUT_KEYS.reduce((a, k) => a + carveoutAt(k, src, price).shares, 0);
}
