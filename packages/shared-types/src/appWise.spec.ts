import { APP_WISE_ORDER, PRO_RATA_CATEGORIES, appWiseRows, isProRataAllotment } from './appWise';
import { minApplicationLots } from './minApplication';

const row = (key: string, over: Partial<{ applicationsTimes: number; bidCount: number }> = {}) => ({
  key, applicationsTimes: 1.5, bidCount: 100, ...over,
});

describe('APP_WISE_ORDER', () => {
  it('excludes QIB, and the minimum-bid rule is WHY', () => {
    expect('qib' in APP_WISE_ORDER).toBe(false);
    // The exclusion is not a preference: without a minimum bid there is nothing
    // to divide by, so Req 1x could only print 0.
    const inp = { lotSize: 10, priceCap: 500, sme: false };
    expect(minApplicationLots('qib', inp)).toBe(0);
    // ...while every category the view DOES show has one.
    for (const k of Object.keys(APP_WISE_ORDER)) {
      expect(minApplicationLots(k, inp)).toBeGreaterThan(0);
    }
  });

  it('puts the HNI bands before retail, then the reserved quotas', () => {
    expect(Object.keys(APP_WISE_ORDER)).toEqual(['hni', 'hni2', 'retail', 'employee', 'shareholder', 'policyholder']);
  });
});

describe('appWiseRows', () => {
  it('orders rows by the map, not by the order the API sent', () => {
    const out = appWiseRows([row('retail'), row('policyholder'), row('hni2'), row('hni')]);
    expect(out.map((r) => r.key)).toEqual(['hni', 'hni2', 'retail', 'policyholder']);
  });

  it('drops QIB and the synthetic nii roll-up', () => {
    // `nii` is Big+Small combined — a subtotal, not a category to list again.
    const out = appWiseRows([row('qib'), row('nii'), row('retail')]);
    expect(out.map((r) => r.key)).toEqual(['retail']);
  });

  it('needs BOTH figures on a DRAWN category — a row with one is not renderable', () => {
    expect(appWiseRows([row('retail', { bidCount: undefined as any })])).toEqual([]);
    expect(appWiseRows([row('retail', { applicationsTimes: undefined as any })])).toEqual([]);
  });

  it('A BID COUNT IS ENOUGH ON A PRO-RATA CATEGORY', () => {
    // It has no ratio by design, so requiring one would drop the row — and
    // with it the application COUNT, which is the figure there that means
    // something. That is what the 2026-09-28 state did.
    const out = appWiseRows([row('employee', { applicationsTimes: undefined as any })]);
    expect(out.map((r) => r.key)).toEqual(['employee']);
  });

  it('still needs a bid count — an empty row is not a row', () => {
    expect(appWiseRows([row('employee', { bidCount: undefined as any, applicationsTimes: undefined as any })])).toEqual([]);
  });

  it('admits a pro-rata row on the FLAG as well as on the key', () => {
    // `subscriptionTable` sets `proRata`; the key test is the fallback for a
    // row that reached here without passing through it.
    const out = appWiseRows([{ key: 'retail', bidCount: 7, proRata: true }]);
    expect(out).toHaveLength(1);
  });

  it('keeps a zero multiple, which is a real reading', () => {
    // 0x means bids arrived but not enough for 1x — not missing data.
    expect(appWiseRows([row('retail', { applicationsTimes: 0 })])).toHaveLength(1);
  });

  it('returns empty for a row with no key at all', () => {
    expect(appWiseRows([{ applicationsTimes: 1, bidCount: 5 }])).toEqual([]);
  });

  it('returns empty on an empty input, so every caller can hide itself', () => {
    expect(appWiseRows([])).toEqual([]);
  });
});

describe('PRO_RATA_CATEGORIES', () => {
  it('is the three reserved quotas, and NOT retail', () => {
    expect([...PRO_RATA_CATEGORIES].sort()).toEqual(['employee', 'policyholder', 'shareholder']);
    // Retail is DRAWN — minimum lot to as many as it will reach, then a draw
    // of lots — which is the mechanic that makes an application multiple an
    // inverse chance. It is the one category where the column means what it
    // says.
    expect(isProRataAllotment('retail')).toBe(false);
  });

  it('LEAVES BOTH NII BANDS OUT, which is the operator ruling and not an oversight', () => {
    // Both are proportionate under ICDR too, so a strict reading would take
    // them and leave retail alone. They keep the column because NII has a
    // HARD minimum allotment parcel — the ₹2 L application size, with a draw
    // of lots when the quota cannot give everyone that much — so the count is
    // a real capacity figure. That is what `minAllotmentLots` was built for
    // the day before this. Worth knowing before anyone unifies the two: on
    // JPL bHNI's gap between the multiples (0.70x vs 0.08x) is WIDER than
    // employee's, and correct there.
    expect(isProRataAllotment('hni')).toBe(false);
    expect(isProRataAllotment('hni2')).toBe(false);
    expect(isProRataAllotment('nii')).toBe(false);
  });

  it('every pro-rata category is still LISTED by the view', () => {
    // The row stays; only its two ratio columns go. Dropping it is the thing
    // this replaces.
    for (const k of PRO_RATA_CATEGORIES) expect(k in APP_WISE_ORDER).toBe(true);
  });

  it('handles a missing key rather than throwing', () => {
    expect(isProRataAllotment(undefined)).toBe(false);
    expect(isProRataAllotment(null)).toBe(false);
    expect(isProRataAllotment('')).toBe(false);
  });
});
