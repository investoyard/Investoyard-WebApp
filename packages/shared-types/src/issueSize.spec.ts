import { issueSizeCrore, issueSizeLabel } from './issueSize';

/*
 * Fixtures are the real shapes this field arrives in, not invented ones:
 * the /ipos list serves a FORMATTED STRING, the detail record carries
 * `issueSizeCr` as a number, and the database column is rupees.
 */
describe('issueSizeCrore', () => {
  it('prefers the number over the formatted string', () => {
    expect(issueSizeCrore({ issueSizeCr: 48, issueSize: '₹999 Cr' })).toBe(48);
  });

  it('reads extra.issueSizeCr when the top-level one is absent', () => {
    expect(issueSizeCrore({ extra: { issueSizeCr: 30213 } })).toBe(30213);
  });

  it('parses the formatted string the list endpoint actually sends', () => {
    expect(issueSizeCrore({ issueSize: '₹30,213 Cr' })).toBe(30213);
    expect(issueSizeCrore({ issueSize: '₹48 Cr' })).toBe(48);
  });

  /* THE 10^7 TRAP, from both sides. A value carrying "Cr" is crore; a bare
     number is the rupee column and divides. Getting it backwards is the
     error the resolver exists to prevent. */
  it('treats a NUMBER as rupees and divides', () => {
    expect(issueSizeCrore({ issueSize: 480000000 })).toBe(48);
  });

  it('treats a bare numeric STRING as rupees too', () => {
    expect(issueSizeCrore({ issueSize: '480000000' })).toBe(48);
  });

  it('does not divide a string that says Cr', () => {
    expect(issueSizeCrore({ issueSize: '48 Cr' })).toBe(48);
    expect(issueSizeCrore({ issueSize: '48 cr' })).toBe(48);
  });

  it('returns null rather than a wrong number when there is nothing usable', () => {
    expect(issueSizeCrore({})).toBeNull();
    expect(issueSizeCrore(null)).toBeNull();
    expect(issueSizeCrore(undefined)).toBeNull();
    expect(issueSizeCrore({ issueSize: '' })).toBeNull();
    expect(issueSizeCrore({ issueSize: '—' })).toBeNull();
    expect(issueSizeCrore({ issueSize: 0 })).toBeNull();
    expect(issueSizeCrore({ issueSizeCr: 0 })).toBeNull();
  });

  it('ignores a negative figure rather than rendering it', () => {
    expect(issueSizeCrore({ issueSizeCr: -5 })).toBeNull();
    expect(issueSizeCrore({ issueSize: -1e9 })).toBeNull();
  });
});

describe('issueSizeLabel', () => {
  it('groups in the Indian system', () => {
    expect(issueSizeLabel({ issueSizeCr: 30213 })).toBe('₹30,213 Cr');
    expect(issueSizeLabel({ issueSizeCr: 48 })).toBe('₹48 Cr');
  });

  it('round-trips the string the list endpoint sends', () => {
    expect(issueSizeLabel({ issueSize: '₹30,213 Cr' })).toBe('₹30,213 Cr');
  });

  it('is null when the figure is, so a caller can render its own dash', () => {
    expect(issueSizeLabel({})).toBeNull();
  });
});
