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
}

export interface RulePack {
  label: string;
  /** category floors/ceilings as a percentage of the net offer -- VERIFY */
  bounds: { qib?: { min?: number; max?: number }; nii?: { min?: number; max?: number }; retail?: { min?: number; max?: number } };
  /** how the NII quota divides between big and small bidders -- VERIFY */
  niiSplit: { big: number; small: number };
  /** MF share of the net (post-anchor) QIB book -- VERIFY */
  mfPctOfNetQib: number;
  /** anchor may take at most this share of QIB -- VERIFY */
  anchorMaxPctOfQib: number;
  thresholds: Record<string, CategoryThreshold>;
  /** which price scenario the minimum application is quoted at */
  applicationThresholdBasis: 'cap' | 'floor' | 'final';
}

/** Retail is capped at ₹2,00,000; S-HNI sits between that and ₹10,00,000. */
const RETAIL_MAX = 200_000;
const SNII_MAX = 1_000_000;

const THRESHOLDS: Record<string, CategoryThreshold> = {
  retail: { upTo: RETAIL_MAX },
  hni2: { above: RETAIL_MAX, upTo: SNII_MAX }, // S-HNI
  hni: { above: SNII_MAX },                    // B-HNI
  employee: {},
  shareholder: {},
  other: {},
};

export const RULE_PACKS: Record<string, RulePack> = {
  'mainboard/book_built/icdr_6_1': {
    label: 'Mainboard · book-built · ICDR 6(1)',
    bounds: { qib: { max: 50 }, nii: { min: 15 }, retail: { min: 35 } },
    niiSplit: { big: 10, small: 5 },
    mfPctOfNetQib: 5,
    anchorMaxPctOfQib: 60,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'mainboard/book_built/icdr_6_2': {
    label: 'Mainboard · book-built · ICDR 6(2)',
    bounds: { qib: { min: 75 }, nii: { max: 15 }, retail: { max: 10 } },
    niiSplit: { big: 10, small: 5 },
    mfPctOfNetQib: 5,
    anchorMaxPctOfQib: 60,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'mainboard/fixed_price/icdr_6_1': {
    label: 'Mainboard · fixed price',
    bounds: { retail: { min: 50 } },
    niiSplit: { big: 10, small: 5 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 0,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'final',
  },
  'sme/book_built/icdr_6_1': {
    label: 'SME · book-built',
    bounds: {},
    niiSplit: { big: 10, small: 5 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 60,
    thresholds: THRESHOLDS,
    applicationThresholdBasis: 'cap',
  },
  'sme/fixed_price/icdr_6_1': {
    label: 'SME · fixed price',
    bounds: {},
    niiSplit: { big: 10, small: 5 },
    mfPctOfNetQib: 0,
    anchorMaxPctOfQib: 0,
    thresholds: THRESHOLDS,
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
