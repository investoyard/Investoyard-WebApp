import { APP_WISE_ORDER, appWiseRows } from './appWise';
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

  it('needs BOTH figures — a row with one is not renderable', () => {
    expect(appWiseRows([row('retail', { bidCount: undefined as any })])).toEqual([]);
    expect(appWiseRows([row('retail', { applicationsTimes: undefined as any })])).toEqual([]);
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
