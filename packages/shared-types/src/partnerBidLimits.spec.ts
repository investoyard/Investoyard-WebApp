import { limitsSaveProblems, liveLimitProblems, normaliseLimitSymbols, type PartnerBidLimits } from './partnerBidLimits';

/* A pilot: one IPO, ₹50,000 a bid, 20 bids and ₹5 lakh a day. */
const PILOT: PartnerBidLimits = { enabled: true, ipoSymbols: ['JPL'], maxAmountPerBid: 50_000, maxBidsPerDay: 20, maxAmountPerDay: 500_000 };
const ask = (o: Partial<{ ipoSymbol: string; amounts: number[]; usedBids: number; usedAmount: number }> = {}) =>
  ({ ipoSymbol: 'JPL', amounts: [14_000], usedBids: 0, usedAmount: 0, ...o });

describe('liveLimitProblems', () => {
  it('allows a bid inside every limit', () => {
    expect(liveLimitProblems(PILOT, ask())).toEqual([]);
  });

  it('refuses everything when there is no row or it is switched off', () => {
    expect(liveLimitProblems(null, ask())[0]).toMatch(/not switched on/);
    expect(liveLimitProblems({ ...PILOT, enabled: false }, ask())[0]).toMatch(/not switched on/);
  });

  it('refuses an IPO that is not listed — case does not matter', () => {
    expect(liveLimitProblems(PILOT, ask({ ipoSymbol: 'ardee' }))).toEqual(['Live bidding on ARDEE is not open for your account.']);
    expect(liveLimitProblems(PILOT, ask({ ipoSymbol: 'jpl' }))).toEqual([]);
  });

  it('refuses a bid above the per-bid cap, naming it', () => {
    expect(liveLimitProblems(PILOT, ask({ amounts: [14_000, 60_000] }))).toEqual(['bids[1]: ₹60,000 is above your per-bid limit of ₹50,000.']);
  });

  it('counts the batch with what was already placed today', () => {
    expect(liveLimitProblems(PILOT, ask({ usedBids: 19, amounts: [10_000, 10_000] }))[0]).toMatch(/21 live bids today; your limit is 20 \(1 left\)/);
    expect(liveLimitProblems(PILOT, ask({ usedAmount: 490_000, amounts: [20_000] }))[0]).toMatch(/₹5,10,000 .* \(₹10,000 left\)/);
    expect(liveLimitProblems(PILOT, ask({ usedBids: 19, usedAmount: 486_000 }))).toEqual([]);
  });
});

describe('limitsSaveProblems', () => {
  it('accepts a switched-off row holding anything sane', () => {
    expect(limitsSaveProblems({ enabled: false, ipoSymbols: [], maxAmountPerBid: 0, maxBidsPerDay: 0, maxAmountPerDay: 0 })).toEqual([]);
  });

  it('will not switch on without an IPO and every cap — enabled never means unlimited', () => {
    const p = limitsSaveProblems({ enabled: true, ipoSymbols: [], maxAmountPerBid: 0, maxBidsPerDay: 0, maxAmountPerDay: 0 });
    expect(p).toHaveLength(4);
  });

  it('caps the per-bid limit at the UPI mandate cap and below the daily cap', () => {
    expect(limitsSaveProblems({ ...PILOT, maxAmountPerBid: 600_000, maxAmountPerDay: 1_000_000 })[0]).toMatch(/UPI mandate cap of ₹5,00,000/);
    expect(limitsSaveProblems({ ...PILOT, maxAmountPerBid: 50_000, maxAmountPerDay: 40_000 })).toContain('The per-bid cap cannot be larger than the daily cap.');
  });

  it('refuses a fractional or negative cap', () => {
    expect(limitsSaveProblems({ ...PILOT, maxBidsPerDay: 2.5 })[0]).toMatch(/whole number/);
  });
});

describe('normaliseLimitSymbols', () => {
  it('upper-cases, trims and de-duplicates', () => {
    expect(normaliseLimitSymbols([' jpl', 'JPL', 'ardee ', ''])).toEqual(['JPL', 'ARDEE']);
  });
});
