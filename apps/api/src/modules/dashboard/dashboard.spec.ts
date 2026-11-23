import { refusalKind } from './refusal-kind';

/* What a refused partner call means decides which fix the dashboard offers,
   so each real error text the API sends must land in the right group. */
describe('refusalKind', () => {
  it('reads "printing is not enabled" as printing off, with the symbol', () => {
    expect(refusalKind('Form printing is not enabled for BCSSL yet.', 400)).toEqual({ kind: 'print-off', symbol: 'BCSSL' });
  });
  it('reads an unknown IPO as not in our catalogue', () => {
    expect(refusalKind("IPO 'CRYSTALCP' not found.", 404)).toEqual({ kind: 'not-in-catalogue', symbol: 'CRYSTALCP' });
  });
  it('reads the per-partner switch refusal as API off', () => {
    expect(refusalKind('API access is not enabled for your account. Contact us to request it.', 403).kind).toBe('api-off');
  });
  it('reads a scope refusal only on a 403', () => {
    expect(refusalKind('This key does not have the bids:write scope.', 403).kind).toBe('scope');
    expect(refusalKind('This key does not have the bids:write scope.', 400).kind).toBe('other');
  });
  it('reads a 429 as a limit even with no text', () => {
    expect(refusalKind(null, 429).kind).toBe('limit');
  });
  it('keeps anything else as other', () => {
    expect(refusalKind('applicants[0].pan must be a valid PAN', 400)).toEqual({ kind: 'other', symbol: null });
  });
});
