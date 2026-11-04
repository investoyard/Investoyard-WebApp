import { subTone, subToneLabel, fmtCrore, fmtIndian } from './subTone';

/* JEST, not vitest — this package declares "test": "jest" with @types/jest and
   has no vitest dependency. A spec importing vitest passes under `npx vitest`
   and FAILS `npm run build`, because tsconfig compiles the specs too. */

describe('subTone', () => {
  it('reads nothing-bid-yet as cold, not as undersubscribed', () => {
    expect(subTone(0)).toBe('cold');
    expect(subToneLabel(0)).toBe('Awaiting bids');
  });

  it('is cool below 1x', () => {
    expect(subTone(0.01)).toBe('cool');
    expect(subTone(0.99)).toBe('cool');
    expect(subToneLabel(0.5)).toBe('In progress');
  });

  it('turns warm exactly AT 1x, not above it', () => {
    expect(subTone(1)).toBe('warm');
    expect(subToneLabel(1)).toBe('Fully subscribed');
    expect(subTone(0.999)).toBe('cool');
  });

  it('turns hot exactly AT 2x', () => {
    expect(subTone(2)).toBe('hot');
    expect(subToneLabel(2)).toBe('Oversubscribed');
    expect(subTone(1.999)).toBe('warm');
  });

  /* THE CASE THE DRIFT PRODUCED. At JPL's 3.00x the hub said Oversubscribed in
     green and the detail page said "Heavily subscribed"; between 2x and 3x the
     two disagreed about the colour as well. One ladder, one answer. */
  it('gives one answer at 3.00x, which is where the two copies disagreed', () => {
    expect(subTone(3)).toBe('hot');
    expect(subToneLabel(3)).toBe('Oversubscribed');
  });

  it('does not invent a tier above hot', () => {
    expect(subTone(264.7)).toBe('hot');
    expect(subToneLabel(264.7)).toBe('Oversubscribed');
  });
});

describe('fmtCrore', () => {
  it('keeps two decimals while the figure is small enough to carry them', () => {
    expect(fmtCrore(32.15)).toBe('₹32.15 Cr');
    expect(fmtCrore(3.5)).toBe('₹3.50 Cr');
  });

  it('drops them once it is not, and groups Indian-style', () => {
    expect(fmtCrore(1644)).toBe('₹1,644 Cr');
    expect(fmtCrore(30213)).toBe('₹30,213 Cr');
  });

  /* 1000 is the boundary and belongs to the whole-rupee side. */
  it('switches at exactly 1000', () => {
    expect(fmtCrore(999.99)).toBe('₹999.99 Cr');
    expect(fmtCrore(1000)).toBe('₹1,000 Cr');
  });
});

describe('fmtIndian', () => {
  it('groups in lakh/crore, not thousands', () => {
    expect(fmtIndian(2947939)).toBe('29,47,939');
    expect(fmtIndian(1172)).toBe('1,172');
  });

  it('rounds rather than truncating', () => {
    expect(fmtIndian(1.6)).toBe('2');
  });
});
