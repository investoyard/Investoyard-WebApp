/* Jest, with the globals. No `import … from 'vitest'`: this package has no
 * vitest dependency, `tsconfig.json` compiles `src/**` including the specs, so
 * such an import passes under `npx vitest` and breaks `npm run build`.
 */
import {
  SITE_TEMPLATES,
  SiteFont,
  SITE_FONTS,
  SITE_TEXT_FIELDS,
  SITE_FLAG_FIELDS,
  DEFAULT_TEMPLATE,
  DEFAULT_FONT,
  DEFAULT_SITE_COPY,
  SIGN_IN_LABEL,
  isSiteTemplate,
  isSiteFont,
  templateMeta,
  fontMeta,
  defaultHeadline,
  resolveSite,
  siteGaps,
  type SiteTemplate,
  type SiteTemplateMeta,
  type TenantSite,
} from './tenantSite';
import {
  TENANT_CONTENT_KEYS,
  TENANT_PAGE_KEYS,
  TENANT_WRITABLE_KEYS,
  mergeContentPatch,
  contentGaps,
  contentReady,
  DEFAULT_IDENTITY,
} from './tenantContent';

const partner = (site?: TenantSite) => ({ isDefault: false, name: 'Kosha Securities', site });

describe('the template registry', () => {
  it('has a unique id per entry and no id outside the type', () => {
    const ids = SITE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    /* Compile-time already pins this; the runtime check is what catches an id
       added to the list and never added to the union (or the reverse). */
    const union: SiteTemplate[] = ['default', 'meridian', 'onyx', 'cobalt'];
    expect([...ids].sort()).toEqual([...union].sort());
  });

  it('pins the FONT list against its union too', () => {
    /* The templates have had this guard since the registry existed and the
       fonts never did — the same drift is possible on both, and `ibmplex` is
       the first addition that could have shown it. */
    const ids = SITE_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const union: SiteFont[] = ['default', 'figtree', 'manrope', 'fraunces', 'ibmplex'];
    expect([...ids].sort()).toEqual([...union].sort());
    expect(SITE_FONTS.some((f) => f.id === DEFAULT_FONT)).toBe(true);
  });

  it('carries the default as a REAL member, not as the absence of one', () => {
    /* "No template" and "our template" must be one rendering, not two states. */
    expect(SITE_TEMPLATES.some((t) => t.id === DEFAULT_TEMPLATE)).toBe(true);
    expect(isSiteTemplate(DEFAULT_TEMPLATE)).toBe(true);
  });

  it('says who every layout is for, which is the only thing that helps a choice', () => {
    for (const t of SITE_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(20);
    }
  });

  it('records the canvas variant for every layout built from one', () => {
    /* Traceability back to the artwork after the .dc.html files are gone. Only
       the default has no design behind it, because it predates them.
       Read through the interface: `as const satisfies` narrows each entry to its
       own literal type, which does not carry an absent optional at all. */
    for (const t of SITE_TEMPLATES as readonly SiteTemplateMeta[]) {
      if (t.id === 'default') expect(t.design).toBeUndefined();
      else expect(typeof t.design).toBe('string');
    }
  });

  it('refuses anything that is not a known id', () => {
    for (const v of ['2a', 'Default', '', ' default', null, undefined, 7, {}, ['default']]) {
      expect(isSiteTemplate(v)).toBe(false);
    }
  });

  it('falls back rather than throwing when asked about an unknown id', () => {
    expect(templateMeta('nope' as SiteTemplate).id).toBe('default');
  });
});

describe('the font registry', () => {
  it('names a display face, a body face and the build variable for each', () => {
    for (const f of SITE_FONTS) {
      expect(f.display.length).toBeGreaterThan(0);
      expect(f.body.length).toBeGreaterThan(0);
      expect(f.cssVar.startsWith('--')).toBe(true);
    }
  });

  it('has a unique id and a unique css variable per entry', () => {
    const ids = SITE_FONTS.map((f) => f.id);
    const vars = SITE_FONTS.map((f) => f.cssVar);
    expect(new Set(ids).size).toBe(ids.length);
    /* Two entries sharing a variable would silently serve one of the faces for
       both — the font equivalent of a CSS class collision. */
    expect(new Set(vars).size).toBe(vars.length);
  });

  it('refuses an arbitrary family name, which is the point of a curated list', () => {
    expect(isSiteFont('Comic Sans')).toBe(false);
    expect(isSiteFont('figtree')).toBe(true);
    expect(fontMeta('nope' as never).id).toBe('default');
  });
});

