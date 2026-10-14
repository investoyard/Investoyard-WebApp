/**
 * Broker overview — content source for /brokers (page + PDF).
 *
 * REWRITTEN after sir reviewed v1.0 and rejected it on three counts, all fair:
 * the branding was not ours, there was nothing in it to attract a broker, and
 * it never said what onboarding actually requires of them.
 *
 *  1. BRANDING. The cover carried a gold square plus letterspaced text while
 *     the real investoyard-logo.svg sat unused in public/. The logo now appears
 *     in its true colours inside a white panel, rather than being recoloured
 *     into a second asset that would drift from the original.
 *
 *  2. NOTHING TO ATTRACT A BROKER. v1.0 was ~90% features and almost no
 *     benefit: what the platform DOES, never what the broker GETS. A broker is
 *     not buying a feature list, they are buying client retention, a live date
 *     without an engineering project, and a figure their client cannot
 *     disprove. That is section 01 now, before anything technical.
 *
 *  3. WHAT ONBOARDING REQUIRES was missing entirely. The old close was four
 *     process steps — "scoping call, apply, configure" — which says what WE do
 *     and never what THEY must bring. A broker reading a partner deck is
 *     deciding whether to forward it to compliance, and cannot without the
 *     list. REQUIREMENTS is now its own section, and every item is a field the
 *     application actually asks for, not a guess.
 *
 * The visual system is imported from ../platform/platform.css so the two
 * documents cannot drift.
 *
 * WHAT THIS DOCUMENT STILL MUST NOT DO is answer a regulatory question for the
 * broker. It states what the PLATFORM enforces — which feeds are open, opt-in,
 * locked, never shared — because that is a fact about our product. Whether a
 * registered firm may publish a given figure is their compliance function's
 * call, and the document says so rather than implying a clearance.
 */

export type Feature = { icon: string; t: string; d: string };

export const DOC = {
  title: 'Your IPO desk,\nunder your brand.',
  kicker: 'For SEBI-registered stock brokers',
  version: 'v2.0',
  updated: 'October 2026',
  entity: 'Safal Capital Services Private Limited',
  site: 'newipo.finwave.co',
};

export const HERO_LINE =
  'Mainboard and SME IPOs, end to end, running under your own brand — or inside the app you already ' +
  'have. Your clients stay yours, the engineering is already done, and every sensitive data feed is ' +
  'gated rather than assumed.';

/** Figures a broker can act on. v1.0 led with "RLS", which means nothing to the reader. */
export const GLANCE = [
  { v: '1,260+', l: 'IPOs covered', s: 'Mainboard and SME' },
  { v: 'NSE + BSE', l: 'Both exchanges', s: 'reconciled into one table' },
  { v: '5 sec', l: 'Refresh at the close', s: 'when your clients watch hardest' },
  { v: 'Zero', l: 'Engineering required', s: 'to go live on your brand' },
];

/**
 * SECTION 01 — the business case, and the section sir said was missing.
 * Every claim here is something the platform demonstrably does; none of it is
 * a revenue projection, because we have no basis for one.
 */
export const WHY: Feature[] = [
  {
    icon: 'users',
    t: 'Your clients stop leaving during IPO season',
    d: 'An IPO week is when retail investors shop around — they go elsewhere to check subscription, allotment odds and premium, and some of them do not come back. Carrying the full research surface inside your own app removes the reason to leave.',
  },
  {
    icon: 'bolt',
    t: 'Live without an engineering project',
    d: 'No exchange integration to build, no RHP structures to model, no registrar file formats to parse, no allotment reconciliation to write. The stack exists and is in production; you put your brand on it.',
  },
  {
    icon: 'layers',
    t: 'Your brand, your domain, your clients',
    d: 'Your logo, your colours, your team logins, your own branch tree on your own domain. Clients never see Investoyard anywhere in the journey.',
  },
  {
    icon: 'shield',
    t: 'Figures your client cannot fault you on',
    d: 'Every subscription row is recomputed locally from raw exchange demand and cross-checks against itself. A number a client disproves against another site costs you the relationship, not us — so the engineering went there first.',
  },
  {
    icon: 'box',
    t: 'SME handled properly, not bolted on',
    d: 'A different minimum bid, a two-lot individual application, market-maker reservation, single-exchange issues and its own demand thresholds. SME is where most platforms quietly get it wrong.',
  },
  {
    icon: 'lock',
    t: 'Compliance posture you can show a regulator',
    d: 'No advice or recommendations anywhere, the self-PAN rule enforced on a keyed fingerprint, itemised DPDP consent, PAN and bank details tokenised in a vault, and your data scoped in the database itself.',
  },
];

