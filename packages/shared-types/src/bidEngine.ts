/**
 * Bid engine — the single source of truth for IPO bid quantity/category maths,
 * shared by the web Apply + Print-PDF flows, mobile, and the API.
 *
 * Regulatory frame (post-2022 UPI-ASBA regime):
 *   Retail        ≤ ₹2,00,000
 *   sHNI          > ₹2,00,000 and ≤ ₹10,00,000
 *   bHNI          > ₹10,00,000
 *   Shareholder   ≤ ₹2,00,000 (reserved category; offered only when the IPO allows it)
 *   UPI mandate   capped (₹5,00,000 today — operator-configurable, so the cap is a rule
 *                 input, not a constant): HNI-by-UPI is limited to the 2L–cap window,
 *                 anything larger must go through a printed ASBA form.
 *   Form choice   ≤ ₹5,00,000 normal ASBA form · > ₹5,00,000 syndicate form.
 *
 * All amounts are integer rupees. Bids are priced at the band ceiling (retail bids
 * at cut-off block the same amount; HNI must bid at price anyway).
 */

export type BidCategory = 'retail' | 'shni' | 'bhni' | 'shareholder';
export type BidFormType = 'normal' | 'syndicate';

/** Operator-tunable thresholds; defaults reflect today's regime. */
export interface BidRules {
  /** retail (and shareholder) ceiling, ₹ */
  retailCap: number;
  /** amounts strictly above this are bHNI, ₹ */
  bhniAbove: number;
  /** amounts strictly above this print on the syndicate form, ₹ */
  syndicateAbove: number;
  /** UPI mandate ceiling, ₹ (admin setting; ₹5L today) */
  upiCap: number;
}

export const DEFAULT_BID_RULES: BidRules = {
  retailCap: 200_000,
  bhniAbove: 1_000_000,
  syndicateAbove: 500_000,
  upiCap: 500_000,
};

/** One concrete bid size: lots → shares → exact ₹, with derived category + form. */
export interface BidQuote {
  lots: number;
  shares: number;
  amount: number;
  /** derived from amount alone — 'shareholder' is an explicit user choice, never derived */
  category: Exclude<BidCategory, 'shareholder'>;
  formType: BidFormType;
}

/** What a flow stores per family member: the chosen quote + the declared category. */
export interface BidSelection {
  category: BidCategory;
  lots: number;
  shares: number;
  amount: number;
  formType: BidFormType;
}

/** Nearest-lot suggestions around a target amount (the custom "by amount" mode). */
export interface AmountSuggestion {
  below: BidQuote | null;
  exact: BidQuote | null;
  above: BidQuote;
}

export interface BidEngine {
  lotSize: number;
  /** band-ceiling price per share, ₹ */
  price: number;
  /** ₹ per lot */
  lotValue: number;
  rules: BidRules;
  /** largest lot count with amount ≤ retailCap (0 when even one lot exceeds it) */
  maxRetailLots: number;
  presets: {
    minRetail: BidQuote | null;
    maxRetail: BidQuote | null;
    /** smallest bid strictly above the retail cap */
    sHni: BidQuote;
    /** smallest bid strictly above the bHNI threshold */
    bHni: BidQuote;
  };
  quote(lots: number): BidQuote | null;
  categoryOf(amount: number): Exclude<BidCategory, 'shareholder'>;
  formTypeOf(amount: number): BidFormType;
  /** dropdown for Retail (and Shareholder): 1..maxRetailLots */
  retailOptions(): BidQuote[];
  /** dropdown for HNI-by-UPI: amounts in (retailCap, upiCap] — may be empty */
  hniUpiOptions(): BidQuote[];
  /** custom "by amount": nearest lot counts below / exact / above the target ₹ */
  suggestByAmount(amountRupees: number): AmountSuggestion | null;
}

/** Crore input (the custom by-amount box is denominated in Cr: 0.5 → ₹50L). */
export const crToRupees = (cr: number) => Math.round(cr * 1e7);

/**
 * Build an engine for one IPO. Returns null when the IPO cannot be priced yet
 * (no lot size or band ceiling), so callers gate their UI on it.
 */
export function makeBidEngine(
  ipo: { lotSize?: number; priceBandMax?: number },
  ruleOverrides?: Partial<BidRules>,
): BidEngine | null {
  const lotSize = ipo.lotSize ?? 0;
  const price = ipo.priceBandMax ?? 0;
  if (lotSize <= 0 || price <= 0) return null;
  const rules: BidRules = { ...DEFAULT_BID_RULES, ...ruleOverrides };
  const lotValue = lotSize * price;

  const categoryOf = (amount: number): Exclude<BidCategory, 'shareholder'> =>
    amount <= rules.retailCap ? 'retail' : amount <= rules.bhniAbove ? 'shni' : 'bhni';
  const formTypeOf = (amount: number): BidFormType =>
    amount > rules.syndicateAbove ? 'syndicate' : 'normal';

  const quote = (lots: number): BidQuote | null => {
    if (!Number.isFinite(lots) || lots < 1 || Math.floor(lots) !== lots) return null;
    const shares = lots * lotSize;
    const amount = shares * price;
    return { lots, shares, amount, category: categoryOf(amount), formType: formTypeOf(amount) };
  };

  const maxRetailLots = Math.floor(rules.retailCap / lotValue);
  const firstLotsAbove = (threshold: number) => Math.floor(threshold / lotValue) + 1;

  const retailOptions = () => {
    const out: BidQuote[] = [];
    for (let l = 1; l <= maxRetailLots; l++) out.push(quote(l)!);
    return out;
  };

  const hniUpiOptions = () => {
    const out: BidQuote[] = [];
    for (let l = firstLotsAbove(rules.retailCap); l * lotValue <= rules.upiCap; l++) out.push(quote(l)!);
    return out;
  };

  const suggestByAmount = (amountRupees: number): AmountSuggestion | null => {
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) return null;
    const f = Math.floor(amountRupees / lotValue);
    const exact = f >= 1 && f * lotValue === amountRupees ? quote(f) : null;
    const below = exact ? (f > 1 ? quote(f - 1) : null) : f >= 1 ? quote(f) : null;
    const above = quote(f + 1)!;
    return { below, exact, above };
  };

  return {
    lotSize,
    price,
    lotValue,
    rules,
    maxRetailLots,
    presets: {
      minRetail: maxRetailLots >= 1 ? quote(1) : null,
      maxRetail: maxRetailLots >= 1 ? quote(maxRetailLots) : null,
      sHni: quote(firstLotsAbove(rules.retailCap))!,
      bHni: quote(firstLotsAbove(rules.bhniAbove))!,
    },
    quote,
    categoryOf,
    formTypeOf,
    retailOptions,
    hniUpiOptions,
    suggestByAmount,
  };
}
