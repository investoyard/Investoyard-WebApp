/**
 * Broker overview — content source for /brokers (page + PDF).
 *
 * WHY A SEPARATE DOCUMENT FROM /platform. A SEBI-registered stock broker is not
 * the same reader as a distributor. They hold their own registration, their own
 * client base and their own compliance function, so the order of argument
 * inverts: white-label and data governance first, the research surface second
 * as a RETENTION argument, and no commercial talk at all. They also ask one
 * question a distributor never asks — "what am I allowed to display on my own
 * site?" — which is section 02 and the reason this document exists.
 *
 * The visual system is imported from ../platform/platform.css so the two
 * documents cannot drift apart.
 *
 * WHAT THIS DOCUMENT MUST NOT DO is answer a regulatory question on the
 * operator's behalf. It states what the PLATFORM does — which data is gated,
 * which is opt-in, which is locked off — because that is a fact about our
 * product. Whether a given broker may publish a given figure is their
 * compliance function's call, and the document says so rather than implying
 * clearance we are not in a position to give.
 */

export type Feature = { icon: string; t: string; d: string };

export const DOC = {
  title: 'Your IPO desk,\nunder your brand.',
  kicker: 'For SEBI-registered stock brokers',
  version: 'v1.0',
  updated: 'October 2026',
  entity: 'Safal Capital Services Private Limited',
  site: 'newipo.finwave.co',
};

export const HERO_LINE =
  'A complete Mainboard and SME IPO stack you can run under your own brand, or integrate into the ' +
  'front end you already have. Your clients, your domain, your compliance posture — with every ' +
  'sensitive data feed gated rather than assumed.';

export const GLANCE = [
  { v: '1,260+', l: 'IPOs in the catalogue', s: 'Mainboard and SME' },
  { v: '2', l: 'Exchanges, reconciled', s: 'NSE and BSE, one table' },
  { v: '3', l: 'Ways to integrate', s: 'White-label · API · as-is' },
  { v: 'RLS', l: 'Isolation in the database', s: 'Not just in app code' },
];

export const MODELS = [
  {
    n: '01', k: 'White-label', t: 'Your brand, end to end',
    d: 'Your domain, your logo and colours, your team logins, your own settings cascade and your branch tree. Clients never see Investoyard. You decide which data surfaces are switched on.',
  },
  {
    n: '02', k: 'API', t: 'Keep the front end you have',
    d: 'Your app stays yours. Call our endpoints for the IPO catalogue and to generate filled ASBA forms, with per-key scopes controlling exactly which data your integration may read.',
  },
  {
    n: '03', k: 'Hybrid', t: 'Start on ours, move to yours',
    d: 'Run on the hosted platform while you build, then move to a white-label or the API without re-onboarding clients or re-papering anything.',
  },
] as const;

/**
 * THE DATA QUESTION — the reason this document exists.
 *
 * `tier` drives the badge: 'open' is on by default, 'optin' needs enabling per
 * tenant, 'locked' is off and cannot be self-enabled on a white-label.
 */
