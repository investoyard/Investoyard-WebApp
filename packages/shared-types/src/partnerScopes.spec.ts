import {
  DEFAULT_PARTNER_SCOPES, PARTNER_SCOPES, PARTNER_SCOPE_META,
  effectiveKeyScopes, isPartnerScope, keyScopesProblem,
} from './partnerScopes';

describe('partner scopes', () => {
  it('has one entry per scope, every one with endpoints', () => {
    expect(new Set(PARTNER_SCOPES).size).toBe(PARTNER_SCOPES.length);
    for (const s of PARTNER_SCOPE_META) expect(s.endpoints.length).toBeGreaterThan(0);
  });

  it('keeps the default the schema default has always been', () => {
    // Tenant.partnerApiScopes @default(["print-forms","ipos:read"])
    expect([...DEFAULT_PARTNER_SCOPES].sort()).toEqual(['ipos:read', 'print-forms']);
  });

  it('knows the two Phase 1 read scopes', () => {
    expect(isPartnerScope('prints:read')).toBe(true);
    expect(isPartnerScope('allotment:read')).toBe(true);
    expect(isPartnerScope('bids:write')).toBe(false);
    expect(isPartnerScope(undefined)).toBe(false);
  });
});

describe('effectiveKeyScopes', () => {
  const tenant = ['print-forms', 'ipos:read', 'prints:read'];

  it('gives a key with no list of its own everything the partner has', () => {
    expect(effectiveKeyScopes(tenant, [])).toEqual(tenant);
    expect(effectiveKeyScopes(tenant, null)).toEqual(tenant);
    expect(effectiveKeyScopes(tenant, undefined)).toEqual(tenant);
  });

  it('narrows a key to its own list', () => {
    expect(effectiveKeyScopes(tenant, ['prints:read'])).toEqual(['prints:read']);
  });

  it('never lets a key exceed its partner — a scope switched off stops on every key', () => {
    expect(effectiveKeyScopes(['ipos:read'], ['print-forms', 'ipos:read'])).toEqual(['ipos:read']);
    expect(effectiveKeyScopes([], ['print-forms'])).toEqual([]);
  });

  it('drops names it does not know, on either side', () => {
    expect(effectiveKeyScopes(['ipos:read', 'legacy'], [])).toEqual(['ipos:read']);
    expect(effectiveKeyScopes(tenant, ['legacy', 'prints:read'])).toEqual(['prints:read']);
  });
});

describe('keyScopesProblem', () => {
  it('accepts a subset of the partner', () => {
    expect(keyScopesProblem(['print-forms', 'prints:read'], ['prints:read'])).toBeNull();
    expect(keyScopesProblem(['print-forms'], [])).toBeNull();
  });

  it('refuses a scope the partner does not have, and says how to fix it', () => {
    expect(keyScopesProblem(['ipos:read'], ['print-forms'])).toMatch(/does not have print-forms switched on/);
  });

  it('refuses an unknown scope', () => {
    expect(keyScopesProblem(['ipos:read'], ['bids:write'])).toBe('Unknown scope: bids:write.');
  });
});
