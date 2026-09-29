/**
 * Minimum application sizes.
 *
 * These exist because the same quantity was computed in three places and two
 * of them were wrong — `subscriptionTable()` and `api.ts` used the ₹2 L
 * threshold as the divisor for BOTH HNI bands, so every bHNI "applications for
 * 1×" ran ~4.8× high on 29 mainboard and 13 SME issues. `lotLadder()` had it
 * right and nothing compared the two.
 */
import { minApplicationLots, minApplicationShares } from './minApplication';

/** Sai Urja Indo Ventures — BSE SME, lot 1,200, band ₹107–113. */
const SAI_URJA = { lotSize: 1200, priceCap: 113, sme: true };

describe('SME — the individual bid is fixed, so sHNI must start above it', () => {
  it('matches the RHP lot counts for Sai Urja', () => {
    expect(minApplicationLots('retail', SAI_URJA)).toBe(2);
    expect(minApplicationLots('hni2', SAI_URJA)).toBe(3);
    expect(minApplicationLots('hni', SAI_URJA)).toBe(8);
  });

  it('matches the RHP share counts', () => {
    expect(minApplicationShares('retail', SAI_URJA)).toBe(2_400);
    expect(minApplicationShares('hni2', SAI_URJA)).toBe(3_600);
    expect(minApplicationShares('hni', SAI_URJA)).toBe(9_600);
  });

  it('reproduces the RHP forms-for-1x from the RHP share counts', () => {
    const forms = (shares: number, cat: string) =>
      Math.ceil(shares / minApplicationShares(cat, SAI_URJA));
    expect(forms(7_10_400, 'retail')).toBe(296);
    expect(forms(1_00_800, 'hni2')).toBe(28);
    expect(forms(2_01_600, 'hni')).toBe(21);
  });

  it('never lets sHNI collide with the individual bid', () => {
    // The old `ceil(₹2L / perLot)` gave 2 lots here — the SAME as retail, so
    // an sHNI bid would have been indistinguishable from an individual one.
    for (const priceCap of [50, 77, 100, 113, 189, 400]) {
      const inp = { lotSize: 1200, priceCap, sme: true };
      expect(minApplicationLots('hni2', inp)).toBeGreaterThan(minApplicationLots('retail', inp));
      expect(minApplicationLots('hni', inp)).toBeGreaterThan(minApplicationLots('hni2', inp));
    }
  });
});

describe('mainboard — retail is a range, and bHNI is the ₹10 L band', () => {
  /** ORIENTCABL — lot 55, cap ₹272 (perLot ₹14,960). */
  const ORIENT = { lotSize: 55, priceCap: 272, sme: false };

  it('retail is one lot', () => {
    expect(minApplicationShares('retail', ORIENT)).toBe(55);
  });

  it('sHNI is the first lot count above ₹2 L', () => {
    // 13 lots = ₹1,94,480 (under); 14 = ₹2,09,440 (over)
    expect(minApplicationLots('hni2', ORIENT)).toBe(14);
    expect(minApplicationShares('hni2', ORIENT)).toBe(770);
  });

  it('bHNI uses the ₹10 L threshold, NOT ₹2 L', () => {
    // The bug: both bands shared the ₹2 L divisor of 770, making bHNI forms
    // 4.8x too many. 66 lots = ₹9,87,360 (under ₹10 L); 67 = ₹10,02,320.
    expect(minApplicationLots('hni', ORIENT)).toBe(67);
    expect(minApplicationShares('hni', ORIENT)).toBe(3_685);
    expect(minApplicationShares('hni', ORIENT)).not.toBe(minApplicationShares('hni2', ORIENT));
  });

  it('orders the three bands strictly', () => {
    for (const [lotSize, priceCap] of [[8, 1785], [41, 362], [468, 32], [185, 81]]) {
      const inp = { lotSize, priceCap, sme: false };
      expect(minApplicationShares('retail', inp)).toBeLessThan(minApplicationShares('hni2', inp));
      expect(minApplicationShares('hni2', inp)).toBeLessThan(minApplicationShares('hni', inp));
    }
  });
});

describe('categories with no regulatory minimum', () => {
  it('returns 0 rather than guessing', () => {
    // Employee / shareholder bidding patterns vary too widely to derive an
    // "applications for 1x" — 0 means not derivable, and callers must not
    // divide by it.
    for (const cat of ['employee', 'shareholder', 'other', 'total']) {
      expect(minApplicationShares(cat, SAI_URJA)).toBe(0);
      expect(minApplicationShares(cat, { lotSize: 55, priceCap: 272 })).toBe(0);
    }
  });

  it('returns 0 when the issue is not priced or sized yet', () => {
    expect(minApplicationShares('retail', { lotSize: 0, priceCap: 272 })).toBe(0);
    expect(minApplicationShares('retail', { lotSize: 55, priceCap: 0 })).toBe(0);
    expect(minApplicationShares('retail', {})).toBe(0);
  });
});