describe('resolveSite — the identity rule', () => {
  it('NEVER falls back to our tagline for a partner headline', () => {
    const r = resolveSite(partner());
    expect(r.headline).not.toMatch(/never been this easy/i);
    expect(r.headline).not.toMatch(/investoyard/i);
  });

  it('derives the headline from the partner own trade name', () => {
    expect(resolveSite(partner()).headline).toBe('Every IPO, applied from your Kosha Securities account');
    expect(defaultHeadline('Acme')).toContain('Acme');
  });

  it('does not SHOUT a name that was registered in capitals', () => {
    /* Measured, not assumed: five of the eight real tenants store an all-caps
       `Tenant.name`, so this is the common case and not an edge one. */
    expect(defaultHeadline('ACML CAPITAL MARKETS LIMITED'))
      .toBe('Every IPO, applied from your Acml Capital Markets account');
    expect(defaultHeadline('JHAVERI SECURITIES LIMITED'))
      .toBe('Every IPO, applied from your Jhaveri Securities account');
    /* A properly-cased name is left alone — shortName only strips a TRAILING
       Limited/Ltd, so a mid-name word survives. */
    expect(defaultHeadline('Kosha Securities')).toContain('Kosha Securities');
  });

  it('reads badly on a dotted initialism, which is why a real headline is ASKED FOR', () => {
    /* `titleCase` keeps a known acronym (HDFC, SBI, NTPC) and cannot know about
       a dotted one, so this fallback is imperfect on 1 of the 8 real tenants.
       Pinned as KNOWN rather than left to surprise someone: it is survivable
       only because `siteGaps` chases the partner for their own headline. */
    expect(defaultHeadline('N.V.INVESTMENTS')).toContain('N.v.investments');
    expect(siteGaps(partner({ template: 'meridian' })).map((g) => g.field)).toContain('headline');
  });

  it('prefers a supplied headline, and treats whitespace as absent', () => {
    expect(resolveSite(partner({ headline: 'Apply in two taps' })).headline).toBe('Apply in two taps');
    expect(resolveSite(partner({ headline: '   ' })).headline).toContain('Kosha Securities');
  });

  it('leaves no undefined for the view to guess at', () => {
    const r = resolveSite(partner());
    expect(r.sub).toBe(DEFAULT_SITE_COPY.sub);
    expect(r.navCta).toBe(DEFAULT_SITE_COPY.navCta);
    /* THE TWO HEADER ACTIONS MUST NOT CARRY THE SAME LABEL. The default used
       to be 'Sign in', which is the ghost link's own label, so an untouched
       partner got two identical buttons — and the primary one points at
       /signup, so it also named the wrong action. */
    expect(r.navCta).not.toBe(SIGN_IN_LABEL);
    expect(r.applyCta).toBe(DEFAULT_SITE_COPY.applyCta);
    expect(r.template).toBe(DEFAULT_TEMPLATE);
    expect(r.font).toBe(DEFAULT_FONT);
  });
});

describe('resolveSite — the template and font choice', () => {
  it('honours a partner choice', () => {
    const r = resolveSite(partner({ template: 'meridian', font: 'fraunces' }));
    expect(r.template).toBe('meridian');
    expect(r.font).toBe('fraunces');
  });

  it('falls back on a stored value that is no longer a known id', () => {
    /* A template retired from the list leaves rows pointing at it. Rendering our
       own layout is survivable; throwing in a resolver every page calls is not. */
    const r = resolveSite(partner({ template: 'retired' as SiteTemplate, font: 'wingdings' as never }));
    expect(r.template).toBe(DEFAULT_TEMPLATE);
    expect(r.font).toBe(DEFAULT_FONT);
  });

  it('pins the DEFAULT channel to our own layout whatever is stored', () => {
    const r = resolveSite({ isDefault: true, name: 'Investoyard', site: { template: 'meridian', font: 'figtree' } });
    expect(r.template).toBe(DEFAULT_TEMPLATE);
    expect(r.font).toBe(DEFAULT_FONT);
  });
});

