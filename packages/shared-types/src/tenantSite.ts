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
 * The THEMES a white-label may choose, and the ONE place their ids live.
 *
 * A THEME IS A COMPLETE WEBSITE DESIGN, NOT A RE-SKIN OF OURS — and that
 * distinction is the whole point of this file, because the first attempt got it
 * wrong. Sir's `.dc.html` files are not variations on investoyard.com; each is
 * its own site that happens to show IPO data, with its own neutral palette, its
 * own type, its own header and footer and its own components. The first version
 * of this registry listed four entries named Broker / Dashboard / List and
 * detail / Landing, which were our site with different radii and widths. Those
 * were not themes and are gone.
 *
 * THE ID IS THE DURABLE THING AND THE NAME IS NOT. `id` is stored in the
 * database, baked into the host map, written into a `data-template` attribute
 * and read by CSS selectors — so it never changes. `label` is a display name an
 * operator may rename freely, which is why the two are separate fields and why
 * a rename is never a migration.
 *
 * IDS ARE NAMES, NEVER CANVAS COORDINATES. '2a' and '2b' are positions on
 * someone's canvas and are the worst possible durable identifier; `design`
 * records that provenance instead, so a theme can be traced back to the artwork
 * after the canvas file is gone.
 *
 * WHAT A THEME OWNS AND WHAT IT DOES NOT: it owns the NEUTRALS (ink, muted,
 * borders, surfaces, page background), the radii, the widths, the type scale
 * and its own chrome. It does NOT own the BRAND colour — that is the tenant's,
 * set from `Tenant.brandColor` through `palette()`, so one theme carries every
 * partner's own identity. The design files say the same thing: they parameterise
 * P / PD / PL / T / A and hardcode their greys.
 */
export interface SiteTemplateMeta {
  id: SiteTemplate;
  /** The display name. An operator may rename this; the id is what persists. */
  label: string;
  /** What this theme is and who it suits. Shown in the admin selector. */
  blurb: string;
  /** The design file this was built from, for traceability. */
  design?: string;
  /** False while a theme is only partly implemented — see `themeReady`. */
  ready?: boolean;
}

/*
 * ANNOTATED `readonly SiteTemplateMeta[]`, NOT `as const satisfies`. `as const`
 * narrows each entry to its OWN literal type, and a literal type does not carry
 * an optional field that entry omits — so `t.design` was a compile error on the
 * one entry without a design, for every consumer that looped the list. It broke
 * the spec and then the admin panel, the same way, twice.
 */