export const DATA = [
  {
    tier: 'open', t: 'IPO catalogue and issue structure',
    d: 'Name, symbol, board, price band, lot size, issue size, Fresh and OFS legs, reservation split, anchor dates and the full key-date timeline.',
    note: 'Drawn from the offer documents and the exchange master.',
  },
  {
    tier: 'open', t: 'Offer documents',
    d: 'RHP and DRHP links on the issue itself, alongside objects of the issue, promoters and four-year financials.',
    note: 'Public filings.',
  },
  {
    tier: 'open', t: 'Lot ladder and minimum application',
    d: 'Minimum bid per category, lot ranges, amounts and the applications required to reach 1×, derived from the issue’s own reservation table.',
    note: 'Derived from the offer document, not a third-party feed.',
  },
  {
    tier: 'open', t: 'Listing performance and calendar',
    d: 'What issues did on listing as a historical record, plus the open, closing, allotment and listing calendar with reminders.',
    note: 'Public exchange data, stated as history rather than projection.',
  },
  {
    tier: 'open', t: 'Educational content',
    d: 'Plain-English glossary, how allotment works, Mainboard versus SME, and our written market notes.',
    note: 'Our own content; no recommendations, ratings or target prices anywhere.',
  },
  {
    tier: 'open', t: 'Your own clients’ application and allotment status',
    d: 'Every application you submitted, its exchange status, and the allotment result matched from the registrar file with the registrar’s own rejection reason.',
    note: 'Scoped to your tenant by row-level security.',
  },
  {
    tier: 'optin', t: 'Live subscription figures',
    d: 'Category-wise demand across both exchanges, share-wise and application-wise, with QIB stated net of anchor.',
    note: 'Enabled per account. API scope `subscription:read` is NOT in the default set.',
  },
  {
    tier: 'locked', t: 'Grey-market premium (GMP)',
    d: 'Unofficial, unregulated indicative premium, and the single most sensitive figure on the platform.',
    note: 'OFF and LOCKED on every white-label account — it cannot be self-enabled. On the API it needs the `gmp:read` scope, passes a second tenant-level check, and the disclaimer is returned WITH the number so a bare figure can never be handed over.',
  },
  {
    tier: 'never', t: 'Registrar allottee rows for non-clients',
    d: 'The raw allottee file contains PAN-level data for every applicant in the issue, not only yours.',
    note: 'Never exposed to a partner tenant. Your reporting reaches your own book only.',
  },
  {
    tier: 'never', t: 'Any other tenant’s data',
    d: 'Another broker’s clients, applications, prints or reports.',
    note: 'Enforced by row-level security in the database, not by application code alone.',
  },
] as const;

export const CHECKS = [
  'Decide which data surfaces are switched on for your site, and have us lock that configuration.',
  'Confirm with your compliance function whether your registration permits publishing each figure.',
  'Confirm redistribution rights for exchange-sourced subscription data under your own member agreement, or take it under ours.',
  'Agree the disclaimer wording that must accompany any indicative figure you display.',
];

export const CLIENT: Feature[] = [
  { icon: 'chart', t: 'Live subscription, both exchanges', d: 'NSE catwise and BSE demand schedule reconciled into one table — QIB, both HNI bands, Retail and every reserved quota. Share-wise and application-wise, because allotment odds depend on the second.' },
  { icon: 'trending', t: 'Day-wise and hourly history', d: 'How demand built across the bidding window, with an hourly drill-down over the last three days.' },
  { icon: 'list', t: 'Lot ladder and reservation', d: 'Minimum bid per category, lot ranges, amounts and applications needed for 1x, from the issue’s own reservation table.' },
  { icon: 'check-fill', t: 'Allotment on any PAN', d: 'Registrar files matched to applications automatically with the registrar’s own rejection reason.' },
  { icon: 'pie', t: 'Listing performance', d: 'What issues actually did on listing, as a record rather than a projection.' },
  { icon: 'doc', t: 'Documents and financials', d: 'RHP and DRHP on the issue, four-year financials, objects of the issue, promoters and the anchor book.' },
  { icon: 'calendar', t: 'Calendar and reminders', d: 'Lifecycle alerts so a client hears before a window shuts rather than after.' },
  { icon: 'globe', t: 'Web and mobile', d: 'A responsive site that installs as an app, plus a native mobile app — both carrying your brand.' },
];

export const APPLY: Feature[] = [
  { icon: 'bolt', t: 'UPI and bank ASBA', d: 'Retail, HNI and reserved-quota tabs, cut-off bidding and a single itemised consent.' },
  { icon: 'users', t: 'Families in one pass', d: 'A client and their family together, with per-member overrides.' },
  { icon: 'wallet', t: 'Multiple demat accounts', d: 'One PAN may hold several; the investor picks which one an allotment credits to.' },
  { icon: 'file-pdf', t: 'Print forms in your series', d: 'Fillable ASBA forms from the real SEBI template, numbered from your own series, flattened so they arrive filled in WhatsApp rather than blank.' },
  { icon: 'repeat', t: 'Correcting a live bid', d: 'A mistyped UPI ID corrected after submission and restated across every live bid that applicant holds.' },
  { icon: 'bank', t: 'Chasing a stuck block', d: 'Where funds stay blocked past the allotment grace period, an unblock request to the issue’s sponsor banks, with eligibility decided server-side.' },
  { icon: 'shield', t: 'The self-PAN rule, enforced', d: 'One public application per PAN per issue plus one per reserved quota, checked on a keyed fingerprint rather than a name match.' },
  { icon: 'clock', t: 'Exchange status, verbatim', d: 'The exchange’s own UPI wording shown beside our status, so a rejection says which kind it was.' },
];

