import type { IssueInputs, CarveoutBasis, Carveout } from './computeIssue';

import { offerLegFrom } from './operationalContract';

/**
 * Map a stored IPO record onto `computeIssue()`'s inputs. THE ONE MAPPER.
 *
 * WHY THIS IS SHARED (moved here 2026-10-03). It lived as `issueInputsFor()` in
 * BOTH `apps/web/lib/ipoCalc.ts` and `apps/mobile/lib/ipoCalc.ts`, the mobile
 * copy carrying the comment *"Mirrors issueInputsFor() in apps/web"*. It did
 * not mirror it, and neither copy matched the admin form — which builds the same
 * inputs a third time, inline. Three mappers into one pure engine, and the
 * engine is the only part anybody had tested.
 *
 * What the drift actually cost:
 *
 *   • NEITHER public copy passed `carveouts`, so every figure derived from
 *     `derive(ipo)` split the GROSS offer. That is the exact fault fixed in the
 *     admin form on 2026-09-25 — RUNWALENTR, 57,378 shares too many into QIB —
 *     surviving in the two files nobody edited. 26 records carry a carve-out:
 *     20 SME market-maker ones at about 5.3% of the offer (SAIURJA 9.78,
 *     ROBOKIDZ 6.90) and 5 mainboard employee ones at 0.5-3.4% (NSE 3.43,
 *     RUNWALENTR 0.73, NITYAS 0.69, AUGMONT 0.69, AONESTEELS 0.54). One of the
 *     two callers — mobile's `reservation()` — is CUSTOMER-FACING.
 *   • Web passed `instrument` (the W04 follow-on gate) and not `policyholder`;
 *     mobile passed `policyholder` and not `instrument`. Each was missing
 *     exactly what the other had.
 *   • BOTH passed the employee / shareholder / policyholder percentages INTO
 *     the split, where the form excludes them. Had `carveouts` simply been
 *     added to the old mappers, those quotas would have been counted TWICE —
 *     once off the top and once inside the split. See CARVEOUT_ROWS below.
 *
 * The lesson is the one this codebase keeps relearning: a derivation used by
 * more than one surface belongs in ONE function, and a comment claiming two
 * copies mirror each other is not a mechanism that keeps them mirrored.
 */

/**
 * The carve-out keys that come OFF THE TOP and must NOT appear in the category
 * split. ICDR takes a preferential reservation out before the percentages apply,
 * so a key listed here is passed as a `Carveout` and its `shareResv` percentage
 * is dropped — the admin form has done this since 2026-09-25 and the public
 * mappers never did.
 *
 * `marketmaker` is deliberately NOT here: it is an SME-only reservation that was
 * never one of the seven categories and has no `shareResv` row to suppress. It
 * is still passed as a carve-out below.
 */
export const CARVEOUT_ROW_KEYS = ['employee', 'shareholder', 'policyholder'] as const;

/** Every key read out of `extra.carveouts`. Order is irrelevant to the engine. */
const CARVEOUT_INPUT_KEYS = ['employee', 'shareholder', 'policyholder', 'marketmaker'] as const;

/**
 * The fields this mapper reads. Structural on purpose — web and mobile hold
 * differently-shaped `IpoFull` types over the same API response, and a shared
 * mapper must not force either of them to change.
 */
export interface IssueInputSource {
  /** 'sme' routes to the SME rule pack; anything else is mainboard. */
  type?: string | null;
  /** 'fpo' exempts the record from W04's minimum-bid band. Absent means 'ipo'. */
  instrument?: string | null;
  lotSize?: number | null;
  priceBandMin?: number | null;
  priceBandMax?: number | null;
  /** The issue-size COLUMN, as the API renders it ("Rs 44.00 Cr") or in rupees. */
  issueSize?: string | number | null;
  extra?: Record<string, any> | null;
}

const num = (v: unknown): number => {
  const x = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(x) ? x : 0;
};

/**
 * The issue size in RUPEES, from the formatted string the API sends or from a
 * raw number. One parser: both apps had a byte-identical `parseIssueValue` and
 * both now delegate here.
 *
 * A NUMBER is treated as rupees, because that is what the `Ipo.issueSize`
 * COLUMN holds — `extra.issueSizeCr` is the one in crore, and mixing them is a
 * 10^7 error.
 */
