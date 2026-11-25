import { partnerSiteFingerprint, partnerSiteFingerprintList, parsePartnerSiteFingerprints, partnerSiteGate } from './partnerSite';

const base = {
  slug: 'finwave', name: 'FINWAVE', customDomain: 'newipo.finwave.co', brandColor: '#3C2E7E',
  logoUrl: '/api/uploads/a.svg', footerLogoUrl: null, flags: { gmpEnabled: false },
  content: { identity: { legalName: 'Finwave Pvt Ltd' }, contact: { grievanceName: 'A', grievanceEmail: 'a@x.in' } },
};

describe('partnerSiteFingerprint', () => {
  it('is stable and 8 hex characters', () => {
    expect(partnerSiteFingerprint(base)).toMatch(/^[0-9a-f]{8}$/);
    expect(partnerSiteFingerprint({ ...base })).toBe(partnerSiteFingerprint(base));
  });
  it('ignores key order, blanks and the domain\'s case or trailing dot', () => {
    const shuffled = { content: { contact: { grievanceEmail: 'a@x.in', grievanceName: 'A' }, identity: { legalName: 'Finwave Pvt Ltd', sebi: '' } },
      flags: { gmpEnabled: false }, footerLogoUrl: '', logoUrl: '/api/uploads/a.svg', brandColor: '#3C2E7E', customDomain: 'NewIPO.finwave.co.', name: 'FINWAVE', slug: 'finwave' };
    expect(partnerSiteFingerprint(shuffled as any)).toBe(partnerSiteFingerprint(base));
  });
  it('changes with anything the build bakes', () => {
    const fp = partnerSiteFingerprint(base);
    expect(partnerSiteFingerprint({ ...base, brandColor: '#000000' })).not.toBe(fp);
    expect(partnerSiteFingerprint({ ...base, logoUrl: '/api/uploads/b.svg' })).not.toBe(fp);
    expect(partnerSiteFingerprint({ ...base, customDomain: 'ipo.finwave.co' })).not.toBe(fp);
    expect(partnerSiteFingerprint({ ...base, flags: { gmpEnabled: true } })).not.toBe(fp);
    expect(partnerSiteFingerprint({ ...base, content: { ...base.content, contact: { grievanceName: 'B', grievanceEmail: 'a@x.in' } } })).not.toBe(fp);
  });
  it('ignores the design, which is a re-route rather than a rebuild', () => {
    expect(partnerSiteFingerprint({ ...base, content: { ...base.content, site: { template: 'prism' } } } as any)).toBe(partnerSiteFingerprint(base));
  });
});

describe('fingerprint list', () => {
  it('round-trips', () => {
    const s = partnerSiteFingerprintList([base, { ...base, slug: 'sihl' }]);
    const m = parsePartnerSiteFingerprints(s);
    expect(m.get('finwave')).toBe(partnerSiteFingerprint(base));
    expect(m.size).toBe(2);
    expect(parsePartnerSiteFingerprints(null).size).toBe(0);
  });
});

describe('partnerSiteGate', () => {
  it('passes with legal name and grievance officer', () => {
    expect(partnerSiteGate(base)).toEqual([]);
  });
  it('names what is missing', () => {
    expect(partnerSiteGate({ name: 'FINWAVE', content: {} })).toEqual(['Registered company name', 'Grievance officer name', 'Grievance officer email']);
  });
  it('does not need the advisory fields', () => {
    expect(partnerSiteGate({ name: 'X', content: { identity: { legalName: 'X Ltd' }, contact: { grievanceName: 'A', grievanceEmail: 'a@x.in' } } })).toEqual([]);
  });
});
