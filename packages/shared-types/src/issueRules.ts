/**
 * Regulatory constants for issue derivation — the ONLY place they may appear.
 *
 * Every number here comes from SEBI ICDR. A regulatory change must be an edit to
 * this file, never a change to `computeIssue()`. If you find a `75`, `200000` or
 * `1000000` anywhere in the engine or the UI, it is a defect.
 *
 * Marked `-- VERIFY` where the value should be confirmed against the current
 * regulation before it is relied on for a live issue.
 */

export type Board = 'mainboard' | 'sme';
export type Mechanism = 'book_built' | 'fixed_price';
/** ICDR 6(1): QIB ≤50%. ICDR 6(2): QIB ≥75% — used when the issuer fails the
 *  6(1) eligibility tests (profitability / net worth). */
export type RegulationBasis = 'icdr_6_1' | 'icdr_6_2';

/** The bid-size bands. Thresholds are STRICT: an S-HNI bid must EXCEED ₹2 L. */
export interface CategoryThreshold {
  /** the bid must be strictly greater than this rupee amount */
  above?: number;
  /** informational ceiling; not enforced by the engine */
  upTo?: number;
  /**
   * Floor on the number of LOTS, independent of any rupee threshold -- VERIFY.
   *
   * SME retail is two lots post-2024, which no rupee band expresses. Without
   * this the engine returned one lot for SME while the API's Min Application
   * used two, so the same issue reported two different minimums.
   */
  minLots?: number;
}

/** A floor and/or ceiling on one category's share of the net offer. */
export interface CategoryBound { min?: number; max?: number }

export interface RulePack {
  label: string;
  /**
   * Category floors/ceilings as a percentage of the net offer -- VERIFY.
   *
   * Keyed by the engine's category keys (`qib` · `hni` = B-HNI · `hni2` = S-HNI
   * · `retail` …), plus the pseudo-key **`nii`** for the combined HNI quota,
   * which the regulation bounds as a whole rather than row by row.
   *
   * Deliberately NOT pinning `hni`/`hni2` to absolute percentages. ICDR sets a
   * FLOOR on NII (6(1)) or a ceiling (6(2)), not an exact figure — an issuer may
   * offer more than the minimum, and then Big and Small scale with it. What is
   * fixed is the RATIO between them, which is `niiSplit`.
   */
  bounds: Record<string, CategoryBound>;
  /**
   * How the NII quota divides, as a RATIO -- VERIFY. SEBI gives bids above
   * ₹10 L two-thirds of the NII portion and ₹2–10 L bids one-third, so B-HNI
   * (`hni`) is always the larger of the two. Enforcing the ratio rather than
   * `10` and `5` catches the Big/Small transposition at any NII total.
   */
  niiSplit: { big: number; small: number };
  /** MF share of the net (post-anchor) QIB book -- VERIFY */
  mfPctOfNetQib: number;
  /** anchor may take at most this share of QIB -- VERIFY */
  anchorMaxPctOfQib: number;
  /** SME must reserve at least this share of the issue for the market maker -- VERIFY.
   *  0 on Mainboard, which has no market maker. */
  marketMakerMinPct: number;
  /** the bidding window, in WORKING days -- VERIFY */
  biddingDays: { min: number; max: number };
  /** T+n listing after close, in working days -- VERIFY */
  listingWorkingDaysAfterClose: number;
  thresholds: Record<string, CategoryThreshold>;
  /** which price scenario the minimum application is quoted at */
  applicationThresholdBasis: 'cap' | 'floor' | 'final';
}

/*
 * The rupee thresholds. THE only definition — every surface imports these.
 *
 * They used to be retyped at six sites (the apply service, the WhatsApp
 * journey, IpoActions, HeroBanner, bidEngine and here), which meant a SEBI
 * revision was a six-file hunt with no way to prove it was complete. Grep for
 * `200_000` as well as `200000`: the underscore form hid two of the six.
 */

/** Retail ceiling -- VERIFY. Also the cut-off eligibility limit and the
 *  shareholder-quota cap. A bid at or under this may use cut-off. */
export const RETAIL_MAX_AMOUNT = 200_000;

/** S-HNI ceiling -- VERIFY. A bid ABOVE this is B-HNI. Strict: the bands do
 *  not overlap, so ₹10,00,000 exactly is still S-HNI. */
export const SNII_MAX_AMOUNT = 1_000_000;

/**
 * UPI mandate ceiling -- VERIFY. A bid above this cannot carry a UPI mandate
 * and must go through bank ASBA. A PAYMENT rule.
 *
 * The one threshold here an operator may override per tenant (`bidEngine`'s
 * `upiCap`); this is the default, not a hard limit.
 */
