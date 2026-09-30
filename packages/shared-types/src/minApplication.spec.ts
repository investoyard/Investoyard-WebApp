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

describe('the reserved quotas bid in ONE lot', () => {
  /**
   * Settled with data, not argument (2026-09-30). These returned 0 — "no
   * standard min-bid rule" — which made `Req 1x` print 0 and was the whole
   * reason employee and shareholder left the Application-wise table on
   * 2026-09-28. The demand says otherwise: every employee row carrying real
   * share figures is an exact multiple of the lot (4 of 4, retail 20 of 20 as
   * the control). And the minimum is ONE lot, not two — three of those four
   * are not multiples of two lots, which a two-lot minimum could not produce.
   */
  const MAINBOARD = { lotSize: 55, priceCap: 272 };

  it('is one lot for employee, shareholder and policyholder', () => {
    for (const cat of ['employee', 'shareholder', 'policyholder']) {
      expect(minApplicationLots(cat, MAINBOARD)).toBe(1);
      expect(minApplicationShares(cat, MAINBOARD)).toBe(55);
      // SME is UNEVIDENCED — no SME issue carries a reserved quota — so one lot
      // is the conservative floor there too, since no bid can be smaller.
      expect(minApplicationShares(cat, SAI_URJA)).toBe(1200);
    }
  });

  it('reproduces the real employee demand as whole lots', () => {
    // RUNWALENTR: 1,12,259 employee shares against a lot of 49.
    expect(1_12_259 % minApplicationShares('employee', { lotSize: 49, priceCap: 305 })).toBe(0);
    // ...and NOT a multiple of two lots, which is what rules out a 2-lot minimum.
    expect(1_12_259 % 98).not.toBe(0);
  });

  it('still returns 0 where there is genuinely no category', () => {
    for (const cat of ['other', 'total']) {
      expect(minApplicationShares(cat, SAI_URJA)).toBe(0);
      expect(minApplicationShares(cat, MAINBOARD)).toBe(0);
    }
  });

  it('returns 0 when the issue is not priced or sized yet', () => {
    expect(minApplicationShares('retail', { lotSize: 0, priceCap: 272 })).toBe(0);
    expect(minApplicationShares('retail', { lotSize: 55, priceCap: 0 })).toBe(0);
    expect(minApplicationShares('retail', {})).toBe(0);
  });
});

/**
 * DOVE SOFT LIMITED — BSE SME, RHP dated 22 September 2026, Offer Structure on
 * page 267. The price band and bid lot were still `[●]`, so the lot is the GCD
 * of the four stated portions (1,200 — and it can be nothing else: 64,800 is
 * not divisible by 1,600, the only larger candidate).
 *
 *   Offer                 66,00,000
 *   Market maker           3,30,000   (5.00%)
 *   Net Offer             62,70,000
 *     QIB                    64,800   (  1.03% of net —  54 lots)
 *     NII                 30,70,800   ( 48.98% of net — 2,559 lots)
 *     Individual          31,34,400   ( 49.99% of net — 2,612 lots)
 *
 * This is here as a FIXTURE, not as a rounding rule. It shows the SME
 * individual minimum holding at two lots on a second issuer, and it shows the
 * published counts landing on whole lots. It does NOT show the counts being
 * rounded to a minimum-application multiple — see the note in CLAUDE.md.
 */
describe('DOVE SOFT RHP — the SME individual minimum holds at two lots', () => {
  // The band was undecided; the individual minimum is two lots at ANY price,
  // which is the whole point of the SME branch, so the cap is immaterial here.
  const DOVESOFT = { lotSize: 1200, priceCap: 118, sme: true };
  const NET_OFFER = 62_70_000;
  const INDIVIDUAL = 31_34_400;
  const NII = 30_70_800;
  const QIB = 64_800;

  it('the stated portions add up to the net offer', () => {
    expect(QIB + NII + INDIVIDUAL).toBe(NET_OFFER);
  });

  it('the individual portion is a whole number of minimum applications', () => {
    expect(minApplicationShares('retail', DOVESOFT)).toBe(2_400);
    expect(INDIVIDUAL % 2_400).toBe(0);
    expect(INDIVIDUAL / 2_400).toBe(1_306);
  });

  it('every portion is a whole number of lots', () => {
    for (const n of [QIB, NII, INDIVIDUAL, 3_30_000]) expect(n % 1200).toBe(0);
  });
});