export const MODELS = [
  {
    n: '01', k: 'White-label', t: 'Your brand, end to end',
    d: 'Your domain, logo and colours, your team logins, your own settings cascade and branch tree. You decide which data surfaces are switched on. Clients never see us.',
  },
  {
    n: '02', k: 'API', t: 'Keep the front end you have',
    d: 'Your app stays yours. Call our endpoints for the IPO catalogue and to generate filled ASBA forms, with per-key scopes controlling exactly which data your integration may read.',
  },
  {
    n: '03', k: 'Hybrid', t: 'Start on ours, move to yours',
    d: 'Run on the hosted platform while you build, then move to a white-label or the API without re-onboarding a single client or re-papering anything.',
  },
] as const;

/** `tier` drives the badge: open / optin / locked / never. */
export const DATA = [
  { tier: 'open', t: 'IPO catalogue and issue structure',
    d: 'Name, symbol, board, price band, lot size, issue size, Fresh and OFS legs, reservation split, anchor dates and the full key-date timeline.',
    note: 'From the offer documents and the exchange master.' },
  { tier: 'open', t: 'Offer documents and financials',
    d: 'RHP and DRHP on the issue itself, four-year financials, objects of the issue and promoters.',
    note: 'Public filings.' },
  { tier: 'open', t: 'Lot ladder and minimum application',
    d: 'Minimum bid per category, lot ranges, amounts and the applications required to reach 1x, derived from the issue’s own reservation table.',
    note: 'Derived from the offer document, not a third-party feed.' },
  { tier: 'open', t: 'Listing performance and calendar',
    d: 'What issues did on listing as a historical record, plus open, closing, allotment and listing dates with client reminders.',
    note: 'Public exchange data, stated as history rather than projection.' },
  { tier: 'open', t: 'Educational content',
    d: 'Plain-English glossary, how allotment works, Mainboard versus SME, and our written market notes.',
    note: 'Our own content. No recommendations, ratings or target prices anywhere.' },
  { tier: 'open', t: 'Your own clients’ applications and allotment',
    d: 'Every application you submitted, its exchange status, and the allotment result matched from the registrar file with the registrar’s own rejection reason.',
    note: 'Scoped to your tenant by row-level security.' },
  { tier: 'optin', t: 'Live subscription figures',
    d: 'Category-wise demand across both exchanges, share-wise and application-wise, with QIB stated net of anchor.',
    note: 'Enabled per account. The API scope is NOT in the default set.' },
  { tier: 'locked', t: 'Grey-market premium (GMP)',
    d: 'Unofficial, unregulated indicative premium, and the single most sensitive figure on the platform.',
    note: 'OFF and LOCKED on every white-label account — it cannot be self-enabled. On the API it needs an explicit scope, passes a second tenant-level check, and the disclaimer is returned WITH the number so a bare figure can never be handed over.' },
  { tier: 'never', t: 'Registrar allottee rows for non-clients',
    d: 'A registrar file carries PAN-level data for every applicant in the issue, not only yours.',
    note: 'Never exposed to a partner. Your reporting reaches your own book only.' },
  { tier: 'never', t: 'Any other partner’s data',
    d: 'Another broker’s clients, applications, prints or reports.',
    note: 'Enforced by row-level security in the database, not by application code alone.' },
] as const;

export const CHECKS = [
  'Decide which data surfaces are switched on for your site, and have us lock that configuration.',
  'Confirm with your compliance function whether your registration permits publishing each figure.',
  'Confirm redistribution rights for exchange-sourced subscription data under your member agreement, or take it under ours.',
  'Agree the disclaimer wording that must accompany any indicative figure you display.',
];

