import {
  resolveIdentity,
  resolveContact,
  displayName,
  legalEntity,
  contentGaps,
  contentReady,
  DEFAULT_IDENTITY,
  TENANT_CONTENT_KEYS,
  mergeContentPatch,
  TenantIdentity,
} from './tenantContent';

/**
 * The fixtures are the two tenant shapes that actually exist: the Investoyard
 * Direct channel, and a partner approved through the onboarding queue whose
 * compliance details have not been entered yet.
 */
const DIRECT = { isDefault: true, name: 'Investoyard' };
const PARTNER = { isDefault: false, name: 'PartnerBank IPO' };

describe('resolveIdentity — a white-label never inherits our identity', () => {
  it('fills OUR legal name for the default channel', () => {
    expect(resolveIdentity(DIRECT).legalName).toBe('Safal Capital Services Private Limited');
  });

  it('DOES NOT fill our legal name for a partner — the whole point', () => {
    expect(resolveIdentity(PARTNER).legalName).toBeUndefined();
  });

  it('gives a partner their own name as the trade name, since the header already shows it', () => {
    expect(resolveIdentity(PARTNER).tradeName).toBe('PartnerBank IPO');
  });

  it('publishes a partner legal name once they supply one', () => {
    const id = resolveIdentity({ ...PARTNER, identity: { legalName: 'PartnerBank Securities Limited' } });
    expect(id.legalName).toBe('PartnerBank Securities Limited');
    expect(id.tradeName).toBe('PartnerBank IPO');
  });

  it('lets a partner override the trade name too', () => {
    expect(resolveIdentity({ ...PARTNER, identity: { tradeName: 'PB Invest' } }).tradeName).toBe('PB Invest');
  });

  it('lets the operator override OUR fallback on the default channel', () => {
    expect(resolveIdentity({ ...DIRECT, identity: { legalName: 'Safal Capital Services Pvt Ltd' } }).legalName)
      .toBe('Safal Capital Services Pvt Ltd');
  });

  /* A blanked admin field posts "" rather than disappearing, and an empty string
     would print as an empty footer line rather than reading as absent. */
  it('treats an empty string and whitespace as absent, not as a value', () => {
    const id = resolveIdentity({ ...PARTNER, identity: { legalName: '   ', cin: '' } });
    expect(id.legalName).toBeUndefined();
    expect(id.cin).toBeUndefined();
  });

  it('clears our fallback back to ours rather than to "" on the default channel', () => {
    expect(resolveIdentity({ ...DIRECT, identity: { legalName: '' } }).legalName)
      .toBe(DEFAULT_IDENTITY.legalName);
  });

  it('trims a pasted value', () => {
    expect(resolveIdentity({ ...PARTNER, identity: { cin: '  U67190MH2010PTC123456 ' } }).cin)
      .toBe('U67190MH2010PTC123456');
  });

  it('never mutates the frozen default', () => {
    resolveIdentity({ ...DIRECT, identity: { legalName: 'Something Else' } });
    expect(DEFAULT_IDENTITY.legalName).toBe('Safal Capital Services Private Limited');
  });
});

describe('resolveContact — substituted for nobody, ever', () => {
  it('is empty when a partner has entered nothing', () => {
    expect(resolveContact(undefined)).toEqual({});
  });

  it('is empty for the DEFAULT channel too — we do not hard-code a support email', () => {
    /* Inventing one would publish an address nobody reads; ours belongs in the
       database beside every other tenant's. */
    expect(resolveContact({})).toEqual({});
  });

  it('keeps what was entered and drops what was blanked', () => {
    expect(resolveContact({ supportEmail: 'help@partner.com', supportPhone: '  ' }))
      .toEqual({ supportEmail: 'help@partner.com' });
  });

  it('keeps newlines in an address block', () => {
    expect(resolveContact({ officeAddress: '12 Main Road\nMumbai 400001' }).officeAddress)
      .toBe('12 Main Road\nMumbai 400001');
  });
});

describe('displayName / legalEntity', () => {
  it('shows the trade name on the default channel', () => {
    expect(displayName(DIRECT)).toBe('Investoyard');
  });

  it('falls back to the tenant name for a partner with nothing entered', () => {
    expect(displayName(PARTNER)).toBe('PartnerBank IPO');
  });

  it('prefers a supplied trade name over the legal one', () => {
    expect(displayName({ ...PARTNER, identity: { legalName: 'PartnerBank Securities Limited', tradeName: 'PB Invest' } }))
      .toBe('PB Invest');
  });

  /* The copyright line and the structured data's legalName must print the
     ACCOUNTABLE entity. A brand name there is the misstatement this module
     exists to prevent, so the caller gets undefined and says nothing. */
  it('returns undefined rather than a brand name when no legal entity is known', () => {
    expect(legalEntity(PARTNER)).toBeUndefined();
    expect(legalEntity({ ...PARTNER, identity: { tradeName: 'PB Invest' } })).toBeUndefined();
  });

  it('returns ours on the default channel', () => {
    expect(legalEntity(DIRECT)).toBe('Safal Capital Services Private Limited');
  });
});