describe('resolveSite — a block is gated on its own data, not on its flag', () => {
  it('renders no RM card for a flag with no person named in it', () => {
    expect(resolveSite(partner({ showRm: true })).rm).toBeUndefined();
    expect(resolveSite(partner({ showRm: true, rmName: '  ' })).rm).toBeUndefined();
  });

  it('renders the RM card once a name exists, with a default label', () => {
    const rm = resolveSite(partner({ showRm: true, rmName: 'Priya Nair' })).rm;
    expect(rm?.name).toBe('Priya Nair');
    expect(rm?.label.length).toBeGreaterThan(0);
    /* The optional parts stay absent rather than becoming empty strings. */
    expect(rm?.role).toBeUndefined();
    expect(rm?.blurb).toBeUndefined();
  });

  it('does not render the RM card when the flag is off, however complete the block', () => {
    expect(resolveSite(partner({ rmName: 'Priya Nair', rmRole: 'RM' })).rm).toBeUndefined();
    expect(resolveSite(partner({ showRm: false, rmName: 'Priya Nair' })).rm).toBeUndefined();
  });

  it('renders no utility bar with neither link in it', () => {
    expect(resolveSite(partner({ showUtility: true })).utility).toBeUndefined();
  });

  it('renders the utility bar with EITHER link, carrying only what exists', () => {
    expect(resolveSite(partner({ showUtility: true, mainSiteUrl: 'https://kosha.test' })).utility)
      .toEqual({ mainSiteUrl: 'https://kosha.test' });
    expect(resolveSite(partner({ showUtility: true, supportUrl: 'https://kosha.test/help' })).utility)
      .toEqual({ supportUrl: 'https://kosha.test/help' });
  });

  it('renders no app band without somewhere for it to point', () => {
    expect(resolveSite(partner({ showApp: true })).appUrl).toBeUndefined();
    expect(resolveSite(partner({ showApp: true, appUrl: 'https://kosha.test/app' })).appUrl)
      .toBe('https://kosha.test/app');
  });
});

describe('siteGaps', () => {
  it('says nothing while the tenant is on our default layout', () => {
    /* None of these fields is rendered by it — asking for a hero headline on a
       page with no hero is noise. */
    expect(siteGaps(partner())).toEqual([]);
    expect(siteGaps(partner({ showRm: true }))).toEqual([]);
  });

  it('says nothing for the default channel', () => {
    expect(siteGaps({ isDefault: true, name: 'Investoyard', site: { template: 'meridian' } })).toEqual([]);
  });

  it('asks for the hero copy once a layout is chosen', () => {
    const fields = siteGaps(partner({ template: 'meridian' })).map((g) => g.field);
    expect(fields).toContain('headline');
    expect(fields).toContain('sub');
  });

  it('is the ONLY thing that mentions a flag with nothing behind it', () => {
    /* The page silently renders no block, correctly — so if this did not report
       it, nothing ever would. */
    const g = (s: TenantSite) => siteGaps(partner({ template: 'meridian', ...s })).map((x) => x.field);
    expect(g({ showRm: true })).toContain('rmName');
    expect(g({ showApp: true })).toContain('appUrl');
    expect(g({ showUtility: true })).toContain('mainSiteUrl');
    /* and stops once the data is there */
    expect(g({ showRm: true, rmName: 'Priya Nair' })).not.toContain('rmName');
    expect(g({ showUtility: true, supportUrl: 'https://kosha.test/help' })).not.toContain('mainSiteUrl');
  });

  it('does not ask about a block whose flag is off', () => {
    const fields = siteGaps(partner({ template: 'meridian' })).map((x) => x.field);
    expect(fields).not.toContain('rmName');
    expect(fields).not.toContain('appUrl');
  });
});

