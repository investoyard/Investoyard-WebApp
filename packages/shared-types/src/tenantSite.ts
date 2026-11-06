/**
 * Per-tenant SITE PRESENTATION — which layout a white-label's public site
 * renders in, the face it is set in, and the handful of strings and blocks that
 * are the partner's rather than ours.
 *
 * WHY A TEMPLATE EXISTS AT ALL. A white-label partner is a broker with their own
 * clients and their own idea of what a site is for: one wants the IPO table on
 * the first screen because their clients arrive to apply, another wants a
 * research reading surface, a third is signing up first-time investors and needs
 * to explain as it goes. One layout serves one of those three well.
 *
 * WHAT THIS MODULE IS NOT. It is not a page builder and deliberately cannot
 * become one. Every template renders the SAME sections from the SAME data — the
 * IPO list, the allotment checker, the four-step explainer, the trust footer —
 * in a different arrangement. There is no block the partner can add, reorder or
 * remove beyond the three toggles below, because a partner who can compose
 * arbitrary pages can compose one that omits the grievance officer.
 *
 * THE IDENTITY RULE FROM `tenantContent` STILL GOVERNS, and this module is where
 * it is easiest to break: a template needs a headline, and the obvious fallback
 * is ours. `resolveSite` never does that. An unsupplied headline is DERIVED FROM
 * THE PARTNER'S OWN TRADE NAME, which states nothing we are not entitled to say
 * on their behalf, and `siteGaps()` asks them for a real one.
 *
 * Shared because three readers need the same answer and must not disagree: the
 * WEB BUILD bakes the template per host into the pre-paint script, the BROWSER
 * re-resolves it from the public `/tenants` registry in case it moved since that
 * build, and the ADMIN PANEL renders the selector and the gap list.
 */
import { shortName } from './format';

/* --------------------------------------------------------------- templates */

/**
 * The layouts a tenant may choose, and the ONE place their ids live.
 *
 * `design` records which of Sir's canvas variants each one is, so a layout can
 * be traced back to the artwork it came from after the canvas file is gone. The
 * ids themselves are SEMANTIC rather than canvas coordinates ('2a', '2b'): they
 * end up in a `data-template` attribute, in CSS selectors and in a stored
 * database value, and a position on someone's canvas is the worst of all
 * possible durable names.
 *
 * `blurb` is Sir's own caption, verbatim where he wrote one. It says who each
 * layout is FOR, which is the only thing that helps an operator choose, and it
 * is better copy than anything that would be written to replace it.
 */
export interface SiteTemplateMeta {
  id: SiteTemplate;
  label: string;
  /** Who this layout is for. Shown in the admin selector. */
  blurb: string;
  /** The canvas variant this was built from, for traceability. */
  design?: string;
}

export const SITE_TEMPLATES = [
  {
    id: 'default',
    label: 'Investoyard (default)',
    blurb: 'Our own layout, exactly as investoyard.com renders it. Chosen when nothing else is.',
  },
  {
    id: 'broker',
    label: 'Broker',
    blurb: 'A full hero, then the IPO table. Best for a broker introducing themselves to new clients.',
    design: 'Broker Website v2',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    blurb: 'IPO cards first. Best for brokers whose clients come to apply.',
    design: '2a',
  },
  {
    id: 'detail',
    label: 'List and detail',
    blurb: 'Pick an IPO on the left, read it all on the right. Best for advisors and research-led brokers.',
    design: '2b',
  },
  {
    id: 'landing',
    label: 'Landing',
    blurb: 'Calm, centred, explains as it goes. Best for fintechs signing up first-time investors.',
    design: '2c',
  },
] as const satisfies readonly SiteTemplateMeta[];

export type SiteTemplate = 'default' | 'broker' | 'dashboard' | 'detail' | 'landing';

/**
 * What a tenant gets when they have chosen nothing — our own layout.
 *
 * It is a REAL MEMBER of the list rather than the absence of one, so the admin
 * selector can show it as a choice and an operator can switch a partner back to
 * it. "No template" and "our template" are the same rendering and must not be
 * two different states in the data.
 */
export const DEFAULT_TEMPLATE: SiteTemplate = 'default';

export const isSiteTemplate = (v: unknown): v is SiteTemplate =>
  typeof v === 'string' && SITE_TEMPLATES.some((t) => t.id === v);