/**
 * SECTION — WHAT YOU BRING. Sir's second complaint, and the reason this
 * document exists in a broker's inbox: they are deciding whether to forward it
 * to compliance, and cannot without knowing what will be asked for.
 *
 * Every item maps to a field the application actually captures
 * (PartnerApplication: sebiRegNo, legalName, entityType, pan, gstin, city,
 * state, contactName, email, mobile, documents) — it is not a wish list.
 */
export const REQUIREMENTS = [
  { k: 'Registration', items: [
    'SEBI registration number and a copy of the certificate',
    'ARN, if you also distribute mutual funds',
  ] },
  { k: 'The entity', items: [
    'Legal name and entity type (company, LLP, partnership, proprietorship)',
    'Business PAN and GSTIN',
    'Registered city and state',
  ] },
  { k: 'People', items: [
    'A named contact person, email and mobile — this becomes your admin login',
    'An authorised signatory for the partner agreement',
    'A compliance contact to sign off which data surfaces are enabled',
  ] },
  { k: 'For a white-label', items: [
    'Your logo and primary brand colour',
    'The subdomain you want to use, and access to its DNS',
  ] },
  { k: 'For an API integration', items: [
    'A technical contact',
    'The server addresses your calls will come from',
  ] },
] as const;

export const STEPS = [
  { n: 1, t: 'Scoping call', d: 'Which model, which data surfaces, and what your compliance function needs to see before signing off.' },
  { n: 2, t: 'Apply', d: 'A short online form capturing the entity, registration and documents listed opposite. Minutes, not days.' },
  { n: 3, t: 'Review and approval', d: 'We check the details and come back to you, usually within a couple of working days. Approval emails you a one-time link to set your password.' },
  { n: 4, t: 'Configure', d: 'We provision your tenant, apply your branding, set your data flags and lock the configuration you agreed. Your domain is pointed at us and certified.' },
  { n: 5, t: 'Go live', d: 'Take the white-label as it stands, or collect an API key and test against the real print engine from the documentation page before a single client sees it.' },
];

export const CLIENT: Feature[] = [
  { icon: 'chart', t: 'Live subscription, both exchanges', d: 'NSE catwise and BSE demand schedule reconciled into one table — QIB, both HNI bands, Retail and every reserved quota. Share-wise and application-wise, because allotment odds depend on the second.' },
  { icon: 'trending', t: 'Day-wise and hourly history', d: 'How demand built across the bidding window, with an hourly drill-down over the last three days.' },
  { icon: 'list', t: 'Lot ladder and reservation', d: 'Minimum bid per category, lot ranges, amounts and applications needed for 1x, from the issue’s own reservation table.' },
  { icon: 'check-fill', t: 'Allotment on any PAN', d: 'Registrar files matched to applications automatically, with the registrar’s own rejection reason.' },
  { icon: 'pie', t: 'Listing performance', d: 'What issues actually did on listing, as a record rather than a projection.' },
  { icon: 'doc', t: 'Documents and financials', d: 'RHP and DRHP on the issue, four-year financials, objects of the issue, promoters and the anchor book.' },
  { icon: 'calendar', t: 'Calendar and reminders', d: 'Lifecycle alerts so a client hears before a window shuts rather than after.' },
  { icon: 'globe', t: 'Web and mobile', d: 'A responsive site that installs as an app, plus a native mobile app — both carrying your brand.' },
];

export const APPLY: Feature[] = [
  { icon: 'bolt', t: 'UPI and bank ASBA', d: 'Retail, HNI and reserved-quota tabs, cut-off bidding and a single itemised consent.' },
  { icon: 'users', t: 'Families in one pass', d: 'A client and their family together, with per-member overrides.' },
  { icon: 'wallet', t: 'Multiple demat accounts', d: 'One PAN may hold several; the investor picks which one an allotment credits to.' },
  { icon: 'file-pdf', t: 'Print forms in your series', d: 'Fillable ASBA forms from the real SEBI template, numbered from your own series, flattened so they arrive filled on WhatsApp rather than blank.' },
  { icon: 'repeat', t: 'Correcting a live bid', d: 'A mistyped UPI ID corrected after submission and restated across every live bid that applicant holds.' },
  { icon: 'bank', t: 'Chasing a stuck block', d: 'Where funds stay blocked past the allotment grace period, an unblock request to the issue’s sponsor banks, with eligibility decided server-side.' },
  { icon: 'shield', t: 'The self-PAN rule, enforced', d: 'One public application per PAN per issue plus one per reserved quota, checked on a keyed fingerprint rather than a name match.' },
  { icon: 'clock', t: 'Exchange status, verbatim', d: 'The exchange’s own UPI wording beside our status, so a rejection says which kind it was.' },
];

