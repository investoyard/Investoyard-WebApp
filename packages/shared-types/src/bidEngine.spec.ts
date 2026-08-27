/**
 * Bid engine thresholds. These drive LIVE apply validation and live ASBA form
 * selection, so the numbers are pinned explicitly rather than derived from the
 * constants under test — if a threshold moves, a test must say so out loud.
 */
import { makeBidEngine, DEFAULT_BID_RULES } from './bidEngine';
import { UPI_MANDATE_MAX, ASBA_SYNDICATE_ABOVE } from './issueRules';

describe('DEFAULT_BID_RULES', () => {
  it('holds today\'s regime, to the rupee', () => {
    expect(DEFAULT_BID_RULES).toEqual({
      retailCap: 200_000,
      bhniAbove: 1_000_000,
      syndicateAbove: 500_000,
      upiCap: 500_000,
    });
  });
});

describe('ASBA form selection', () => {
  // ₹500 x 1,000-share lot = ₹5,00,000 exactly at one lot — lands the boundary
  const eng = makeBidEngine({ lotSize: 1_000, priceBandMax: 500 })!;

  it('prints the syndicate form above ₹5,00,000', () => {
    expect(eng.formTypeOf(500_001)).toBe('syndicate');
    expect(eng.formTypeOf(750_000)).toBe('syndicate');
    expect(eng.formTypeOf(5_000_000)).toBe('syndicate');
  });

  it('prints the normal form at ₹5,00,000 and below — the threshold is STRICT', () => {
    expect(eng.formTypeOf(500_000)).toBe('normal');
    expect(eng.formTypeOf(499_999)).toBe('normal');
    expect(eng.formTypeOf(14_450)).toBe('normal');
  });

  it('carries the form type on the quote, so a caller cannot forget to ask', () => {
    expect(eng.quote(1)!.formType).toBe('normal');    // exactly ₹5,00,000
    expect(eng.quote(2)!.formType).toBe('syndicate'); // ₹10,00,000
  });
});

describe('the ₹5 L threshold is two rules, not one', () => {
  /*
   * UPI_MANDATE_MAX is a PAYMENT rule (no UPI mandate above it).
   * ASBA_SYNDICATE_ABOVE is a FORM-TYPE rule (spec §2.13).
   *
   * They are equal today and must not be collapsed: a UPI-limit revision would
   * otherwise silently change which ASBA form every mainboard IPO prints.
   */
  it('keeps them independent even though the values match', () => {
    expect(UPI_MANDATE_MAX).toBe(500_000);
    expect(ASBA_SYNDICATE_ABOVE).toBe(500_000);
  });

  it('lets a tenant lower the UPI cap without moving the form split', () => {
    const eng = makeBidEngine({ lotSize: 1_000, priceBandMax: 500 }, { upiCap: 200_000 })!;
    expect(eng.rules.upiCap).toBe(200_000);
    expect(eng.rules.syndicateAbove).toBe(500_000);
    // a ₹5,00,000 bid can no longer use UPI, but still prints the normal form
    expect(eng.formTypeOf(500_000)).toBe('normal');
  });
});

describe('category bands', () => {
  const eng = makeBidEngine({ lotSize: 100, priceBandMax: 100 })!; // ₹10,000 a lot

  it('splits retail / sHNI / bHNI on the strict SEBI bands', () => {
    expect(eng.categoryOf(200_000)).toBe('retail');
    expect(eng.categoryOf(200_001)).toBe('shni');
    expect(eng.categoryOf(1_000_000)).toBe('shni');
    expect(eng.categoryOf(1_000_001)).toBe('bhni');
  });
});
