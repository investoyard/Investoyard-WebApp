import { expectedAuthHeader, verifyAuthHeader } from './rail-callback.auth';

describe('callback auth', () => {
  // Exact example from NSE WEB API v1.20.5, Chapter 4 General Instructions.
  const DOC_PASSWORD = 'Pass@123';
  const DOC_HEADER =
    'MTdiOTNmNWFiNTZhZjYxNGUwZDg5OGVkNDcxYTZhMjlkZjNmYTJhYWQ1YjI3M2ZiZDlhOWVmYjhhMWMxYWNmMg==';

  it('reproduces the documented Authorization value', () => {
    expect(expectedAuthHeader(DOC_PASSWORD)).toBe(DOC_HEADER);
  });

  it('verifies a correct header', () => {
    expect(verifyAuthHeader(DOC_HEADER, DOC_PASSWORD)).toBe(true);
  });

  it('rejects a wrong header', () => {
    expect(verifyAuthHeader('bogus', DOC_PASSWORD)).toBe(false);
    expect(verifyAuthHeader(undefined, DOC_PASSWORD)).toBe(false);
    expect(verifyAuthHeader(expectedAuthHeader('other'), DOC_PASSWORD)).toBe(false);
  });
});
