/**
 * Anchor Intimation Letter parser.
 *
 * These exist because three of this parser's patterns had drifted from the
 * documents they parse and nothing caught it until an operator uploaded a
 * letter that read perfectly and produced an empty roster (SHAHINVEST,
 * 2026-09-25). A parser that only accepts a PDF is a parser nobody writes a
 * test for, which is why `parseAnchorRows` takes rows.
 *
 * SHAHINVEST_ROWS below is the VERBATIM output of `extractPdfText` on that
 * letter — column padding, wrapped fund names and all. Do not tidy it up: the
 * padding and the wrapping are the parser's actual problem.
 */
import { parseAnchorRows, TAIL, HEADER_TOTAL, stripSrNo, looksLikeName } from './anchor';

const rows = (texts: string[]) => texts.map((text) => ({ text }));

/** SHAHINVEST, 25 Sep 2026 — no `%` sign, no decimals, names wrapped 3 ways. */
const SHAHINVEST_ROWS = [
  'Limited ("The Company") – Intimation of Anchor Allocation',
  'The IPO Committee of the Company at its meeting held on September 25, 2026, in consultation with Beeline',
  'Capital Advisors Private Limited (the “Book Running Lead Manager”), have finalized allocation of    an',
  'aggregate of 16,19,760 Equity Shares, to Anchor Investors at Anchor Investor Allocation Price of ₹ 167.00 per',
  'Equity Share (including share premium of ₹ 157.00 per Equity Share) in the following manner:',
  'Anchor',
  'No. of             Percentage         Investor',
  'Sr.                                          Equity             of Anchor         Allocation        Total Amount',
  'Name of Anchor Investors',
  'No.                                          Shares              Investor            Price (₹           Allocated (₹)',
  'Allocated         Portion (%)       per Equity',
  'Share)',
  'ANUBHUTI       VALUE       TRUST       -',
  '1.                                          4,49,650                  27.76                 167              7,50,91,550',
  'ANUBHUTI VALUE FUND 2',
  'GAGANDEEP      CREDIT      CAPITAL',
  '2.                                          4,19,900                  25.92                 167              7,01,23,300',
  'PRIVATE LIMITED',
  '3.         COMPACT STRUCTURE FUND                      3,90,150                  24.09                 167              6,51,55,050',
  'SUNRISE      INVESTMENT      TRUST-',
  '4.         SUNRISE                       INVESTMENT             3,60,060                  22.23                 167              6,01,30,020',
  'OPPORTUNITIES FUND',
  'TOTAL                                       16,19,760                100.00                                27,04,99,920',
  'Out of the total allocation of 16,19,760 Equity Shares having face value of ₹ 10 each, to the Anchor investors, no',
];

/** The shape the parser was originally written against: `%` and two decimals. */
const CLASSIC_ROWS = [
  'have finalized allocation of 53,21,739 Equity Shares to Anchor Investors at Anchor Investor Allocation Price of ₹ 429.00 per Equity Share',
  '1.  MOTILAL OSWAL DIGITAL INDIA FUND            53,21,739   100.00%   429.00   2,28,40,26,231.00',
];

describe('anchor letter — SHAHINVEST (no % sign, no decimals)', () => {
  const r = parseAnchorRows(rows(SHAHINVEST_ROWS));

  it('reads the total through the "an aggregate of" filler', () => {
    // The old pattern demanded the number immediately after "allocation of".
    expect(r.totalShares).toBe(16_19_760);
  });

  it('reads the allocation price', () => {
    expect(r.allocationPrice).toBe(167);
  });

  it('finds every roster row despite the missing % and decimals', () => {
    expect(r.investors).toHaveLength(4);
    expect(r.investors.map((i) => i.shares)).toEqual([4_49_650, 4_19_900, 3_90_150, 3_60_060]);
    expect(r.investors.map((i) => i.pct)).toEqual([27.76, 25.92, 24.09, 22.23]);
    expect(r.investors.every((i) => i.price === 167)).toBe(true);
  });

  it('the roster reconciles with the header, so no gap warning', () => {
    expect(r.investors.reduce((a, i) => a + i.shares, 0)).toBe(r.totalShares);
    expect(r._raw?.warnings ?? []).toEqual([]);
  });

  it('rejoins a name wrapped ABOVE and BELOW its numeric row', () => {
    // "ANUBHUTI VALUE FUND 2" ends in a digit; the old rule rejected any
    // continuation row containing one and kept only the first half.
    expect(r.investors[0].name).toBe('ANUBHUTI VALUE TRUST - ANUBHUTI VALUE FUND 2');
    expect(r.investors[1].name).toBe('GAGANDEEP CREDIT CAPITAL PRIVATE LIMITED');
  });

  it('strips a Sr No that has only ONE space after it', () => {
    expect(r.investors[2].name).toBe('COMPACT STRUCTURE FUND');
  });

  it('never folds the TOTAL row into the roster', () => {
    expect(r.investors.map((i) => i.shares)).not.toContain(16_19_760);
  });
});

