/**
 * computeIssue — the ONE derivation of every computed issue figure.
 *
 * Pure: no I/O, no dates, no framework. Web and mobile both import it, replacing
 * three separate implementations (`web/lib/api.ts`, `web/lib/ipoCalc.ts`,
 * `mobile/lib/ipoCalc.ts`) that could — and did — disagree.
 *
 * Two rules make the difference between this and what it replaces:
 *
 *   1. Inputs only. Share counts, applications-for-1× and category remarks are
 *      OUTPUTS. The legacy form let an operator type them by hand beside the
 *      percentages they are derived from, and nothing reconciled the two.
 *   2. floor_to_lot everywhere, with the rounding residual absorbed by one
 *      named category. Never Math.round — a category count that is not a whole
 *      number of lots cannot be allotted.
 *
 * Reference fixture: MV Electrosystems (MVELECTRO) — see computeIssue.spec.ts.
 */
import {
  Board, Mechanism, RegulationBasis, RulePack,
  inferRegulationBasis, rulePackFor,
} from './issueRules';

export type LegBasis = 'amount' | 'shares' | 'none';
export type CarveoutBasis = 'amount' | 'shares' | 'pct_of_offer';

export interface OfferLeg {
  basis: LegBasis;
  /** ₹ Cr when basis is 'amount'; a share count when basis is 'shares' */
  value: number;
}

export interface Carveout {
  key: string;
  basis: CarveoutBasis;
  value: number;
}

export interface IssueInputs {
  board: Board;
  mechanism?: Mechanism;
  regulationBasis?: RegulationBasis;
  lotSize?: number;
  priceFloor?: number;
  priceCap?: number;
  fixedPrice?: number;
  finalIssuePrice?: number;
  /** total offer in ₹ Cr — the legacy single figure, used when fresh/ofs are absent */
  issueSizeCr?: number;
  fresh?: OfferLeg;
  ofs?: OfferLeg;
  carveouts?: Carveout[];
  /** category → percentage of the net offer. Keys: qib · hni (Big) · hni2 (Small) · retail */
  reservation: Record<string, number>;
  /** per-category price discount in ₹ */
  discounts?: Record<string, number>;
  anchor?: { pctOfQib?: number; mfPct?: number };
  /** which category absorbs the floor-to-lot residual (default: the largest) */
  residualTo?: string;
}

export interface CategoryResult {
  key: string;
  label: string;
  pct: number;
  shares: number;
  amount: number;
  /** minimum bid for this category, in lots / shares / rupees */
  minLots?: number;
  minAppShares?: number;
  minAppAmount?: number;
  /** applications needed to take the category to 1× — ceil */
  appsFor1x?: number;
  /** how many applicants can be allotted at 1× — floor. NOT the same number. */
  maxAllottees?: number;
  /** generated, never typed */
  remark: string;
}

export interface ScenarioResult {
  price: number;
  totalOfferShares: number;
  totalOfferAmount: number;
  carveoutShares: number;
  netOfferShares: number;
  categories: CategoryResult[];
  anchor?: { shares: number; netQibShares: number; mfShares: number };
  residualLots: number;
  residualTo?: string;
}

export type IssueSeverity = 'blocking' | 'warning';

/**
 * One validation finding, carrying the spec's rule code.
 *
 * A LIST, not scattered `if`s at each call site, so that every caller — admin
 * form, Excel importer, API — reaches the same verdict on the same inputs.
 */
export interface IssueProblem {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** the input at fault, for inline display */
  field?: string;
}

