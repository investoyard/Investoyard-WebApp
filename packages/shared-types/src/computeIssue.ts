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
  /** ISO yyyy-mm-dd. Optional: the date rules simply stay quiet without them. */
  dates?: {
    open?: string;
    close?: string;
    allotment?: string;
    refund?: string;
    demat?: string;
    listing?: string;
  };
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
  /**
   * Spec §5 Step 4 derives TWO mutual-fund figures and they are not the same:
   * a third of the ANCHOR book, and 5% of the post-anchor QIB book. The old
   * field was called `mfShares` and carried only the second, which is exactly
   * the kind of name that gets read as the other one.
   */
  anchor?: { shares: number; netQibShares: number; anchorMfShares: number; qibMfShares: number };
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
    // the rupee band and the lot floor are BOTH minimums — take the larger.
    // SME retail is two lots (post-2024) and no rupee band expresses that.
    if (th && lotValue > 0) {
      minLots = Math.max(th.minLots ?? 1, th.above ? lotsAbove(th.above, lotValue) : 1);
    }
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
    const anchorMfPct = inp.anchor.mfPct != null ? num(inp.anchor.mfPct) : pack.anchorMfPct;
    anchor = {
      shares: anchorShares,
      netQibShares,
      // a third of the anchor book goes to domestic mutual funds …
      anchorMfShares: floorToLot((anchorShares * anchorMfPct) / 100, lot),
      // … and 5% of what is left of QIB after the anchor is taken out
      qibMfShares: floorToLot((netQibShares * pack.mfPctOfNetQib) / 100, lot),
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

  /* ── B08 / B11 / B12 / B13: price band and the calendar ── */
  const d = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
  const floorP = num(inp.priceFloor), capP = num(inp.priceCap);
  if (mechanism === 'book_built' && floorP > 0 && capP > 0) {
    if (capP < floorP) {
      out.push({ code: 'B08', severity: 'blocking', field: 'priceCap',
        message: `Price band is ₹${floorP}–₹${capP}: the cap is below the floor.` });
    } else if (capP / floorP > 1.2 + 1e-9) {
      // ICDR caps the band at 20% of the floor
      out.push({ code: 'B08', severity: 'blocking', field: 'priceCap',
        message: `Price band ₹${floorP}–₹${capP} is ${Math.round(((capP / floorP) - 1) * 1000) / 10}% wide — the cap may not exceed the floor by more than 20%.` });
    }
  }

  const dt = inp.dates ?? {};
  const open = d(dt.open), close = d(dt.close), allot = d(dt.allotment);
  const refund = d(dt.refund), demat = d(dt.demat), listing = d(dt.listing);

  // B13 — the lifecycle only ever moves forwards
  const chain: [string, Date | null][] = [
    ['Open', open], ['Close', close], ['Basis of allotment', allot],
    ['Refund', refund], ['Demat credit', demat], ['Listing', listing],
  ];
  const known = chain.filter(([, v]) => v) as [string, Date][];
  for (let i = 1; i < known.length; i++) {
    if (known[i][1] < known[i - 1][1]) {
      out.push({ code: 'B13', severity: 'blocking', field: 'dates',
        message: `${known[i][0]} is before ${known[i - 1][0]}. The dates have to run in order.` });
      break;
    }
  }

  /*
   * B11 / B12 count WEEKDAYS, not working days — there is no exchange-holiday
   * calendar in the product yet (spec §2.9 asks for one). A holiday inside the
   * window shifts the real answer by a day, so both are WARNINGS: a wrong
   * blocking rule would stop an operator entering a perfectly valid issue.
   */
  const weekdaysBetween = (a: Date, b: Date): number => {
    let n = 0;
    const cur = new Date(a.getTime());
    while (cur < b) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      const wd = cur.getUTCDay();
      if (wd !== 0 && wd !== 6) n++;
    }
    return n;
  };
  if (open && close && close >= open) {
    const days = weekdaysBetween(open, close) + 1; // inclusive of both ends
    const { min, max } = pack.biddingDays;
    if (days < min || days > max) {
      out.push({ code: 'B11', severity: 'warning', field: 'dates',
        message: `Bidding runs ${days} weekday${days === 1 ? '' : 's'}; the window should be ${min}–${max} working days. Exchange holidays are not counted here.` });
    }
  }
  if (close && listing && listing > close) {
    const n = weekdaysBetween(close, listing);
    const want = pack.listingWorkingDaysAfterClose;
    if (n !== want) {
      out.push({ code: 'B12', severity: 'warning', field: 'dates',
        message: `Listing is ${n} weekday${n === 1 ? '' : 's'} after close; SEBI requires T+${want}. Exchange holidays are not counted here.` });
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

  const issues = validateInputs(inp, pack, mechanism);

  /*
   * B18 — SME must reserve a market-maker portion. Checked HERE rather than in
   * validateInputs because a carve-out entered in ₹ Cr only becomes a
   * percentage once the offer has resolved at a price.
   */
  if (primary && pack.marketMakerMinPct > 0) {
    const mmShares = (inp.carveouts ?? [])
      .filter((c) => /market/i.test(c.key))
      .reduce((a, c) => {
        const v = num(c.value);
        if (v <= 0) return a;
        const lot = num(inp.lotSize);
        return a + (c.basis === 'shares' ? floorToLot(v, lot)
          : c.basis === 'pct_of_offer' ? floorToLot((primary.totalOfferShares * v) / 100, lot)
          : floorToLot((v * CR) / primary.price, lot));
      }, 0);
    const pct = primary.totalOfferShares > 0 ? (mmShares / primary.totalOfferShares) * 100 : 0;
    if (mmShares <= 0) {
      issues.push({
        code: 'B18', severity: 'blocking', field: 'carveouts.marketmaker',
        message: `An SME issue must reserve a market-maker portion of at least ${pack.marketMakerMinPct}% of the issue. None is entered.`,
      });
    } else if (pct + 1e-9 < pack.marketMakerMinPct) {
      issues.push({
        code: 'B18', severity: 'blocking', field: 'carveouts.marketmaker',
        message: `Market maker is ${Math.round(pct * 100) / 100}% of the issue — an SME issue needs at least ${pack.marketMakerMinPct}%.`,
      });
    }
  }

  return {
    rulePack: pack, regulationBasis: basis, scenarios, primary,
    empty: !primary,
    issues,
  };
}