describe('anchor letter — the classic format still parses', () => {
  const r = parseAnchorRows(rows(CLASSIC_ROWS));
  it('reads header and roster', () => {
    expect(r.totalShares).toBe(53_21_739);
    expect(r.allocationPrice).toBe(429);
    expect(r.investors).toHaveLength(1);
    expect(r.investors[0].name).toBe('MOTILAL OSWAL DIGITAL INDIA FUND');
    expect(r.investors[0].price).toBe(429);
  });
});

describe('TAIL — what must and must not look like a roster row', () => {
  it.each([
    ['1.  X 4,49,650 27.76 167 7,50,91,550', true],
    ['1.  X 53,21,739 12.50% 429.00 44,00,01,276.00', true],
    ['TOTAL                16 , 19,760 100.00       27 , 04 , 99,920', false],
    ['TOTAL                16,19,760 100.00       27,04,99,920', false],
    ['Out of the total allocation of 16,19,760 Equity Shares having face value of ₹ 10 each', false],
    ['aggregate of 16,19,760 Equity Shares, to Anchor Investors at Allocation Price of ₹ 167.00 per', false],
  ])('%s -> %s', (line, expected) => {
    expect(TAIL.test(line as string)).toBe(expected);
  });
});

describe('HEADER_TOTAL — the filler issuers put before the number', () => {
  it.each([
    ['have finalized allocation of an aggregate of 16,19,760 Equity Shares', 16_19_760],
    ['finalized allocation of 53,21,739 Equity Shares to Anchor', 53_21_739],
    ['allocation of up to 1,00,000 Equity Shares', 1_00_000],
    ['allocation of a total of 2,50,000 Equity Shares', 2_50_000],
  ])('%s', (line, expected) => {
    expect(Number(HEADER_TOTAL.exec(line as string)![1].replace(/,/g, ''))).toBe(expected);
  });
});

describe('stripSrNo', () => {
  it.each([
    ['1.                     ', ''],
    ['3.         COMPACT STRUCTURE FUND', 'COMPACT STRUCTURE FUND'],
    ['10) QUANT MUTUAL FUND', 'QUANT MUTUAL FUND'],
    ['2   IDPITER INDIA FUND', 'IDPITER INDIA FUND'],
    // a name that legitimately begins with a digit must survive intact
    ['3M CORP LIMITED', '3M CORP LIMITED'],
    // column padding is the extractor's, not the fund's
    ['ANUBHUTI       VALUE       TRUST', 'ANUBHUTI VALUE TRUST'],
  ])('%s -> %s', (input, expected) => {
    expect(stripSrNo(input as string)).toBe(expected);
  });
});

describe('looksLikeName — a wrapped name may contain a digit', () => {
  it.each([
    ['ANUBHUTI VALUE FUND 2', true],
    ['OPPORTUNITIES FUND', true],
    ['PRIVATE LIMITED', true],
    ['4,49,650                  27.76                 167', false],
    ['TOTAL 16,19,760 100.00', false],
    ['Sr. No: 4', false],
  ])('%s -> %s', (input, expected) => {
    expect(looksLikeName(input as string)).toBe(expected);
  });
});
