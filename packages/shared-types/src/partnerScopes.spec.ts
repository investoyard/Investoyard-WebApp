import {
  DEFAULT_PARTNER_SCOPES, PARTNER_SCOPES, PARTNER_SCOPE_META,
  effectiveKeyScopes, isPartnerScope, keyScopesProblem, partnerApiAccess,
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
    expect(isPartnerScope('nosuch:write')).toBe(false);
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
    expect(keyScopesProblem(['ipos:read'], ['nosuch:write'])).toBe('Unknown scope: nosuch:write.');
  });
});

describe('partnerApiAccess — the per-partner switch', () => {
  const partner = (enabled: boolean, scopes: string[] = ['print-forms', 'ipos:read']) => ({ type: 'partner', enabled, scopes });
  const branch = (enabled: boolean, scopes: string[] = []) => ({ type: 'branch', enabled, scopes });
  const platform = { type: 'platform', enabled: false, scopes: ['print-forms', 'ipos:read'] };

  it('a partner whose switch is off has no access, whatever its scopes say', () => {
    expect(partnerApiAccess([partner(false), platform])).toEqual({ enabled: false, scopes: [], reason: 'off' });
  });

  it('an enabled partner gets exactly its own scopes', () => {
    expect(partnerApiAccess([partner(true, ['allotment:read']), platform]))
      .toEqual({ enabled: true, scopes: ['allotment:read'], reason: null });
  });

  it('an enabled partner with NO scopes gets none — it no longer inherits the platform default', () => {
    expect(partnerApiAccess([partner(true, []), platform]).scopes).toEqual([]);
  });

  it('unknown scope names are dropped', () => {
    expect(partnerApiAccess([partner(true, ['print-forms', 'nonsense'])]).scopes).toEqual(['print-forms']);
  });

  it('a branch with no scopes of its own inherits its parent partner’s', () => {
    expect(partnerApiAccess([branch(true), partner(true, ['prints:read']), platform]).scopes).toEqual(['prints:read']);
  });

  it('a branch with its own list keeps it', () => {
    expect(partnerApiAccess([branch(true, ['ipos:read']), partner(true, ['prints:read'])]).scopes).toEqual(['ipos:read']);
  });

  it('a branch is off when its own switch is off', () => {
    expect(partnerApiAccess([branch(false), partner(true)]).reason).toBe('off');
  });

  it('a branch is off when its parent partner is off, even with its own switch on', () => {
    expect(partnerApiAccess([branch(true, ['ipos:read']), partner(false)]))
      .toEqual({ enabled: false, scopes: [], reason: 'parent-off' });
  });

  it('a missing tenant has no access', () => {
    expect(partnerApiAccess([]).enabled).toBe(false);
  });
});
