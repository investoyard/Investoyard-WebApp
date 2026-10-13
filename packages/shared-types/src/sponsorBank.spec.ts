import { sponsorBankNames, matchSponsorBanks } from './sponsorBank';

/**
 * Every fixture below is a REAL stored value, taken from the 22 distinct
 * `extra.sponsorBank` strings in the catalogue on 2026-10-08.
 */
describe('sponsorBankNames — the values actually in the database', () => {
  it('splits "and"', () => {
    expect(sponsorBankNames('Kotak Mahindra Bank Limited and HDFC Bank Limited'))
      .toEqual(['Kotak Mahindra Bank Limited', 'HDFC Bank Limited']);
  });

  it('splits a comma', () => {
    expect(sponsorBankNames('Axis Bank, HDFC Bank Ltd')).toEqual(['Axis Bank', 'HDFC Bank Ltd']);
  });

  it('splits a comma AND an "and" in the same value — three banks', () => {
    expect(sponsorBankNames('Axis Bank Limited, HDFC Bank Limited and ICICI Bank Limited'))
      .toEqual(['Axis Bank Limited', 'HDFC Bank Limited', 'ICICI Bank Limited']);
  });

  it('trims a leading space, which one real record has', () => {
    expect(sponsorBankNames(' KOTAK BANK')).toEqual(['KOTAK BANK']);
  });

  it('returns a single name untouched', () => {
    expect(sponsorBankNames('ICICI Bank Limited')).toEqual(['ICICI Bank Limited']);
  });

  it('handles an empty, null or whitespace field', () => {
    expect(sponsorBankNames('')).toEqual([]);
    expect(sponsorBankNames(null)).toEqual([]);
    expect(sponsorBankNames('   ')).toEqual([]);
  });

  it('does not split a name that merely CONTAINS the letters a-n-d', () => {
    // "Standard" must survive; only a standalone " and " separates.
    expect(sponsorBankNames('Standard Chartered Bank')).toEqual(['Standard Chartered Bank']);
  });

  it('drops a duplicate regardless of case', () => {
    expect(sponsorBankNames('Axis Bank, AXIS BANK')).toEqual(['Axis Bank']);
  });

  it('accepts an ampersand as a separator', () => {
    expect(sponsorBankNames('Axis Bank & ICICI Bank')).toEqual(['Axis Bank', 'ICICI Bank']);
  });
});

const MASTER = [
  { name: 'Axis Bank Limited', email: 'ipo.ops@axisbank.example', active: true },
  { name: 'HDFC Bank Limited', email: 'ipo@hdfcbank.example', active: true },
  { name: 'ICICI Bank Limited', email: '', active: true },          // on file, no email
  { name: 'Yes Bank', email: 'ipo@yesbank.example', active: false }, // deactivated
];

describe('matchSponsorBanks', () => {
  it('matches every bank on the issue and keeps the issue order', () => {
    const r = matchSponsorBanks('HDFC Bank Limited and Axis Bank Limited', MASTER);
    expect(r.matched.map((m) => m.name)).toEqual(['HDFC Bank Limited', 'Axis Bank Limited']);
    expect(r.unknown).toEqual([]);
    expect(r.noEmail).toEqual([]);
  });

  it('matches case- and whitespace-insensitively, because the values were typed by hand', () => {
    const r = matchSponsorBanks('  axis   bank   limited ', MASTER);
    expect(r.matched).toEqual([{ name: 'Axis Bank Limited', email: 'ipo.ops@axisbank.example' }]);
  });

  it('reports a bank whose master row has NO email instead of dropping it', () => {
    const r = matchSponsorBanks('ICICI Bank Limited', MASTER);
    expect(r.matched).toEqual([]);
    expect(r.noEmail).toEqual(['ICICI Bank Limited']);
  });

  it('reports a name with no master row at all', () => {
    const r = matchSponsorBanks('KOTAK BANK', MASTER);
    expect(r.unknown).toEqual(['KOTAK BANK']);
    expect(r.matched).toEqual([]);
  });

  it('does NOT guess at a near match — a short name must not claim a long one', () => {
    // Emailing a bank about an issue it never sponsored is worse than reporting
    // the gap, so "HDFC" does not become "HDFC Bank Limited".
    const r = matchSponsorBanks('HDFC', MASTER);
    expect(r.matched).toEqual([]);
    expect(r.unknown).toEqual(['HDFC']);
  });

  it('ignores a deactivated master row', () => {
    const r = matchSponsorBanks('Yes Bank', MASTER);
    expect(r.matched).toEqual([]);
    expect(r.unknown).toEqual(['Yes Bank']);
  });

  it('reports a mixed issue fully — some matched, some not', () => {
    const r = matchSponsorBanks('Axis Bank Limited, ICICI Bank Limited and KOTAK BANK', MASTER);
    expect(r.matched.map((m) => m.name)).toEqual(['Axis Bank Limited']);
    expect(r.noEmail).toEqual(['ICICI Bank Limited']);
    expect(r.unknown).toEqual(['KOTAK BANK']);
  });

  it('returns everything empty for an issue with no sponsor bank recorded', () => {
    expect(matchSponsorBanks('', MASTER)).toEqual({ matched: [], unknown: [], noEmail: [] });
  });
});