export function parseIssueSizeRupees(s?: string | number | null): number {
  if (s == null || s === '') return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const cr = s.replace(/,/g, '').match(/([\d.]+)\s*Cr/i);
  if (cr) return parseFloat(cr[1]) * 1e7;
  const plain = s.replace(/[^\d.]/g, '');
  return plain ? parseFloat(plain) : 0;
}

export function issueInputsFrom(src: IssueInputSource): IssueInputs {
  const ex: Record<string, any> = src.extra ?? {};
  const sr: Record<string, any> = ex.shareResv ?? {};

  /** A category's percentage, honouring the row's own on/off switch. */
  const pct = (k: string): number => {
    const row = sr[k];
    if (!row || row.on === false) return 0;
    const v = num(row.pct);
    return v > 0 ? v : 0;
  };

  const reservation: Record<string, number> = {};
  for (const k of ['qib', 'hni', 'hni2', 'retail', 'other']) {
    const v = pct(k);
    if (v > 0) reservation[k] = v;
  }

  const basisOf = (k: string): CarveoutBasis =>
    (ex.carveoutBasis ?? {})[k] === 'shares' ? 'shares' : 'amount';

  const carveouts: Carveout[] = [];
  for (const k of CARVEOUT_INPUT_KEYS) {
    const value = num((ex.carveouts ?? {})[k]);
    if (value > 0) carveouts.push({ key: k, basis: basisOf(k), value });
  }

  const anchorPct = num(ex.anchorPct);
  const anchorShares = num(ex.anchorShares);

  return {
    board: src.type === 'sme' ? 'sme' : 'mainboard',
    // W04 exempts a follow-on from the IPO minimum-bid band — see IssueInputs.
    instrument: src.instrument || 'ipo',
    mechanism: ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    /*
     * Left UNDEFINED when the operator has not stated one, exactly as both old
     * mappers did. `computeIssue()` already falls back to
     * `inferRegulationBasis(reservation.qib)` — inferring it here as well would
     * put the same default in two places, and the two could then disagree about
     * which QIB percentage to infer from.
     */
    regulationBasis: ex.regulationBasis || undefined,
    lotSize: src.lotSize ?? undefined,
    priceFloor: src.priceBandMin ?? undefined,
    priceCap: src.priceBandMax ?? src.priceBandMin ?? undefined,
    /*
     * The COLUMN, not `extra.issueSizeCr`. The two can desync and each caller
     * reads only one of them; this is the figure the public pages have always
     * derived from, and switching the precedence here would silently move
     * published numbers on any record where they still disagree.
     */
    issueSizeCr: parseIssueSizeRupees(src.issueSize) / 1e7 || undefined,
    // the stated count outranks the Rs total — see IssueInputs.totalShares
    totalShares: num(ex.totalShares) || undefined,
    // read through offerLegFrom — the importer stores these as flat keys the
    // engine never saw, which hid a fresh-issue count on 596 records
    fresh: offerLegFrom(ex, 'fresh'),
    ofs: offerLegFrom(ex, 'ofs'),
    reservation,
    discounts: {
      retail: num(ex.retailDiscount),
      employee: num(ex.employeeDiscount),
      shareholder: num(ex.shareholderDiscount),
      policyholder: num(ex.policyholderDiscount),
    },
    carveouts,
    finalIssuePrice: num(ex.finalIssuePrice) || undefined,
    // pctOfQib drives the split; shares/price record what the book actually took
    anchor: anchorPct > 0 || anchorShares > 0
      ? {
          pctOfQib: anchorPct || undefined,
          mfPct: num(ex.anchorMfPct) || undefined,
          shares: anchorShares || undefined,
          price: num(ex.anchorPrice) || undefined,
        }
      : undefined,
    /*
     * DATES ARE DELIBERATELY NOT PASSED, and the reason is a measurement rather
     * than a preference: feeding them to the engine makes **564 of the 1,267
     * visible records raise a date issue** (559 B12, 6 B11). The T+3 listing
     * norm is recent and most of the catalogue is historical, so on
     * `admin/catalog/view` — which renders `issues` — that is 559 lines of
     * noise over four real faults.
     *
     * The admin FORM passes them, which is the right place: it is editing one
     * issue whose dates the operator is choosing, not reading a thousand closed
     * ones. If the date rules should ever reach a read-only surface they need a
     * floor on the issue's own vintage first.
     */
  };
}
