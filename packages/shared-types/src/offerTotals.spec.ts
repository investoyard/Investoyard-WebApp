/**
 * The case that forced this out of `IpoForm.tsx`: a MIXED offer, where one leg
 * is priced in rupees and the other is a share count. The old resolver scaled
 * the whole net by `cap ÷ floor` and ran 1.46% high at the floor band.
 */
import { offerTotals, totalSharesAt, OfferSource } from './offerTotals';

/** Mainboard, Reg 6(1). Fresh ₹500 Cr (money) + OFS 1,00,00,000 shares (a
 *  count), band ₹190–200, employee reservation ₹5 Cr with no discount. */
const MIXED: OfferSource = {
  fresh: { basis: 'amount', value: 500 },
  ofs: { basis: 'shares', value: 1_00_00_000 },
  carveouts: { employee: 5 },
  carveoutBasis: { employee: 'amount' },
};

describe('a mixed offer — only the ₹ leg moves with the price', () => {
  it('reproduces the cap band exactly', () => {
    const t = offerTotals(MIXED, 200, 190);
    expect(t.totalCap).toBe(3_50_00_000);
    expect(t.cap).toBe(3_47_50_000); // net of a 2,50,000-share employee quota
  });

  it('reproduces the floor band, where the OFS leg does NOT scale', () => {
    const t = offerTotals(MIXED, 200, 190);
    // Fresh ₹500 Cr buys 2,63,15,789 at ₹190; the OFS stays 1,00,00,000.
    expect(t.floor).toBe(3_60_52_632);
  });

  it('is the 1.46% the old price-ratio expression got wrong', () => {
    const t = offerTotals(MIXED, 200, 190);
    const oldWay = Math.round((t.cap * 200) / 190); // what IpoForm.tsx used to do
    expect(oldWay).toBe(3_65_78_947);
    expect(oldWay - t.floor).toBe(5_26_315);
  });

  it('every reservation percentage divides the net, so the error reached them all', () => {
    const t = offerTotals(MIXED, 200, 190);
    const at = (total: number, pct: number) => Math.round((total * pct) / 100);
    expect(at(t.cap, 50)).toBe(1_73_75_000);
    expect(at(t.cap, 10)).toBe(34_75_000);
    expect(at(t.cap, 5)).toBe(17_37_500);
    expect(at(t.cap, 35)).toBe(1_21_62_500);
  });
});

describe('an offer sized entirely in SHARES does not move at all', () => {
  /** SAIURJA — BSE SME, fresh 18,28,800 + OFS 3,79,200 shares, band ₹107–113,
   *  market maker 2,16,000 shares. */
  const SAIURJA: OfferSource = {
    fresh: { basis: 'shares', value: 18_28_800 },
    ofs: { basis: 'shares', value: 3_79_200 },
    carveouts: { marketmaker: 2_16_000 },
    carveoutBasis: { marketmaker: 'shares' },
    totalShares: 22_08_000,
  };

  it('prints one count, not two', () => {
    const t = offerTotals(SAIURJA, 113, 107);
    expect(t.totalCap).toBe(22_08_000);
    expect(t.totalFloor).toBe(22_08_000);
    expect(t.cap).toBe(19_92_000);
    expect(t.floor).toBe(t.cap);
  });

  it('holds without a stated total too — the legs alone say the same thing', () => {
    const { totalShares, ...derived } = SAIURJA;
    const t = offerTotals(derived, 113, 107);
    expect(t.totalCap).toBe(22_08_000);
    expect(t.totalFloor).toBe(22_08_000);
  });
});

describe('an offer sized entirely in RUPEES still scales, as it always did', () => {
  const MONEY: OfferSource = { fresh: { basis: 'amount', value: 500 } };

  it('buys more shares at the floor', () => {
    const t = offerTotals(MONEY, 200, 190);
    expect(t.cap).toBe(2_50_00_000);
    expect(t.floor).toBe(Math.round(500e7 / 190));
    // this is the one case the old price-ratio expression got right
    expect(t.floor).toBe(Math.round((t.cap * 200) / 190));
  });

  it('falls back to the legacy single ₹ figure when no leg is set', () => {
    const t = offerTotals({ issueSizeCr: 500 }, 200, 190);
    expect(t.cap).toBe(2_50_00_000);
    expect(t.floor).toBe(Math.round(500e7 / 190));
  });
});

describe('a carve-out at a DISCOUNT buys more shares per rupee', () => {
  /** RUNWALENTR — ₹500 Cr, band ₹291–305, employee 1,20,275 shares at a ₹14
   *  discount. Chittorgarh publishes 1,63,98,962 total / 1,62,78,687 net. */
  const RUNWAL: OfferSource = {
    fresh: { basis: 'amount', value: 500 },
    carveouts: { employee: 1_20_275 },
    carveoutBasis: { employee: 'shares' },
    employeeDiscount: 14,
  };

  it('is not simply ₹ ÷ band price', () => {
    expect(totalSharesAt(RUNWAL, 305)).toBe(1_63_98_963); // ₹500 Cr ÷ ₹305 = 1,63,93,442
    expect(offerTotals(RUNWAL, 305, 291).cap).toBe(1_62_78_688);
  });

  it('a STATED count pins the cap exactly', () => {
    const t = offerTotals({ ...RUNWAL, totalShares: 1_63_98_962 }, 305, 291);
    expect(t.totalCap).toBe(1_63_98_962);
    expect(t.cap).toBe(1_62_78_687); // the published net, to the share
  });
});

describe('degenerate inputs return zero rather than a guess', () => {
  it('needs a price and a size', () => {
    expect(offerTotals(MIXED, 0, 0).cap).toBe(0);
    expect(offerTotals({}, 200, 190).cap).toBe(0);
    expect(totalSharesAt(MIXED, 0)).toBe(0);
  });

  it('treats a missing floor as the cap', () => {
    const t = offerTotals(MIXED, 200);
    expect(t.floor).toBe(t.cap);
  });

  it('never returns a negative net when the carve-out swallows the offer', () => {
    const t = offerTotals({ issueSizeCr: 1, carveouts: { employee: 5 }, carveoutBasis: { employee: 'amount' } }, 200, 190);
    expect(t.cap).toBe(0);
    expect(t.floor).toBe(0);
  });
});