export const GOVERNANCE: Feature[] = [
  { icon: 'sitemap', t: 'Isolation in the database', d: 'Row-level security scopes your data in PostgreSQL itself, not only in application code, so a query cannot accidentally reach another tenant.' },
  { icon: 'lock', t: 'PII tokenised at rest', d: 'PAN and bank details held in an envelope-encrypted vault, tokenised per tenant.' },
  { icon: 'eye', t: 'Masked by default', d: 'Reports show a masked PAN and the last four digits of an account — a support tool, not a contact list.' },
  { icon: 'sitemap', t: 'Branches, properly scoped', d: 'Your branch tree sits under your tenant with scope enforced at the database, so a branch login sees its own book and no one else’s.' },
  { icon: 'key', t: 'Scoped API keys', d: 'Each key carries explicit scopes. Subscription and GMP are not in the default set and must be granted deliberately.' },
  { icon: 'user', t: 'Roles and audit', d: 'Granular permissions per menu and an audit trail attributing every change to a person and a time.' },
  { icon: 'doc', t: 'DPDP consent, itemised', d: 'Collected just in time with specific purposes listed and recorded against the applicant.' },
  { icon: 'shield', t: 'No advice, anywhere', d: 'No recommendations, ratings, review scores or target prices on any surface we render.' },
];

export const DESK: Feature[] = [
  { icon: 'pie', t: 'Reporting on your own book', d: 'Every call logged and every print reportable, with CSV export and summaries by day, by month and by IPO.' },
  { icon: 'download', t: 'Allotment at scale', d: 'Registrar files to 120 MB in DBF, XLSB, XLSX or CSV, matched to your applications by PAN, searchable by partial PAN and amount, exportable and archivable.' },
  { icon: 'cursor', t: 'Documentation you can run', d: 'A full API reference with an inline tester — pick an issue, edit the payload, run it against the real print engine and download the PDF your integration would receive. Nothing persisted.' },
  { icon: 'user-plus', t: 'Onboarding built for intermediaries', d: 'The application captures your SEBI registration number, ARN, GSTIN, entity type, business PAN and supporting documents.' },
  { icon: 'bell', t: 'Operational alerts', d: 'A readiness check naming any open issue whose data cannot be computed, with trading days already lost and days left.' },
  { icon: 'settings', t: 'Your own settings cascade', d: 'Branding, caps and feature flags set at your tenant and inherited by your branches.' },
];

export const STEPS = [
  { n: 1, t: 'Scoping call', d: 'Which model, which data surfaces, and what your compliance function needs to sign off.' },
  { n: 2, t: 'Apply', d: 'A short form capturing your entity, SEBI registration and documents.' },
  { n: 3, t: 'Configure', d: 'We provision your tenant, brand it, set your data flags and lock the configuration you agreed.' },
  { n: 4, t: 'Integrate or go live', d: 'Take the white-label as it stands, or collect an API key and test against the real print engine from the documentation page.' },
];

export const SECTIONS = [
  { id: 'models', n: '01', t: 'Three ways to work with us' },
  { id: 'data', n: '02', t: 'What you can display' },
  { id: 'client', n: '03', t: 'What your clients get' },
  { id: 'apply', n: '04', t: 'How your clients apply' },
  { id: 'governance', n: '05', t: 'Data governance and compliance' },
  { id: 'desk', n: '06', t: 'Your desk and your back office' },
] as const;

export const DISCLAIMER =
  'Investoyard is operated by ' + DOC.entity + '. We distribute public issues and share information ' +
  'about them; we do not give investment advice or recommend any issue. Grey-market premium figures, ' +
  'where shown, are unofficial and unregulated and must not be read as a price or a forecast. ' +
  'This document describes platform capability and the controls available to you; it is not legal or ' +
  'compliance advice, and what a registered intermediary may publish remains that firm’s own ' +
  'determination. Partner terms, including any commercial arrangement, are agreed in writing after approval.';