export const templateMeta = (id: SiteTemplate): SiteTemplateMeta =>
  SITE_TEMPLATES.find((t) => t.id === id) ?? SITE_TEMPLATES[0];

/* ------------------------------------------------------------------- fonts */

/**
 * The typefaces a tenant may choose from, and WHY IT IS A CURATED LIST rather
 * than a free-text family name.
 *
 * `next/font` resolves and self-hosts each family AT BUILD TIME — it rewrites
 * the font files into the export and hands back a generated class. A family
 * named in the database at runtime cannot be fetched that way, so a free-text
 * field would have to load from Google's CDN on every partner page view: a
 * third-party request on the critical path, a layout shift the baked fonts do
 * not have, and a typo that silently falls back to the system stack.
 *
 * So each entry is a family the build already carries. `display` and `body` are
 * two roles because that is how the pages are set, and `cssVar` is the variable
 * `next/font` was asked to define — web maps these to its own imports, and the
 * mapping being in one place is what stops the admin panel offering a font the
 * build cannot serve.
 */
export interface SiteFontMeta {
  id: SiteFont;
  label: string;
  /** Headings. */
  display: string;
  /** Running text. */
  body: string;
  /** The CSS custom property the build defines for this pair's display face. */
  cssVar: string;
}

export const SITE_FONTS = [
  {
    id: 'default',
    label: 'Plus Jakarta Sans / Inter',
    display: 'Plus Jakarta Sans',
    body: 'Inter',
    cssVar: '--font-display',
  },
  {
    id: 'figtree',
    label: 'Figtree',
    display: 'Figtree',
    body: 'Figtree',
    cssVar: '--font-figtree',
  },
  {
    id: 'manrope',
    label: 'Manrope / Inter',
    display: 'Manrope',
    body: 'Inter',
    cssVar: '--font-manrope',
  },
  {
    id: 'fraunces',
    label: 'Fraunces / Inter',
    display: 'Fraunces',
    body: 'Inter',
    cssVar: '--font-fraunces',
  },
] as const satisfies readonly SiteFontMeta[];

export type SiteFont = 'default' | 'figtree' | 'manrope' | 'fraunces';

export const DEFAULT_FONT: SiteFont = 'default';

export const isSiteFont = (v: unknown): v is SiteFont =>
  typeof v === 'string' && SITE_FONTS.some((f) => f.id === v);

export const fontMeta = (id: SiteFont): SiteFontMeta =>
  SITE_FONTS.find((f) => f.id === id) ?? SITE_FONTS[0];

/* ------------------------------------------------------------------- shape */

/**
 * What a tenant stores about their site's presentation — one row of
 * `TenantContent`, under the key `site`.
 *
 * Every field is optional and the resolver has an answer for each absence: a
 * partner is approved long before their marketing copy is written, and a site
 * that renders sensible defaults beats one that cannot be published until every
 * box is filled.
 *
 * NOTE THE THREE BOOLEANS. They are the only non-string values in any content
 * row, and they are the reason `mergeContentPatch` and `compact` in
 * `tenantContent.ts` had to learn about booleans: both were string-only, so a
 * posted `true` hit `trim()`, came back undefined, and DELETED its own key —
 * a toggle that could never be switched on, failing silently.
 */
export interface TenantSite {
  /** Which layout. Absent = our own. */
  template?: SiteTemplate;
  /** Which typeface pair. Absent = ours. */
  font?: SiteFont;

  /* --- hero copy --- */
  /** The hero headline. Absent = derived from the trade name; never ours. */
  headline?: string;
  /** The sentence under it. */
  sub?: string;
  /** Label on the header's own call to action, e.g. "Open an account". */
  navCta?: string;
  /** Label on the hero's primary button, e.g. "Apply to an IPO". */
  applyCta?: string;
  /** The reassurance under that button, e.g. "No charges to apply." */
  applyNote?: string;

  /* --- the utility bar --- */
  /**
   * Shows the thin bar above the header: a link back to the broker's main site,
   * their support page, and the language switch.
   *
   * It exists because a white-label is usually not the client's first stop — they
   * arrive from the broker's trading platform and need the way back.
   */
  showUtility?: boolean;
  /** Where "back to main site" goes. Without it that link is not rendered. */
  mainSiteUrl?: string;
  /** Where "support" goes. Same rule. */
  supportUrl?: string;