export const SITE_TEMPLATES: readonly SiteTemplateMeta[] = [
  {
    id: 'default',
    label: 'Investoyard',
    blurb: 'Our own site, exactly as investoyard.com renders it. Used when no theme is chosen.',
    ready: true,
  },
  {
    /*
     * MERIDIAN — Sir's Broker Website v2, implemented as a theme.
     *
     * Named rather than described: "Broker" said what it was for, not what it
     * is, and the operator asked for theme names. Meridian is the reference
     * line a market reads its position against, which is what this design does
     * — a calm institutional frame with one live data card at its centre.
     *
     * Its own world, measured off the design file rather than invented: a
     * blue-grey slate scale (#181A2E ink, #5C6187 muted, #ECEDF6 borders,
     * #F5F5FA page, #14162A footer) against our purple-grey; a 1240px measure
     * against our 1160; Plus Jakarta Sans over Noto Sans; and card radii from
     * 12 to 22px.
     */
    id: 'meridian',
    label: 'Meridian',
    blurb: 'Calm and institutional. A split hero with one live IPO card, then the issue table in four views. Suits a broker introducing themselves to clients who have not met them yet.',
    design: 'Broker Website v2',
    ready: true,
  },
  {
    /*
     * ONYX — Sir's "1a Terminal", whose own caption names its audience:
     * "for trading-first brokers".
     *
     * UNCONDITIONALLY DARK, which is the point and not a dark MODE. The design
     * is a trading desk: a near-black ground, dense rows, tight corners and one
     * teal accent. Our own dark mode is a preference a reader sets; this is the
     * design, so it looks the same whatever the operating system says —
     * `html[data-template]` is (0,1,1) and beats the (0,1,0) `:root` the dark
     * block uses, which is what makes that possible without a second mechanism.
     *
     * Measured off the file rather than invented: ground #0E1417, ink #E4ECEE,
     * surfaces #141C1F and #1A2427, muted #7F9499, accent #13A39A, signals
     * #5FD39A and #F2A33A, IBM Plex Sans, and radii of 2-8px against
     * Meridian's 12-28. Where Meridian is a calm frame around one live card,
     * this is a dense table a desk reads all day.
     */
    id: 'onyx',
    label: 'Onyx',
    blurb: 'Dark and dense, built for a trading desk. Tight rows, a teal accent and an issue table that reads at a glance. Suits a broker whose clients already trade.',
    design: 'Broker Templates — 1a Terminal',
    ready: true,
  },
  {
    /*
     * FOLIO — Sir's "1b Editorial", whose own caption names its audience:
     * "for advisors and research-led brokers".
     *
     * A NEWSPAPER, and the only one of the three with no cards in it at all.
     * The design is a broadsheet: a centred masthead over a 3px DOUBLE rule,
     * uppercase letter-spaced nav, a 56px lead headline with a standfirst, a
     * four-figure band bounded top and bottom by hairlines, and lists that are
     * rule-separated ROWS. Where Meridian frames one live card and Onyx packs
     * a desk's table, this one reads like something written.
     *
     * Measured off the design file: paper #FBF8F3, ink #211A17, a deep wine
     * accent #7A1E3F, rules #E6DED2 and #CBBFAF, muted #6B5F57, IBM Plex Sans,
     * and SQUARE corners — the design gives its buttons a height and a padding
     * and no radius at all, which is most of why it reads as print.
     *
     * Folio is a page, which is the name rather than the description. Sir
     * approves the names; this is the proposal.
     */
    id: 'folio',
    label: 'Folio',
    blurb: 'An editorial broadsheet. A centred masthead, one lead issue written up at length, and lists set as rule-separated rows rather than cards. Suits an advisor whose clients read before they apply.',
    design: 'Broker Templates — 1b Editorial',
    ready: true,
  },
  {
    /*
     * COBALT — Sir's "1c Cards", whose own caption names its audience:
     * "for new-investor fintechs".
     *
     * THE ONE OF THE FOUR THAT SELLS. Meridian frames a live card, Onyx packs
     * a desk's table and Folio reads like something written; this one is a
     * pitch: a 28px-radius cobalt hero panel with a lime eyebrow, a 54px
     * headline, and then a four-up grid of friendly white cards with a
     * recessed well of figures in each and one pill action.
     *
     * Measured off the design file: ground #F4F6FF, ink #121735, a cobalt
     * accent #2A43C4 with #3D5CF5 for fills, a lime HIGHLIGHT #B8E04A that is
     * deliberately not bound to a signal, borders #E3E8FF, Manrope, and radii
     * from 12 to 28 against Folio's 0-2 and Onyx's 2-8.
     *
     * Cobalt is the pigment, which is the name rather than the description —
     * and a mineral, like Onyx. Sir approves the names; this is the proposal.
     */
    id: 'cobalt',
    label: 'Cobalt',
    blurb: 'Bright and friendly, for first-time investors. A bold hero panel, then open issues as a grid of cards with the figures in a well and one button each. Suits a broker signing up clients who have never applied before.',
    design: 'Broker Templates — 1c Cards',
    ready: true,
  },
];

export type SiteTemplate = 'default' | 'meridian' | 'onyx' | 'folio' | 'cobalt';

/**
 * Whether a theme is finished enough to hand a partner's customers.
 *
 * It exists so a half-built theme can be committed and reviewed WITHOUT being
 * selectable in a way that would publish it — the alternative is either holding
 * the work back or offering a control that produces a broken site, and this
 * codebase has a standing rule against the second. `SITE_TEMPLATES` carries
 * every theme; the admin selector reads this to decide what it may offer.
 */
export const themeReady = (id: SiteTemplate): boolean =>
  SITE_TEMPLATES.find((t) => t.id === id)?.ready === true;

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

export const SITE_FONTS: readonly SiteFontMeta[] = [
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
  {
    /*
     * IBM Plex Sans — what the Terminal design declares, and the reason it
     * reads as a desk rather than a brochure: it carries a true monospace
     * sibling and its figures sit on a consistent width, which is what a page
     * of multiples and rupee amounts needs.
     */
    id: 'ibmplex',
    label: 'IBM Plex Sans',
    display: 'IBM Plex Sans',
    body: 'IBM Plex Sans',
    cssVar: '--font-ibmplex',
  },
];

export type SiteFont = 'default' | 'figtree' | 'manrope' | 'fraunces' | 'ibmplex';

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

/**
 * The theme header's quiet action, beside `navCta`. Exported so the component
 * and the test that keeps the two apart read the same string rather than two
 * copies of it.
 */
export const SIGN_IN_LABEL = 'Sign in';

export const DEFAULT_SITE_COPY = Object.freeze({
  sub: 'Mainboard and SME issues, live subscription figures, and allotment — in one place.',
  /* NOT 'Sign in': the button this labels points at /signup, and the theme
     header already carries a ghost "Sign in" beside it — the default collided
     with its own sibling and described the wrong action. */
  navCta: 'Open an account',
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