export const GOVERNANCE: Feature[] = [
  { icon: 'sitemap', t: 'Isolation in the database', d: 'Row-level security scopes your data in PostgreSQL itself, not only in application code, so a query cannot reach another partner’s book.' },
  { icon: 'lock', t: 'PII tokenised at rest', d: 'PAN and bank details held in an envelope-encrypted vault, tokenised per partner.' },
  { icon: 'eye', t: 'Masked by default', d: 'Reports show a masked PAN and the last four digits of an account — a support tool, not a contact list.' },
  { icon: 'sitemap', t: 'Branches, properly scoped', d: 'Your branch tree sits under your tenant with scope enforced at the database, so a branch sees its own book and no one else’s.' },
  { icon: 'key', t: 'Scoped API keys', d: 'Each key carries explicit scopes. Subscription and GMP are not in the default set and must be granted deliberately.' },
  { icon: 'user', t: 'Roles and audit', d: 'Granular permissions per menu and an audit trail attributing every change to a person and a time.' },
];

export const DESK: Feature[] = [
  { icon: 'pie', t: 'Reporting on your own book', d: 'Every call logged and every print reportable, with CSV export and summaries by day, by month and by IPO.' },
  { icon: 'download', t: 'Allotment at scale', d: 'Registrar files to 120 MB in DBF, XLSB, XLSX or CSV, matched to your applications by PAN, searchable by partial PAN and amount, exportable and archivable.' },
  { icon: 'cursor', t: 'Documentation you can run', d: 'A full API reference with an inline tester — pick an issue, edit the payload, run it against the real print engine and download the PDF your integration would receive.' },
  { icon: 'bell', t: 'Operational alerts', d: 'A readiness check naming any open issue whose data cannot be computed, with trading days already lost and days left.' },
  { icon: 'settings', t: 'Your own settings cascade', d: 'Branding, caps and feature flags set at your tenant and inherited by your branches.' },
  { icon: 'edit', t: 'Content and messaging', d: 'A rich-text news engine, message templates and a delivery log across SMS, email and WhatsApp.' },
];

export const SECTIONS = [
  { id: 'why', n: '01', t: 'Why brokers partner with us' },
  { id: 'models', n: '02', t: 'Three ways to work with us' },
  { id: 'client', n: '03', t: 'What your clients get' },
  { id: 'data', n: '04', t: 'What you can display' },
  { id: 'apply', n: '05', t: 'How your clients apply' },
  { id: 'governance', n: '06', t: 'Data governance and compliance' },
  { id: 'desk', n: '07', t: 'Your desk and your back office' },
  { id: 'onboard', n: '08', t: 'What onboarding needs from you' },
] as const;

export const CLOSE = {
  title: 'Ready when you are.',
  body: 'Applying costs nothing and commits you to nothing. We will tell you honestly whether the fit works — and if it does not, we will say so.',
  cta: 'Start at ' + DOC.site + '/partner',
};

export const DISCLAIMER =
  'Investoyard is operated by ' + DOC.entity + '. We distribute public issues and share information ' +
  'about them; we do not give investment advice or recommend any issue. Grey-market premium figures, ' +
  'where shown, are unofficial and unregulated and must not be read as a price or a forecast. ' +
  'This document describes platform capability and the controls available to you; it is not legal or ' +
  'compliance advice, and what a registered intermediary may publish remains that firm’s own ' +
  'determination. Partner terms, including any commercial arrangement, are agreed in writing after approval.';