  /* --- optional blocks --- */
  /** Shows the broker's own app promotion band. */
  showApp?: boolean;
  /** Where the app band points. */
  appUrl?: string;

  /**
   * Shows the relationship-manager card.
   *
   * Gated on `rmName` as well as this flag — see `resolveSite`. A toggle turned
   * on over an empty block renders a card with a blank name in it, which reads
   * as a broken page rather than as a feature nobody finished.
   */
  showRm?: boolean;
  rmLabel?: string;
  rmName?: string;
  rmRole?: string;
  rmBlurb?: string;
  /** A phone number, an email or a booking link — printed as given. */
  rmContact?: string;
  rmCta?: string;
}

/** The fields that are strings, for the admin DTO and the write whitelist. */
export const SITE_TEXT_FIELDS = [
  'headline', 'sub', 'navCta', 'applyCta', 'applyNote',
  'mainSiteUrl', 'supportUrl', 'appUrl',
  'rmLabel', 'rmName', 'rmRole', 'rmBlurb', 'rmContact', 'rmCta',
] as const;

/** The fields that are booleans. Listed because they merge differently. */
export const SITE_FLAG_FIELDS = ['showUtility', 'showApp', 'showRm'] as const;

/* --------------------------------------------------------------- resolver */

export interface SiteInput {
  /** True only for the Investoyard Direct channel. */
  isDefault: boolean;
  /** The name to build a default headline from — the resolved trade name. */
  name: string;
  site?: TenantSite;
}

/**
 * Everything a page needs to render, with no undefined left for the view to
 * guess at. `rm` and the two utility links are present only when they have
 * something to show.
 */
export interface ResolvedSite {
  template: SiteTemplate;
  font: SiteFont;
  headline: string;
  sub: string;
  navCta: string;
  applyCta: string;
  applyNote?: string;
  /** Render the utility bar: on, AND at least one link to put in it. */
  utility?: { mainSiteUrl?: string; supportUrl?: string };
  /** Render the app band: on, AND somewhere for it to point. */
  appUrl?: string;
  /** Render the RM card: on, AND a person named in it. */
  rm?: { label: string; name: string; role?: string; blurb?: string; contact?: string; cta?: string };
}

const trim = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
};

/**
 * The copy a page falls back to, and the one thing to understand about it: NONE
 * OF IT IS OURS.
 *
 * `headline` is a function of the partner's own trade name — the shape Sir's own
 * 2a sample uses ("Every IPO, applied from your Kosha account") — so what gets
 * published is a sentence about them. Our tagline, "Investing in IPOs, has never
 * been this easy", is deliberately NOT the fallback: it is our brand's claim and
 * on a broker's hero it would be us marketing through their domain.
 *
 * THE NAME GOES THROUGH `shortName()`, which is not cosmetic. `Tenant.name` is
 * entered at registration and is ALL CAPS on most of them — measured, not
 * assumed: five of the eight real tenants are, including "ACML CAPITAL MARKETS
 * LIMITED". Dropped into a hero that is a headline shouting a legal name with
 * its suffix attached. `shortName` is the helper this codebase already uses for
 * exactly this on dense surfaces, so this is one more reader of it rather than
 * a third name formatter.
 *
 * It is a FALLBACK and it does not always read well — `N.V.INVESTMENTS` comes
 * out `N.v.investments`, because `titleCase` keeps a known acronym (HDFC, SBI)
 * and cannot know about a dotted one. That is survivable precisely because
 * `siteGaps()` asks the partner for a real headline; it is not survivable as a
 * permanent answer, which is why it is asked for rather than hidden.
 *
 * The rest are functional labels, not claims. "Apply to an IPO" says what the
 * button does and could not sensibly be anyone's intellectual property.
 */
export const defaultHeadline = (name: string): string =>
  `Every IPO, applied from your ${shortName(name)} account`;

export const DEFAULT_SITE_COPY = Object.freeze({
  sub: 'Mainboard and SME issues, live subscription figures, and allotment — in one place.',
  navCta: 'Sign in',
  applyCta: 'Apply to an IPO',
});