describe('the site key on the content row', () => {
  it('rides the PUBLIC registry, with the rich-text pages still excluded from it', () => {
    expect(TENANT_CONTENT_KEYS as readonly string[]).toContain('site');
    /* The split that keeps a home-page reader from downloading legal prose. */
    for (const k of TENANT_PAGE_KEYS) {
      expect(TENANT_CONTENT_KEYS as readonly string[]).not.toContain(k);
    }
  });

  it('is writable', () => {
    expect(TENANT_WRITABLE_KEYS as readonly string[]).toContain('site');
  });

  it('reaches contentGaps as ADVISORY and can never block go-live', () => {
    const base = {
      isDefault: false,
      name: 'Kosha Securities',
      identity: { legalName: 'Kosha Securities Private Limited' },
      contact: { grievanceName: 'Priya Nair', grievanceEmail: 'grievance@kosha.test' },
      pages: {
        terms: { html: '<p>t</p>' },
        privacy: { html: '<p>p</p>' },
        disclaimer: { html: '<p>d</p>' },
      },
    };
    /* Ready with no site row at all... */
    expect(contentReady(base)).toBe(true);
    /* ...and still ready with a template chosen and none of its copy written. */
    const withSite = { ...base, site: { template: 'meridian' as SiteTemplate, showRm: true } };
    expect(contentReady(withSite)).toBe(true);
    const site = contentGaps(withSite).filter((g) => g.key === 'site');
    expect(site.length).toBeGreaterThan(0);
    expect(site.every((g) => g.severity === 'advisory')).toBe(true);
  });

  it('names the gap against the trade name the site will actually print', () => {
    /* contentGaps resolves the display name before deriving a headline, so a
       partner with a trade name set is asked about THAT name's headline. */
    const gaps = contentGaps({
      isDefault: false,
      name: 'kosha-securities',
      identity: { tradeName: 'Kosha' },
      site: { template: 'meridian', headline: 'x' },
    });
    expect(gaps.filter((g) => g.key === 'site').map((g) => g.field)).not.toContain('headline');
  });
});

describe('mergeContentPatch — the boolean fault these toggles exposed', () => {
  it('STORES true, where the string-only writer deleted it', () => {
    /* `trim(true)` is undefined, which the old writer read as "cleared" and
       deleted — a toggle that could never be switched on, with no error. */
    expect(mergeContentPatch<TenantSite>(undefined, { showRm: true })).toEqual({ showRm: true });
  });

  it('STORES false rather than dropping it', () => {
    /* Dropping would make "turned off" and "not decided" one stored state. */
    expect(mergeContentPatch<TenantSite>({ showRm: true }, { showRm: false })).toEqual({ showRm: false });
  });

  it('does not lose a stored boolean when a later patch touches something else', () => {
    /* `compact(existing)` was string-only too, so the second write dropped it. */
    const after = mergeContentPatch<TenantSite>({ showRm: true, rmName: 'Priya Nair' }, { rmRole: 'RM' });
    expect(after.showRm).toBe(true);
    expect(after.rmName).toBe('Priya Nair');
    expect(after.rmRole).toBe('RM');
  });

  it('still deletes a string that is blanked, which is the behaviour it had', () => {
    expect(mergeContentPatch<TenantSite>({ headline: 'old' }, { headline: '' })).toEqual({});
    expect(mergeContentPatch<TenantSite>({ headline: 'old' }, { headline: '   ' })).toEqual({});
  });

  it('still leaves a key the patch does not mention alone', () => {
    const after = mergeContentPatch<TenantSite>({ headline: 'keep me' }, { sub: 'new' });
    expect(after.headline).toBe('keep me');
  });

  it('did not change how identity merges, which has no booleans', () => {
    expect(mergeContentPatch({ legalName: 'A Ltd', cin: 'X' }, { cin: '' }))
      .toEqual({ legalName: 'A Ltd' });
    expect(DEFAULT_IDENTITY.legalName).toBe('Safal Capital Services Private Limited');
  });
});

describe('the field lists the admin DTO is built from', () => {
  it('cover every field on the shape, with no overlap', () => {
    const text = SITE_TEXT_FIELDS as readonly string[];
    const flags = SITE_FLAG_FIELDS as readonly string[];
    expect(text.filter((f) => flags.includes(f))).toEqual([]);
    /* A field on the interface and on neither list is one the admin panel can
       never save — the whitelist IS the write surface. */
    const declared = new Set([...text, ...flags, 'template', 'font']);
    const sample: Required<TenantSite> = {
      template: 'meridian', font: 'figtree',
      headline: '', sub: '', navCta: '', applyCta: '', applyNote: '',
      showUtility: false, mainSiteUrl: '', supportUrl: '',
      showApp: false, appUrl: '',
      showRm: false, rmLabel: '', rmName: '', rmRole: '', rmBlurb: '', rmContact: '', rmCta: '',
    };
    for (const k of Object.keys(sample)) expect(declared.has(k)).toBe(true);
    expect(declared.size).toBe(Object.keys(sample).length);
  });
});