export interface IssueDerived {
  rulePack: RulePack;
  regulationBasis: RegulationBasis;
  scenarios: Partial<Record<'floor' | 'cap' | 'final', ScenarioResult>>;
  /** the scenario a UI should show by default */
  primary?: ScenarioResult;
  /** true when there was not enough input to derive anything */
  empty: boolean;
  /** spec §6 findings. Blocking ones must prevent publication. */
  issues: IssueProblem[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  qib: 'QIB', hni: 'B-HNI', hni2: 'S-HNI', retail: 'Retail',
  employee: 'Employee', shareholder: 'Shareholder', other: 'Other',
};

const CR = 1e7;

/** Round DOWN to a whole number of lots — a part-lot cannot be allotted. */
export const floorToLot = (n: number, lot: number): number =>
  lot > 0 ? Math.floor(n / lot) * lot : 0;

/**
 * Lots needed to EXCEED a rupee threshold.
 *
 * The SEBI bands are strict ("above ₹2,00,000"), so when the threshold divides
 * exactly into the lot value one more lot is required. `ceil` alone would return
 * a bid of exactly ₹2,00,000, which does not qualify.
 */
const lotsAbove = (threshold: number, lotValue: number): number =>
  lotValue > 0 ? Math.floor(threshold / lotValue) + 1 : 1;

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function resolveLeg(leg: OfferLeg | undefined, price: number, lot: number): number {
  if (!leg || leg.basis === 'none' || !leg.value) return 0;
  if (leg.basis === 'shares') return floorToLot(leg.value, lot);
  return floorToLot((leg.value * CR) / price, lot); // 'amount' is ₹ Cr
}

function computeScenario(inp: IssueInputs, pack: RulePack, price: number): ScenarioResult | null {
  const lot = num(inp.lotSize);
  if (!(price > 0) || !(lot > 0)) return null;

  /* ── Step 1: offer legs ── */
  let totalOfferShares = resolveLeg(inp.fresh, price, lot) + resolveLeg(inp.ofs, price, lot);
  // no Fresh/OFS split entered yet → fall back to the single total the legacy
  // form captures, so existing records still derive
  if (totalOfferShares <= 0 && inp.issueSizeCr) {
    totalOfferShares = floorToLot((inp.issueSizeCr * CR) / price, lot);
  }
  if (totalOfferShares <= 0) return null;

  /* ── Step 2: carve-outs off the top ── */
  let carveoutShares = 0;
  for (const c of inp.carveouts ?? []) {
    const v = num(c.value);
    if (v <= 0) continue;
    carveoutShares += c.basis === 'shares' ? floorToLot(v, lot)
      : c.basis === 'pct_of_offer' ? floorToLot((totalOfferShares * v) / 100, lot)
      : floorToLot((v * CR) / price, lot);
  }
  const netOfferShares = totalOfferShares - carveoutShares;
  if (netOfferShares <= 0) return null;

  /* ── Step 3: category split, residual absorbed ── */
  const keys = Object.keys(inp.reservation).filter((k) => num(inp.reservation[k]) > 0);
  const rows = keys.map((key) => {
    const pct = num(inp.reservation[key]);
    return { key, pct, shares: floorToLot((netOfferShares * pct) / 100, lot) };
  });
  const assigned = rows.reduce((a, r) => a + r.shares, 0);
  const residual = netOfferShares - assigned;
  // whoever holds the largest quota absorbs the rounding remainder
  const holder = inp.residualTo && rows.some((r) => r.key === inp.residualTo)
    ? inp.residualTo
    : rows.slice().sort((a, b) => b.shares - a.shares)[0]?.key;
  if (holder && residual > 0) {
    const r = rows.find((x) => x.key === holder)!;
    r.shares += residual;
  }

  /* ── Steps 5 & 6: minimum application, then the two 1× quantities ── */
  const categories: CategoryResult[] = rows.map((r) => {
    const discount = num(inp.discounts?.[r.key]);
    const lotValue = lot * (price - discount);
    const th = pack.thresholds[r.key];
    const amount = r.shares * price;

    let minLots: number | undefined;
    if (th && lotValue > 0) minLots = th.above ? lotsAbove(th.above, lotValue) : 1;
    // QIB bids are not expressed in retail-style minimum applications
    if (r.key === 'qib') minLots = undefined;

    const minAppShares = minLots != null ? minLots * lot : undefined;
    return {
      key: r.key,
      label: CATEGORY_LABELS[r.key] ?? r.key,
      pct: r.pct,
      shares: r.shares,
      amount,
      minLots,
      minAppShares,
      minAppAmount: minAppShares != null ? minAppShares * (price - discount) : undefined,
      appsFor1x: minAppShares ? Math.ceil(r.shares / minAppShares) : undefined,
      maxAllottees: minAppShares ? Math.floor(r.shares / minAppShares) : undefined,
      remark: `₹${(amount / CR).toFixed(2)} Cr`,
    };
  });

  /* ── Step 4: QIB sub-allocation ── */
  let anchor: ScenarioResult['anchor'];
  const qib = categories.find((c) => c.key === 'qib');
  if (qib && inp.anchor?.pctOfQib) {
    const anchorShares = floorToLot((qib.shares * num(inp.anchor.pctOfQib)) / 100, lot);
    const netQibShares = qib.shares - anchorShares;
    anchor = {
      shares: anchorShares,
      netQibShares,
      mfShares: floorToLot((netQibShares * pack.mfPctOfNetQib) / 100, lot),
    };
  }

  /* ── Step 7: the remark is generated, never typed ── */
  for (const c of categories) {
    if (c.appsFor1x != null) c.remark = `₹${(c.amount / CR).toFixed(2)} Cr @ ${c.appsFor1x.toLocaleString('en-IN')} forms for 1x`;
  }

  return {
    price,
    totalOfferShares,
    totalOfferAmount: totalOfferShares * price,
    carveoutShares,
    netOfferShares,
    categories,
    anchor,
    residualLots: lot > 0 ? residual / lot : 0,
    residualTo: residual > 0 ? holder : undefined,
  };
}

/**
 * Spec §6 rules that depend only on the INPUTS, not on a price scenario.
 *
 * B01 has to live here rather than in the form. Step 3 absorbs the floor-to-lot
 * residual into one category, so percentages summing to 99.9 still produce a
 * result where `Σ shares == net_offer_shares` — the shortfall is silently
 * handed to the residual holder and every post-condition still passes. Checked
 * only at the form, a bad split entered by any other route (the Excel importer,
 * the API) derives cleanly and looks right.
 */
function validateInputs(inp: IssueInputs, pack: RulePack, mechanism: Mechanism): IssueProblem[] {
  const out: IssueProblem[] = [];

  /* ── B01: the reservation table must account for the whole net offer ── */
  const pcts = Object.keys(inp.reservation ?? {})
    .map((k) => num(inp.reservation[k]))
    .filter((v) => v > 0);
  if (pcts.length) {
    const total = pcts.reduce((a, v) => a + v, 0);
    // spec says == 100.000; tolerate float noise only
    if (Math.abs(total - 100) > 0.001) {
      out.push({
        code: 'B01',
        severity: 'blocking',
        field: 'reservation',
        message: `Reservation percentages total ${+total.toFixed(3)}%, not 100%. `
          + `The ${Math.abs(100 - total) > 0 ? 'difference' : 'shortfall'} would be absorbed into the residual category and disappear.`,
      });
    }
  }

  /* ── B02: every percentage inside the rule pack's bounds ── */
  const pctOf = (k: string) => num(inp.reservation?.[k]);
  const label = (k: string) => CATEGORY_LABELS[k] ?? k;
  const anyEntered = pcts.length > 0;

  if (anyEntered) {
    // per-category bounds, plus the combined NII quota the regulation bounds
    // as a whole rather than row by row
    const checked: [string, string, number][] = [
      ...Object.keys(inp.reservation ?? {})
        .filter((k) => pctOf(k) > 0)
        .map((k) => [k, label(k), pctOf(k)] as [string, string, number]),
      ['nii', 'HNI (Big + Small)', pctOf('hni') + pctOf('hni2')],
    ];
    for (const [key, name, value] of checked) {
      const bound = pack.bounds[key];
      if (!bound || value <= 0) continue;
      if (bound.max != null && value > bound.max) {
        out.push({
          code: 'B02', severity: 'blocking', field: `reservation.${key}`,
          message: `${name} is ${value}% — ${pack.label} caps it at ${bound.max}%.`,
        });
      }
      if (bound.min != null && value < bound.min) {
        out.push({
          code: 'B02', severity: 'blocking', field: `reservation.${key}`,
          message: `${name} is ${value}% — ${pack.label} requires at least ${bound.min}%.`,
        });
      }
    }

    /*
     * The Big/Small split. SEBI gives bids above ₹10 L two-thirds of the NII
     * portion, so B-HNI is ALWAYS the larger row. Checking the ratio rather
     * than the absolute 10 and 5 catches the transposition at any NII total —
     * a 6(1) issuer may offer more than the 15% floor, and then both rows
     * scale with it.
     *
     * Transposed (Big < Small) BLOCKS: it is a straight data-entry defect, and
     * it published wrong figures on three live records. A ratio that is merely
     * off warns — an unusual split is the issuer's business, not an error.
     */
    const big = pctOf('hni'), small = pctOf('hni2');
    if (big > 0 && small > 0) {
      const { big: rBig, small: rSmall } = pack.niiSplit;
      if (rBig > 0 && rSmall > 0) {
        if (big < small) {
          out.push({
            code: 'B02', severity: 'blocking', field: 'reservation.hni',
            message: `HNI (Big) is ${big}% but HNI (Small) is ${small}%. `
              + `${pack.label} gives bids above ₹10 L the larger ${rBig}:${rSmall} share of the NII quota — `
              + `the two rows are transposed.`,
          });
        } else {
          const expectedBig = ((big + small) * rBig) / (rBig + rSmall);
          if (Math.abs(big - expectedBig) > 0.001) {
            out.push({
              code: 'W01', severity: 'warning', field: 'reservation.hni',
              message: `HNI splits ${big}% / ${small}%, not the customary ${rBig}:${rSmall} `
                + `(${+expectedBig.toFixed(3)}% / ${+((big + small) - expectedBig).toFixed(3)}%).`,
            });
          }
        }
      }
    }
  }

  /* ── B09 / B10: anchor ── */
  const anchorPct = num(inp.anchor?.pctOfQib);
  if (anchorPct > 0) {
    if (mechanism === 'fixed_price') {
      // B10 only. A fixed-price pack caps the anchor at 0, so B09 would fire too
      // and tell the operator to reduce a percentage they need to remove.
      out.push({
        code: 'B10',
        severity: 'blocking',
        field: 'anchor',
        message: 'A fixed-price issue has no anchor round — there is no book to anchor. Clear the anchor percentage.',
      });
    } else if (pack.anchorMaxPctOfQib != null && anchorPct > pack.anchorMaxPctOfQib) {
      out.push({
        code: 'B09',
        severity: 'blocking',
        field: 'anchor',
        message: `Anchor is ${anchorPct}% of QIB — ${pack.label} caps it at ${pack.anchorMaxPctOfQib}%.`,
      });
    }
  }

  return out;
}

export function computeIssue(inp: IssueInputs): IssueDerived {
  const mechanism: Mechanism = inp.mechanism ?? (inp.fixedPrice ? 'fixed_price' : 'book_built');
  const basis: RegulationBasis = inp.regulationBasis ?? inferRegulationBasis(num(inp.reservation?.qib));
  const pack = rulePackFor(inp.board, mechanism, basis);

  const scenarios: IssueDerived['scenarios'] = {};
  if (mechanism === 'fixed_price') {
    const p = num(inp.fixedPrice) || num(inp.priceCap);
    const s = computeScenario(inp, pack, p);
    if (s) scenarios.final = s;
  } else {
    const floor = computeScenario(inp, pack, num(inp.priceFloor));
    const cap = computeScenario(inp, pack, num(inp.priceCap) || num(inp.priceFloor));
    if (floor) scenarios.floor = floor;
    if (cap) scenarios.cap = cap;
    if (inp.finalIssuePrice) {
      const fin = computeScenario(inp, pack, num(inp.finalIssuePrice));
      if (fin) scenarios.final = fin;
    }
  }

  // the minimum application is quoted at the basis the rule pack names
  const primary = scenarios.final
    ?? (pack.applicationThresholdBasis === 'floor' ? scenarios.floor : scenarios.cap)
    ?? scenarios.cap ?? scenarios.floor;

  return {
    rulePack: pack, regulationBasis: basis, scenarios, primary,
    empty: !primary,
    issues: validateInputs(inp, pack, mechanism),
  };
}
