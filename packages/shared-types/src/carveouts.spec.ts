/**
 * The POLICYHOLDER carve-out, and why it is not the shareholder one.
 *
 * The two quotas answer to different people — a shareholder reservation is for
 * holders of a LISTED PARENT, a policyholder reservation is for the insurer's
 * own policyholders — and an issuer can offer both at once. Until 2026-09-30
 * the poller mapped the exchanges' `POL` / `POLRET` codes onto `shareholder`,
 * so on such an issue two categories' demand summed into one row and was
 * measured against a shareholder-only Book Size.
 *
 * LICI is the proof it was live rather than hypothetical: it has no listed
 * parent and so no shareholder quota, yet it carries a stored `shareholder`
 * subscription row at 6.12× — LIC's POLICYHOLDER figure, under the wrong name.
 */
import { CARVEOUT_KEYS, carveoutAt, carveoutsAt, totalCarveoutShares } from './carveouts';
import { offerTotals } from './offerTotals';

/**
 * Life Insurance Corporation of India, May 2022. Band ₹902–949, lot 15.
 * The policyholder quota carried a ₹60 discount and the employee quota ₹45 —
 * two DIFFERENT discounts on one issue, which is exactly why the policyholder
 * discount cannot borrow the shareholder field.
 */
const LIC = {
  carveouts: { policyholder: 2_21_37_492, employee: 15_81_249 },
  carveoutBasis: { policyholder: 'shares', employee: 'shares' },
  policyholderDiscount: 60,
  employeeDiscount: 45,
};

describe('policyholder is a category of its own', () => {
  it('is one of the carve-out keys', () => {
    expect(CARVEOUT_KEYS).toContain('policyholder');
    expect(CARVEOUT_KEYS).toContain('shareholder');
  });

  it('does not read the shareholder quota, and is not read by it', () => {
    expect(carveoutAt('policyholder', LIC, 949).shares).toBe(2_21_37_492);
    // LIC has no listed parent, so no shareholder quota — and asking for one
    // must not return the policyholder's figure.
    expect(carveoutAt('shareholder', LIC, 949).shares).toBe(0);
  });

  it('takes its OWN discount, not the shareholder or employee one', () => {
    // A share-basis carve-out is a verbatim count; the discount shows up in
    // what those shares COST, which is what the Share-wise ₹ column reads.
    expect(carveoutAt('policyholder', LIC, 949).rupees).toBe(2_21_37_492 * (949 - 60));
    expect(carveoutAt('employee', LIC, 949).rupees).toBe(15_81_249 * (949 - 45));
  });

  it('converts a ₹ Cr quota at its own discounted price', () => {
    const rupeeBasis = {
      carveouts: { policyholder: 100 }, carveoutBasis: { policyholder: 'amount' },
      policyholderDiscount: 60,
    };
    // ₹100 Cr ÷ ₹889, not ÷ ₹949 — the discount buys more shares per rupee.
    expect(carveoutAt('policyholder', rupeeBasis, 949).shares).toBe(Math.round(100e7 / 889));
    expect(carveoutAt('policyholder', rupeeBasis, 949).shares)
      .not.toBe(Math.round(100e7 / 949));
  });

  it('appears in the bundle and in the total held back', () => {
    expect(Object.keys(carveoutsAt(LIC, 949))).toContain('policyholder');
    expect(totalCarveoutShares(LIC, 949)).toBe(2_21_37_492 + 15_81_249);
  });

  it('comes off the top, so both quotas leave the net offer', () => {
    // LIC offered 22,13,74,920 shares.
    const t = offerTotals({ ...LIC, totalShares: 22_13_74_920 }, 949, 902);
    expect(t.totalCap).toBe(22_13_74_920);
    expect(t.cap).toBe(22_13_74_920 - 2_21_37_492 - 15_81_249);
  });

  it('a share-basis quota does not move with the price', () => {
    const t = offerTotals({ ...LIC, totalShares: 22_13_74_920 }, 949, 902);
    expect(t.floor).toBe(t.cap);
  });
});
