/**
 * The shared IPO derivations — the figures both surfaces publish.
 *
 * This code ran for months in `apps/web/lib/ipoCalc.ts` with no tests, while
 * mobile ran its own copy that was simply wrong. The cases below are the ones
 * that were actually broken on 2026-10-07, so a regression on any of them puts
 * a wrong number back in front of an investor.
 */
import { subscriptionTable, lotLadder, reservedPctFor, offeredByBucket } from './ipoDerive';

const RES = { qib: 50, nii: 15, retail: 35, employee: 5, total: 100 };
const RSME = { qib: 0, nii: 50, retail: 50, employee: 0, total: 100 };

/** A mainboard record with a REAL split — QIB 50 / bHNI 10 / sHNI 5 / Retail 35. */
const MAINBOARD = {
  type: 'mainboard',
  lotSize: 49,
  priceBandMin: 290,
  priceBandMax: 305,
  issueSize: '5001700000',
  extra: {
    totalShares: '16398962',
    shareResv: {
      qib: { pct: '50', sharesUpper: '8139344' },
      hni: { pct: '10', sharesUpper: '1627869' },
      hni2: { pct: '5', sharesUpper: '813934' },
      retail: { pct: '35', sharesUpper: '5697540' },
    },
    anchorShares: '4883605',
  },
};

const row = (category: string, times = 1) => ({ category, timesSubscribed: times, asOf: '2026-10-07' } as any);

describe('the synthetic NII row — three cases, not two', () => {
  /**
   * The condition used to be `both ? keep : drop`, which also swept up the
   * case where NEITHER split row exists — and that is 295 of the 319 records
   * carrying subscription data, because the pre-2026 importer never split NII.
   * Every one of them showed QIB and Retail with no NII line between them.
   */
  it('KEEPS nii when neither hni nor hni2 exists — it is the only NII data there is', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('nii'), row('retail')].map((r) => ({ ...r, reservedPct: RES[r.category as 'qib'] })),
    } as any)!;
    expect(t.rows.map((r) => r.key)).toContain('nii');
  });

  it('KEEPS nii when BOTH split rows exist — it is their subtotal', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('nii'), row('retail')] as any,
    } as any)!;
    const keys = t.rows.map((r) => r.key);
    expect(keys).toContain('nii');
    expect(keys).toContain('hni');
    expect(keys).toContain('hni2');
  });

  it('DROPS nii when exactly one split row exists — it would print the same figure twice', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('nii'), row('retail')] as any,
    } as any)!;
    expect(t.rows.map((r) => r.key)).not.toContain('nii');
  });

  it('never counts the nii subtotal twice in the Total', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('nii'), row('retail')] as any,
    } as any)!;
    const split = t.rows.filter((r) => r.key !== 'nii').reduce((a, r) => a + r.bookSize, 0);
    expect(t.total.bookSize).toBe(split);
  });
});

describe('Book Size comes from the record, not from a generic split', () => {
  /**
   * Mobile divided a hardcoded { qib: 50, nii: 15, retail: 35 } which has no
   * key for hni, hni2, shareholder or policyholder — so all four rendered ZERO.
   */
  it('gives every split category a real Book Size', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('retail')] as any,
    } as any)!;
    for (const r of t.rows) expect(r.bookSize).toBeGreaterThan(0);
  });

  it('deducts the anchor from QIB and says the basis is actual', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('retail')] as any,
    } as any)!;
    expect(t.anchorDeducted).toBe(4883605);
    expect(t.anchorBasis).toBe('actual');
    // QIB 81,39,344 gross − 48,83,605 anchor
    expect(t.rows.find((r) => r.key === 'qib')!.bookSize).toBe(8139344 - 4883605);
  });

  it('reports NO anchor rather than assuming one', () => {
    const noAnchor = { ...MAINBOARD, extra: { ...MAINBOARD.extra, anchorShares: '' } };
    const t = subscriptionTable({ ...noAnchor, subscription: [row('qib')] as any } as any)!;
    expect(t.anchorDeducted).toBe(0);
    expect(t.anchorBasis).toBeNull();
  });

  it('offeredByBucket resolves each category from the stored counts', () => {
    const o = offeredByBucket(MAINBOARD as any);
    expect(o.qib).toBe(8139344);
    expect(o.hni).toBe(1627869);
    expect(o.hni2).toBe(813934);
  });
});

describe('the lot ladder differs in KIND between SME and mainboard', () => {
  /** Mobile always returned the five-row mainboard shape. An SME individual
   *  bids a FIXED two lots, so showing "1 lot" understates the minimum. */
  it('mainboard gets the five-row ladder with min/max bands', () => {
    expect(lotLadder(MAINBOARD as any)).toHaveLength(5);
  });

  it('SME gets three rows and its Individual row starts at TWO lots', () => {
    const sme = { ...MAINBOARD, type: 'sme', lotSize: 1200, priceBandMin: 107, priceBandMax: 113 };
    const rows = lotLadder(sme as any);
    expect(rows).toHaveLength(3);
    expect(rows[0].lots).toBe(2);
    expect(rows[0].shares).toBe(2400);
  });
});

describe('reservedPctFor — the record first, the generic split only as fallback', () => {
  it('reads the stored percentage when the record has one', () => {
    expect(reservedPctFor(MAINBOARD.extra, 'qib', RES)).toBe(50);
    expect(reservedPctFor(MAINBOARD.extra, 'hni', RES)).toBe(10);
  });

  it('sums hni + hni2 for the synthetic nii row', () => {
    expect(reservedPctFor(MAINBOARD.extra, 'nii', RES)).toBe(15);
  });

  it('falls back to the generic split for a record with no table', () => {
    expect(reservedPctFor({}, 'qib', RES)).toBe(50);
    expect(reservedPctFor(undefined, 'retail', RSME)).toBe(50);
  });

  it('total is always 100', () => {
    expect(reservedPctFor({}, 'total', RES)).toBe(100);
  });

  it('is 0 for a category nobody has declared, rather than guessing', () => {
    expect(reservedPctFor({}, 'policyholder', RES)).toBe(0);
  });
});
