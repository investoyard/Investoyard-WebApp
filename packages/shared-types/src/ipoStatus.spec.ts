import { effectiveIpoStatus } from './ipoStatus';

/* Every instant is absolute: 23 Nov 2026 noon IST is 06:30Z. TZ has no effect
   on Node on this box, so the instant is injected rather than the zone set. */
const NOW = new Date('2026-11-23T06:30:00Z').getTime();
const ipo = (o: object) => ({ status: 'upcoming', openDate: '2026-11-20', closeDate: '2026-11-24', listingDate: '2026-11-27', ...o });

describe('effectiveIpoStatus', () => {
  it('derives every stage from the dates over the dead stored value', () => {
    expect(effectiveIpoStatus(ipo({ openDate: '2026-11-25', closeDate: '2026-11-27', listingDate: null }), NOW)).toBe('upcoming');
    expect(effectiveIpoStatus(ipo({}), NOW)).toBe('open');
    expect(effectiveIpoStatus(ipo({ closeDate: '2026-11-22' }), NOW)).toBe('closed');
    expect(effectiveIpoStatus(ipo({ closeDate: '2026-11-21', listingDate: '2026-11-23' }), NOW)).toBe('listed');
  });

  it('counts the open and close days themselves as open, and listing day as listed', () => {
    expect(effectiveIpoStatus(ipo({ openDate: '2026-11-23' }), NOW)).toBe('open');
    expect(effectiveIpoStatus(ipo({ closeDate: '2026-11-23' }), NOW)).toBe('open');
  });

  it('respects withdrawn whatever the dates say', () => {
    expect(effectiveIpoStatus(ipo({ status: 'withdrawn', closeDate: '2026-11-01' }), NOW)).toBe('withdrawn');
  });

  it('reads Date columns (UTC midnight of the India date) the same as strings', () => {
    expect(effectiveIpoStatus(ipo({ openDate: new Date('2026-11-20T00:00:00Z'), closeDate: new Date('2026-11-22T00:00:00Z'), listingDate: null }), NOW)).toBe('closed');
  });

  it('uses the India day, not the reader\'s — 19:00 London on the 22nd is the 23rd in Mumbai', () => {
    const london = new Date('2026-11-22T19:00:00Z').getTime();
    expect(effectiveIpoStatus(ipo({ openDate: '2026-11-23' }), london)).toBe('open');
  });

  it('treats an issue with no dates as upcoming', () => {
    expect(effectiveIpoStatus({ status: 'upcoming' }, NOW)).toBe('upcoming');
  });
});