export const UPI_MANDATE_MAX = 500_000;

/**
 * ASBA form split -- VERIFY. Up to this, the resident form (`{SYMBOL}.pdf`);
 * above it, the syndicate form (`{SYMBOL}_SA.pdf`) — spec §2.13. A FORM-TYPE
 * rule, and mainboard only; SME and NCD issues use a single form.
 *
 * Deliberately its OWN constant even though it equals UPI_MANDATE_MAX today.
 * They are different rules that happen to share a number, and collapsing them
 * means a future UPI-limit revision silently changes which ASBA form every
 * mainboard IPO prints. Written as a literal, not as `= UPI_MANDATE_MAX`, so
 * the two can move independently.
 */
export const ASBA_SYNDICATE_ABOVE = 500_000;

const RETAIL_MAX = RETAIL_MAX_AMOUNT;
const SNII_MAX = SNII_MAX_AMOUNT;

const THRESHOLDS: Record<string, CategoryThreshold> = {
  retail: { upTo: RETAIL_MAX },
  hni2: { above: RETAIL_MAX, upTo: SNII_MAX }, // S-HNI
  hni: { above: SNII_MAX },                    // B-HNI
  employee: {},
  shareholder: {},
  other: {},
};

/**
 * SME differs from Mainboard in one place that matters here: a retail
 * application is TWO lots, not one (SEBI, post-2024). The rupee bands are the
 * same, so this is the only override.
 */
const SME_THRESHOLDS: Record<string, CategoryThreshold> = {
  ...THRESHOLDS,
  retail: { ...THRESHOLDS.retail, minLots: 2 },
};

export const RULE_PACKS: Record<string, RulePack> = {
  'mainboard/book_built/icdr_6_1': {
    label: 'Mainboard · book-built · ICDR 6(1)',
    bounds: { qib: { max: 50 }, nii: { min: 15 }, retail: { min: 35 } },
    niiSplit: { big: 2, small: 1 },
    mfPctOfNetQib: 5,
    anchorMaxPctOfQib: 60,
    marketMakerMinPct: 0,
    biddingDays: { min: 3, max: 10 },
    listingWorkingDaysAfterClose: 3,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'mainboard/book_built/icdr_6_2': {
    label: 'Mainboard · book-built · ICDR 6(2)',
    bounds: { qib: { min: 75 }, nii: { max: 15 }, retail: { max: 10 } },
    niiSplit: { big: 2, small: 1 },
    mfPctOfNetQib: 5,
    anchorMaxPctOfQib: 60,
    marketMakerMinPct: 0,
    biddingDays: { min: 3, max: 10 },
    listingWorkingDaysAfterClose: 3,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'mainboard/fixed_price/icdr_6_1': {
    label: 'Mainboard · fixed price',
    bounds: { retail: { min: 50 } },
    niiSplit: { big: 2, small: 1 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 0,
    marketMakerMinPct: 0,
    biddingDays: { min: 3, max: 10 },
    listingWorkingDaysAfterClose: 3,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'final',
  },
  'sme/book_built/icdr_6_1': {
    label: 'SME · book-built',
    bounds: {},
    niiSplit: { big: 2, small: 1 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 60,
    marketMakerMinPct: 5,
    biddingDays: { min: 3, max: 10 },
    listingWorkingDaysAfterClose: 3,
    thresholds: SME_THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'sme/fixed_price/icdr_6_1': {
    label: 'SME · fixed price',
    bounds: {},
    niiSplit: { big: 2, small: 1 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 0,
    marketMakerMinPct: 5,
    biddingDays: { min: 3, max: 10 },
    listingWorkingDaysAfterClose: 3,
    thresholds: SME_THRESHOLDS,
    applicationThresholdBasis: 'final',
  },
};

/**
 * The regulation basis is inferable from the QIB percentage the operator
 * entered — 75%+ is only possible under 6(2). Used as a default so existing
 * records resolve without a migration; the operator can override it.
 */
export function inferRegulationBasis(qibPct?: number): RegulationBasis {
  return (qibPct ?? 0) >= 75 ? 'icdr_6_2' : 'icdr_6_1';
}

export function rulePackFor(board: Board, mechanism: Mechanism, basis: RegulationBasis): RulePack {
  return (
    RULE_PACKS[`${board}/${mechanism}/${basis}`] ??
    RULE_PACKS[`${board}/${mechanism}/icdr_6_1`] ??
    RULE_PACKS['mainboard/book_built/icdr_6_1']
  );
}