/**
 * Resolve the stored row into something a view can render without a single
 * `??` of its own.
 *
 * THE OPTIONAL BLOCKS ARE GATED ON THEIR OWN DATA, not on their flag alone, and
 * that is the whole reason this returns a different shape from what it is given.
 * A view handed `showRm: true` and no name renders an empty card; a view handed
 * `rm: undefined` renders nothing, which is correct and is what an operator who
 * has not finished setting up the partner should see. `siteGaps()` is what tells
 * them it is unfinished — the page itself must never advertise the gap.
 *
 * The default channel gets our own layout and font regardless of what is stored,
 * because the template system exists for partners and our home page is the
 * thing every other layout is a variant of. One less state to reason about on
 * the only site whose SEO we actually own.
 */
export function resolveSite({ isDefault, name, site }: SiteInput): ResolvedSite {
  const s = site ?? {};
  const out: ResolvedSite = {
    template: isDefault ? DEFAULT_TEMPLATE : (isSiteTemplate(s.template) ? s.template : DEFAULT_TEMPLATE),
    font: isDefault ? DEFAULT_FONT : (isSiteFont(s.font) ? s.font : DEFAULT_FONT),
    headline: trim(s.headline) ?? defaultHeadline(name),
    sub: trim(s.sub) ?? DEFAULT_SITE_COPY.sub,
    navCta: trim(s.navCta) ?? DEFAULT_SITE_COPY.navCta,
    applyCta: trim(s.applyCta) ?? DEFAULT_SITE_COPY.applyCta,
  };

  const applyNote = trim(s.applyNote);
  if (applyNote) out.applyNote = applyNote;

  if (s.showUtility === true) {
    const mainSiteUrl = trim(s.mainSiteUrl);
    const supportUrl = trim(s.supportUrl);
    /* A bar with neither link in it is a bar with nothing in it. */
    if (mainSiteUrl || supportUrl) out.utility = { ...(mainSiteUrl && { mainSiteUrl }), ...(supportUrl && { supportUrl }) };
  }

  if (s.showApp === true) {
    const appUrl = trim(s.appUrl);
    if (appUrl) out.appUrl = appUrl;
  }

  if (s.showRm === true) {
    const rmName = trim(s.rmName);
    if (rmName) {
      out.rm = {
        label: trim(s.rmLabel) ?? 'Your relationship manager',
        name: rmName,
        ...(trim(s.rmRole) && { role: trim(s.rmRole) }),
        ...(trim(s.rmBlurb) && { blurb: trim(s.rmBlurb) }),
        ...(trim(s.rmContact) && { contact: trim(s.rmContact) }),
        ...(trim(s.rmCta) && { cta: trim(s.rmCta) }),
      };
    }
  }

  return out;
}

/* -------------------------------------------------------------------- gaps */

/**
 * What a partner who has chosen a template still owes, in the order staff
 * should chase it.
 *
 * EVERY ONE OF THESE IS ADVISORY, and that is a deliberate limit rather than an
 * oversight. `contentGaps()` reserves `blocking` for the three statements whose
 * ABSENCE is survivable but whose being WRONG is not — the legal name and the
 * grievance officer. A missing headline is a gap in the shop window: the page
 * renders, nothing on it is false, and nobody's complaint goes to the wrong
 * company. Promoting shop-window gaps to blocking is how a blocking list stops
 * being read.
 *
 * Returns nothing when the tenant is on our own layout, because none of these
 * fields is rendered by it — asking a partner for a hero headline they have no
 * hero for is noise.
 */
export function siteGaps(input: SiteInput): { field: string; label: string }[] {
  if (input.isDefault) return [];
  const s = input.site ?? {};
  const template = isSiteTemplate(s.template) ? s.template : DEFAULT_TEMPLATE;
  if (template === DEFAULT_TEMPLATE) return [];

  const gaps: { field: string; label: string }[] = [];
  if (!trim(s.headline)) gaps.push({ field: 'headline', label: 'Hero headline' });
  if (!trim(s.sub)) gaps.push({ field: 'sub', label: 'Hero sub-heading' });

  /* A flag on with nothing behind it: the block silently does not render, so
     this is the only thing that will ever mention it to the operator. */
  if (s.showUtility === true && !trim(s.mainSiteUrl) && !trim(s.supportUrl))
    gaps.push({ field: 'mainSiteUrl', label: 'Link back to the main site (the utility bar is on)' });
  if (s.showApp === true && !trim(s.appUrl))
    gaps.push({ field: 'appUrl', label: 'App download link (the app band is on)' });
  if (s.showRm === true && !trim(s.rmName))
    gaps.push({ field: 'rmName', label: 'Relationship manager name (the RM card is on)' });

  return gaps;
}
