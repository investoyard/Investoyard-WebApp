import {
  OPERATOR_ONLY_IDENTITY_FIELDS,
  isOperatorOnlyIdentityField,
  stripOperatorOnlyIdentity,
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
  hasPage,
  TENANT_PAGE_KEYS,
  TENANT_WRITABLE_KEYS,
  REQUIRED_PAGE_KEYS,
  PAGE_LABEL,
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

  it('blocks a fresh partner on the legal name, both grievance fields AND the three legal pages', () => {
    const blocking = contentGaps(PARTNER).filter((g) => g.severity === 'blocking');
    expect(blocking.map((g) => g.field === 'html' ? g.key : g.field))
      .toEqual(['legalName', 'grievanceName', 'grievanceEmail', 'terms', 'privacy', 'disclaimer']);
    expect(contentReady(PARTNER)).toBe(false);
  });

  it('still reports the advisory gaps beside the blocking ones', () => {
    const advisory = contentGaps(PARTNER).filter((g) => g.severity === 'advisory');
    expect(advisory.map((g) => g.field === 'html' ? g.key : g.field))
      .toEqual(['supportEmail', 'supportPhone', 'sebiRegistration', 'registeredAddress', 'about']);
  });

  it('three fields clear the IDENTITY half; the pages are then what is left', () => {
    const input = {
      ...PARTNER,
      identity: { legalName: 'PartnerBank Securities Limited' },
      contact: { grievanceName: 'A Mehta', grievanceEmail: 'grievance@partner.com' },
    };
    /* Not ready, and ONLY because of the pages — nothing on the identity side
       is blocking any more. */
    expect(contentReady(input)).toBe(false);
    expect(contentGaps(input).filter((g) => g.severity === 'blocking').map((g) => g.key))
      .toEqual(['terms', 'privacy', 'disclaimer']);
    /* Ready is not the same as complete — the advisory rows stay listed. */
    expect(contentGaps(input).length).toBeGreaterThan(0);
  });

  it('is NOT satisfied by a trade name standing in for the legal one', () => {
    expect(contentReady({ ...PARTNER, identity: { tradeName: 'PB Invest' } })).toBe(false);
  });

  it('every gap names a key the content store actually has', () => {
    for (const g of contentGaps(PARTNER)) {
      expect(TENANT_WRITABLE_KEYS as readonly string[]).toContain(g.key);
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

describe('hasPage — an empty editor is not a published page', () => {
  it('is false for undefined, empty and whitespace', () => {
    expect(hasPage(undefined)).toBe(false);
    expect(hasPage({})).toBe(false);
    expect(hasPage({ html: '' })).toBe(false);
    expect(hasPage({ html: '   ' })).toBe(false);
  });

  /* TipTap serialises an empty document as <p></p>, never ''. Treating that as
     present would publish a blank legal page AND clear the gap that should
     still be open — the worse of the two failures by far. */
  it('is false for an EMPTY TipTap document', () => {
    expect(hasPage({ html: '<p></p>' })).toBe(false);
    expect(hasPage({ html: '<p><br></p>' })).toBe(false);
    expect(hasPage({ html: '<p>&nbsp;</p>' })).toBe(false);
  });

  it('is true once there is real text', () => {
    expect(hasPage({ html: '<p>These terms govern…</p>' })).toBe(true);
  });

  it('is false for a non-string, which a hand-edited row could hold', () => {
    expect(hasPage({ html: 42 as unknown as string })).toBe(false);
  });
});

describe('contentGaps — the published pages', () => {
  const PAGES = {
    about: { html: '<p>About PartnerBank.</p>' },
    terms: { html: '<p>Terms.</p>' },
    privacy: { html: '<p>Privacy.</p>' },
    disclaimer: { html: '<p>Disclaimer.</p>' },
  };
  const FILLED = {
    ...PARTNER,
    identity: { legalName: 'PartnerBank Securities Limited' },
    contact: { grievanceName: 'A Mehta', grievanceEmail: 'grievance@partner.com' },
  };

  it('BLOCKS a partner on terms, privacy and disclaimer', () => {
    const blocking = contentGaps(FILLED).filter((g) => g.severity === 'blocking').map((g) => g.key);
    expect(blocking).toEqual(['terms', 'privacy', 'disclaimer']);
    expect(contentReady(FILLED)).toBe(false);
  });

  /* A shop window is not a contract. */
  it('treats about as advisory, not blocking', () => {
    const about = contentGaps(FILLED).find((g) => g.key === 'about');
    expect(about?.severity).toBe('advisory');
  });

  it('clears once the three legal pages exist', () => {
    expect(contentReady({ ...FILLED, pages: PAGES })).toBe(true);
  });

  /* The whole point of hasPage: an operator who opened the editor and saved
     without typing has NOT published a Terms page. */
  it('is NOT cleared by an empty editor saved over a legal page', () => {
    expect(contentReady({ ...FILLED, pages: { ...PAGES, terms: { html: '<p></p>' } } })).toBe(false);
  });

  it('says nothing about the default channel, pages included', () => {
    expect(contentGaps(DIRECT)).toEqual([]);
    expect(contentReady(DIRECT)).toBe(true);
  });

  it('every page gap names a key the store actually has', () => {
    for (const g of contentGaps(FILLED).filter((x) => x.field === 'html')) {
      expect(TENANT_PAGE_KEYS as readonly string[]).toContain(g.key);
    }
  });
});

describe('the two key lists are deliberately separate', () => {
  /* Adding a page key to TENANT_CONTENT_KEYS would put every partner's legal
     prose on the PUBLIC registry that every page load fetches. */
  it('no page key leaks into the registry list', () => {
    for (const k of TENANT_PAGE_KEYS) {
      expect(TENANT_CONTENT_KEYS as readonly string[]).not.toContain(k);
    }
  });

  it('the writable union covers both and nothing else', () => {
    expect([...TENANT_WRITABLE_KEYS].sort())
      .toEqual([...TENANT_CONTENT_KEYS, ...TENANT_PAGE_KEYS].sort());
  });

  it('every required page is a real page key', () => {
    for (const k of REQUIRED_PAGE_KEYS) {
      expect(TENANT_PAGE_KEYS as readonly string[]).toContain(k);
    }
  });

  it('every page key has a label', () => {
    for (const k of TENANT_PAGE_KEYS) expect(PAGE_LABEL[k]).toBeTruthy();
  });
});

describe('who may edit which identity field', () => {
  it('names the four that identify the entity or its registrations', () => {
    expect([...OPERATOR_ONLY_IDENTITY_FIELDS]).toEqual(['legalName', 'sebiRegistration', 'cin', 'gstin']);
  });

  it('leaves trade name and address to the partner — those are not the approval record', () => {
    expect(isOperatorOnlyIdentityField('tradeName')).toBe(false);
    expect(isOperatorOnlyIdentityField('registeredAddress')).toBe(false);
  });

  it('strips the operator-only fields and keeps the rest', () => {
    const patch = {
      legalName: 'Someone Else Pvt Ltd', sebiRegistration: 'INZ999', cin: 'X', gstin: 'Y',
      tradeName: 'Broker', registeredAddress: '12 Main St',
    };
    expect(stripOperatorOnlyIdentity(patch)).toEqual({ tradeName: 'Broker', registeredAddress: '12 Main St' });
  });

  // DROP rather than refuse: the panel posts every box it renders, so a partner
  // saving a trade name sends the legal name back unchanged. Refusing that save
  // would make the panel unusable for the fields they ARE allowed to edit.
  it('drops an UNCHANGED operator-only field without refusing the save', () => {
    const out = stripOperatorOnlyIdentity({ legalName: 'Acme Ltd', tradeName: 'Acme' });
    expect(out).toEqual({ tradeName: 'Acme' });
    expect('legalName' in out).toBe(false);
  });

  // A dropped key is not the same as an empty one: mergeContentPatch DELETES on
  // '' and leaves a key it never sees alone. Stripping must produce the latter,
  // or a partner's save would wipe the legal name off their own footer.
  it('a stripped field is ABSENT, so mergeContentPatch cannot delete it', () => {
    const stored = { legalName: 'Acme Ltd', tradeName: 'Old' };
    const merged = mergeContentPatch(stored, stripOperatorOnlyIdentity({ legalName: '', tradeName: 'New' }));
    expect(merged).toEqual({ legalName: 'Acme Ltd', tradeName: 'New' });
  });

  it('a superadmin patch is untouched — the caller decides whether to strip', () => {
    const patch = { legalName: 'Acme Ltd', tradeName: 'Acme' };
    expect(mergeContentPatch({}, patch)).toEqual(patch);
  });

  it('survives an empty or junk patch', () => {
    expect(stripOperatorOnlyIdentity({})).toEqual({});
    expect(stripOperatorOnlyIdentity(undefined as any)).toEqual({});
  });
});