describe('contentGaps — what staff must chase before a domain goes live', () => {
  it('says nothing about the default channel', () => {
    expect(contentGaps(DIRECT)).toEqual([]);
    expect(contentReady(DIRECT)).toBe(true);
  });

  it('blocks a fresh partner on the legal name and both grievance fields', () => {
    const blocking = contentGaps(PARTNER).filter((g) => g.severity === 'blocking').map((g) => g.field);
    expect(blocking).toEqual(['legalName', 'grievanceName', 'grievanceEmail']);
    expect(contentReady(PARTNER)).toBe(false);
  });

  it('still reports the advisory gaps beside the blocking ones', () => {
    const advisory = contentGaps(PARTNER).filter((g) => g.severity === 'advisory').map((g) => g.field);
    expect(advisory).toEqual(['supportEmail', 'supportPhone', 'sebiRegistration', 'registeredAddress']);
  });

  it('clears to ready on the three blocking fields alone', () => {
    const input = {
      ...PARTNER,
      identity: { legalName: 'PartnerBank Securities Limited' },
      contact: { grievanceName: 'A Mehta', grievanceEmail: 'grievance@partner.com' },
    };
    expect(contentReady(input)).toBe(true);
    /* Ready is not the same as complete — the advisory rows stay listed. */
    expect(contentGaps(input).length).toBeGreaterThan(0);
  });

  it('is NOT satisfied by a trade name standing in for the legal one', () => {
    expect(contentReady({ ...PARTNER, identity: { tradeName: 'PB Invest' } })).toBe(false);
  });

  it('every gap names a key the content store actually has', () => {
    for (const g of contentGaps(PARTNER)) {
      expect(TENANT_CONTENT_KEYS as readonly string[]).toContain(g.key);
    }
  });
});

describe('mergeContentPatch — what an admin save stores', () => {
  it('adds a field', () => {
    expect(mergeContentPatch<{ legalName?: string }>(undefined, { legalName: 'PartnerBank Securities Limited' }))
      .toEqual({ legalName: 'PartnerBank Securities Limited' });
  });

  it('overwrites a field', () => {
    expect(mergeContentPatch({ supportEmail: 'old@p.com' }, { supportEmail: 'new@p.com' }))
      .toEqual({ supportEmail: 'new@p.com' });
  });

  /* The form posts every box it renders, so a cleared box and an untouched empty
     one arrive the same way — storing "" would read as present to anything that
     only checks for the key. */
  it('a BLANKED box deletes the field rather than storing ""', () => {
    expect(mergeContentPatch({ supportPhone: '+91 22 1234 5678' }, { supportPhone: '' }))
      .toEqual({});
  });

  it('leaves a field the patch does not mention alone', () => {
    expect(mergeContentPatch({ supportEmail: 'help@p.com', hours: 'Mon-Fri' }, { hours: 'Mon-Sat' }))
      .toEqual({ supportEmail: 'help@p.com', hours: 'Mon-Sat' });
  });

  it('ignores an explicit undefined — absent from the patch, not cleared', () => {
    expect(mergeContentPatch({ supportEmail: 'help@p.com' }, { supportEmail: undefined }))
      .toEqual({ supportEmail: 'help@p.com' });
  });

  it('trims on the way in', () => {
    expect(mergeContentPatch({}, { gstin: ' 27AAAAA0000A1Z5 ' })).toEqual({ gstin: '27AAAAA0000A1Z5' });
  });

  /* A legacy row that already holds "" is cleaned the next time anything is
     saved, rather than needing a migration of its own. */
  it('compacts the EXISTING value too, so a stored "" does not survive a save', () => {
    expect(mergeContentPatch<TenantIdentity>({ cin: '', legalName: 'X Ltd' }, { gstin: '27AAAAA0000A1Z5' }))
      .toEqual({ legalName: 'X Ltd', gstin: '27AAAAA0000A1Z5' });
  });

  it('does not mutate what it was given', () => {
    const existing = { supportEmail: 'help@p.com' };
    mergeContentPatch(existing, { supportEmail: '' });
    expect(existing).toEqual({ supportEmail: 'help@p.com' });
  });
});
