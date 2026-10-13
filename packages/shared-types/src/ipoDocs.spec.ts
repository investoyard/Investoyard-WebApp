import { docLabel, isPublicDoc } from './ipoDocs';

describe('isPublicDoc', () => {
  it('passes an issuer document', () => {
    expect(isPublicDoc({ type: 'rhp', url: 'https://sebi.example/x.pdf' })).toBe(true);
  });

  it('hides the operator ASBA print blanks, whatever the suffix', () => {
    // These are ours, used by the print engine, and must never appear publicly.
    for (const t of ['asba_form', 'asba_form_sa', 'asba_form_sha', 'ASBA_FORM_SA']) {
      expect(isPublicDoc({ type: t, url: 'https://x/y.pdf' })).toBe(false);
    }
  });

  it('hides a row with no URL — there is nothing to open', () => {
    expect(isPublicDoc({ type: 'rhp', url: '' })).toBe(false);
    expect(isPublicDoc({ type: 'rhp', url: null })).toBe(false);
  });
});

describe('docLabel', () => {
  it('keeps RHP and DRHP as acronyms, from either stored casing', () => {
    // The admin form writes 'RHP'; the importer and older rows carry 'rhp'.
    // Both must read the same on the page.
    expect(docLabel('rhp')).toBe('RHP');
    expect(docLabel('RHP')).toBe('RHP');
    expect(docLabel('drhp')).toBe('DRHP');
    expect(docLabel('DRHP')).toBe('DRHP');
  });

  it('labels the rest of the form own types', () => {
    expect(docLabel('Prospectus')).toBe('Prospectus');
    expect(docLabel('prospectus')).toBe('Prospectus');
    expect(docLabel('Anchor allocation')).toBe('Anchor allocation');
    expect(docLabel('anchor')).toBe('Anchor allocation');
    expect(docLabel('Financials')).toBe('Financials');
    expect(docLabel('Other')).toBe('Other document');
  });

  it('LABELS an unknown type rather than dropping it', () => {
    // Mobile used its 4-entry map as the filter, so anything else vanished
    // from the page. The operator attached it deliberately.
    expect(docLabel('addendum')).toBe('Addendum');
    expect(docLabel('corrigendum')).toBe('Corrigendum');
  });

  it('normalises underscores and hyphens from imported values', () => {
    expect(docLabel('rhp_addendum')).toBe('RHP addendum');
    expect(docLabel('anchor-allocation')).toBe('Anchor allocation');
  });

  it('never returns an empty string', () => {
    expect(docLabel('')).toBe('Document');
    expect(docLabel(null)).toBe('Document');
    expect(docLabel(undefined)).toBe('Document');
  });

  it('trims and collapses whitespace, which hand-typed values carry', () => {
    expect(docLabel('  rhp  ')).toBe('RHP');
    expect(docLabel('anchor   allocation')).toBe('Anchor allocation');
  });
});
