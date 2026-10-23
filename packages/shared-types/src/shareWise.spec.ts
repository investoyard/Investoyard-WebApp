/* No `import … from 'vitest'` — this package has no vitest dependency of its
   own and every other spec here relies on the globals. Importing it compiles
   under the test runner and FAILS the package build, which is how the first
   cut of this file broke `npm run build`. */
import { anchorNote, isHniSubRow, shareWiseLabel } from './shareWise';

/* Fixtures are real stored shapes: RUNWALENTR's anchor is an ACTUAL allotment
   of 48,83,605, and the catalogue census of 2026-09-30 found 4 records whose
   deduction is ESTIMATED from `anchorPct` alone — NSE among them, which had
   been publishing "Net (post anchor)" in wording that read as the allotment. */

describe('shareWiseLabel', () => {
  it('suffixes QIB only when a deduction was actually taken', () => {
    expect(shareWiseLabel({ key: 'qib', cat: 'QIB' }, 4883605)).toBe('QIB (Ex. Anchor)');
  });

  it('leaves QIB alone on a record with no anchor figure, because the book IS gross', () => {
    expect(shareWiseLabel({ key: 'qib', cat: 'QIB' }, 0)).toBe('QIB');
    expect(shareWiseLabel({ key: 'qib', cat: 'QIB' })).toBe('QIB');
  });

  it('renders the synthetic nii roll-up as the HNI subtotal, never as its own category', () => {
    expect(shareWiseLabel({ key: 'nii', cat: 'NII' }, 1000)).toBe('HNI');
  });

  it('passes every other row through at its own label', () => {
    expect(shareWiseLabel({ key: 'hni', cat: 'HNI (10L+)' }, 1000)).toBe('HNI (10L+)');
    expect(shareWiseLabel({ key: 'hni2', cat: 'HNI (2-10L)' }, 1000)).toBe('HNI (2-10L)');
    expect(shareWiseLabel({ key: 'retail', cat: 'Retail' }, 1000)).toBe('Retail');
    expect(shareWiseLabel({ key: 'policyholder', cat: 'Policyholder' })).toBe('Policyholder');
  });

  it('does not suffix a row that merely has an anchor beside it', () => {
    expect(shareWiseLabel({ key: 'retail', cat: 'Retail' }, 9999999)).toBe('Retail');
  });

  it('survives a row with no key at all', () => {
    expect(shareWiseLabel({ cat: 'Other' }, 1000)).toBe('Other');
  });
});

describe('isHniSubRow', () => {
  it('names the two split bands and nothing else', () => {
    expect(isHniSubRow({ key: 'hni', cat: 'HNI (10L+)' })).toBe(true);
    expect(isHniSubRow({ key: 'hni2', cat: 'HNI (2-10L)' })).toBe(true);
    expect(isHniSubRow({ key: 'nii', cat: 'NII' })).toBe(false);
    expect(isHniSubRow({ key: 'qib', cat: 'QIB' })).toBe(false);
  });
});

describe('anchorNote', () => {
  it('says GROSS when nothing was deducted, rather than a generic Net', () => {
    expect(anchorNote(0, null)).toContain('Gross');
    expect(anchorNote(0, null)).not.toContain('EXCLUDES');
  });

  it('distinguishes an ESTIMATE from an allotment — an estimate is an upper bound', () => {
    const est = anchorNote(4883605, 'estimated');
    expect(est).toContain('ESTIMATED');
    expect(est).not.toContain('actual anchor allotment');

    const act = anchorNote(4883605, 'actual');
    expect(act).toContain('actual anchor allotment');
    expect(act).not.toContain('ESTIMATED');
  });

  it('prints the share count with the full en-IN grouping by default', () => {
    expect(anchorNote(4883605, 'actual')).toContain('48,83,605');
  });

  it('takes a formatter, because a phone has less room than a footnote', () => {
    expect(anchorNote(4883605, 'actual', (n) => `${(n / 1e7).toFixed(2)} Cr`)).toContain('0.49 Cr');
  });

  it('treats a negative or NaN deduction as none, never as a figure', () => {
    expect(anchorNote(-5, 'actual')).toContain('Gross');
    expect(anchorNote(Number.NaN, 'actual')).toContain('Gross');
  });

  it('falls back to the allotment wording when the basis is missing but a figure is not', () => {
    // `subscriptionTable` always sets a basis alongside a deduction; this is the
    // defensive branch, and it must not claim the figure is an estimate.
    expect(anchorNote(1000, null)).toContain('actual anchor allotment');
  });
});
