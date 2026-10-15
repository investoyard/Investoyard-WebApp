/**
 * Platform overview — THE SINGLE SOURCE for both outputs.
 *
 * /platform renders this for screen; `@media print` in platform.css re-renders
 * the SAME markup as A4; `scripts/build-platform-pdf.js` drives headless Chrome
 * over that to produce public/Investoyard-Platform-Overview.pdf. One content
 * source, two presentations, never two documents — a hand-maintained PDF beside
 * a hand-maintained page drifts, and the stale copy is the one already emailed
 * to forty brokers.
 *
 * REGISTER: this is MARKETING material, not product UI, and the brand has a
 * separate language for it — see the comps in D:\Investoyard-Social. Lavender
 * ground rather than white, an indigo gradient for the hero, gold used boldly
 * (it is the most-used colour across those comps), display type at 72-88px in
 * Plus Jakarta 800, and elevated white cards at 24px radius. The first version
 * of this page was written in the APP's dense utility register and read as a
 * documentation page, which is exactly what it must not be.
 *
 * TWO RULES FOR ANYTHING ADDED HERE:
 *  1. CONCRETE OVER ADJECTIVAL. "Every row satisfies Book x Times = Subscribed"
 *     earns belief; "best-in-class data" does not.
 *  2. NO FIGURE WITHOUT A BASIS. Live counts rot within hours in this project,
 *     so anything baked is dated at the point it is shown.
 */

import { SITE_HOST } from '@/lib/site';

export type Feature = { icon: string; t: string; d: string };

export const DOC = {
  title: 'The IPO platform,\nend to end.',
  kicker: 'Platform overview for distribution partners',
  version: 'v2.0',
  updated: 'October 2026',
  entity: 'Safal Capital Services Private Limited',
  tagline: 'Investing in IPOs, has never been this easy.',
  /* The cover and footer print the host. Taken from the build's own origin,
     never typed: the two partner-facing PDFs carry no domain at all, so this
     is the ONE printed document that can go stale on a domain move. */
  site: SITE_HOST,
};

export const HERO_LINE =
  'Mainboard and SME, from the day the RHP lands to listing day — research, applications, allotment ' +
  'and reporting on one stack. Take it as it stands, put your own brand on it, or keep your front end ' +
  'and integrate over the API.';

export const GLANCE = [
  { v: '1,260+', l: 'IPOs in the catalogue', s: 'Mainboard and SME' },
  { v: '2', l: 'Exchanges, reconciled', s: 'NSE and BSE, one table' },
  { v: '5 sec', l: 'Polling at the close', s: '60 sec through the day' },
  { v: '2.26 L', l: 'Allottee rows, one issue', s: 'Registrar files to 120 MB' },
];

/**
 * THE STACK — five layers, and the spine of the whole document.
 *
 * An architecture beats a flat feature list for this reader: a broker is not
 * buying 40 features, they are buying a system, and the question they actually
 * have is "which parts of this do I take and which do I replace".
 */
export const LAYERS = [
  { n: '01', id: 'research', k: 'Research', t: 'The investor experience', d: 'Everything a client reads before they decide — live demand, documents, history.' },
  { n: '02', id: 'apply', k: 'Applications', t: 'Applying and printing', d: 'UPI and bank ASBA, families in one pass, fillable forms for clients who sign on paper.' },
  { n: '03', id: 'partner', k: 'Integration', t: 'The partner channel', d: 'An API, a white-label and a self-service console — pick your depth.' },
  { n: '04', id: 'console', k: 'Operations', t: 'The operator console', d: 'What your desk uses: catalogue, masters, allotment imports, reporting, messaging.' },
  { n: '05', id: 'engine', k: 'Data', t: 'The engine underneath', d: 'The exchange poller, the issue engine and the rule pack that keep every figure honest.' },
] as const;

/** A real snapshot, dated. The strongest thing in the document is the product. */
export const SNAPSHOT = {
  name: 'HD Fire Protect Limited',
  meta: 'Mainboard · ₹258–271 · lot 55 · day 1',
  asAt: '13 October 2026',
  rows: [
    { c: 'QIB (Ex. Anchor)', x: '0.42', apps: '52', tone: 'low' },
    { c: 'HNI (10 L+)', x: '10.81', apps: '7,415', tone: 'hot' },
    { c: 'HNI (2–10 L)', x: '12.65', apps: '20,748', tone: 'hot' },
    { c: 'Retail', x: '3.82', apps: '5,48,068', tone: 'mid' },
    { c: 'Employee', x: '2.95', apps: '2,083', tone: 'mid' },
  ],
  total: { c: 'Total', x: '3.26', apps: '5,78,366' },
};

export const RESEARCH: Feature[] = [
  { icon: 'chart', t: 'Live subscription, both exchanges', d: 'NSE catwise and BSE demand schedule reconciled into one table — QIB, both HNI bands, Retail and every reserved quota. Share-wise and application-wise, because allotment odds depend on the second.' },
  { icon: 'trending', t: 'Day-wise and hourly history', d: 'How demand built, bidding day by bidding day, with an hourly drill-down across the last three days.' },
  { icon: 'list', t: 'Lot ladder and reservation', d: 'Minimum bid per category, lot ranges, amounts and applications required for 1x — derived from the issue\u2019s own reservation table, not a rule of thumb.' },
  { icon: 'sparkle', t: 'Expected premium', d: 'Grey-market premium where it exists, always carrying the disclaimer that it is unofficial and unregulated, plus a published scoreboard of how it scored against actual listings.' },
  { icon: 'check-fill', t: 'Allotment on any PAN', d: 'Registrar allottee files matched to applications automatically with the registrar\u2019s own rejection reason. The public checker answers any PAN, including ones we hold no application for.' },
  { icon: 'pie', t: 'Listing performance', d: 'What issues actually did on listing, as a record rather than a projection.' },
  { icon: 'calendar', t: 'Calendar and reminders', d: 'Open, closing, allotment and listing dates with lifecycle alerts, so a client hears before a window shuts rather than after.' },
  { icon: 'doc', t: 'Documents, financials and notes', d: 'RHP and DRHP on the issue itself, four-year financials, objects of the issue, promoters, anchor book, written market notes and a plain-English glossary.' },
  { icon: 'search', t: 'Built to be found', d: 'Open, upcoming, listed and SME listing pages, a full archive by year and month, and issue pages that rank — so a client searching a name lands on your platform.' },
  { icon: 'globe', t: 'Web and mobile', d: 'A responsive site that installs as an app, and a native mobile app with a five-tab layout built for one task per stage.' },
];

export const APPLY: Feature[] = [
  { icon: 'bolt', t: 'UPI and bank ASBA', d: 'The full apply flow with Retail, HNI and reserved-quota tabs, cut-off bidding and a single itemised consent.' },
  { icon: 'users', t: 'Families in one pass', d: 'Apply for a client and their family together with per-member overrides, rather than repeating the flow per person.' },
  { icon: 'wallet', t: 'Multiple demat accounts', d: 'One PAN may hold several demat accounts; the investor picks which one an allotment credits to, at the moment of applying.' },
  { icon: 'file-pdf', t: 'Print forms', d: 'Fillable ASBA forms filled by field name from the real SEBI template, in your own PDF series, for clients who still sign on paper.' },
  { icon: 'repeat', t: 'Correcting a live bid', d: 'A mistyped UPI ID can be corrected after submission, restated to the exchange across every live bid that applicant holds.' },
  { icon: 'bank', t: 'Chasing a stuck block', d: 'Where funds stay blocked past the allotment grace period, the investor can raise an unblock request to the issue\u2019s sponsor banks, with the cooldown and eligibility decided server-side.' },
  { icon: 'clock', t: 'Status from the exchange', d: 'The exchange\u2019s own UPI wording shown verbatim beside our status, so a rejection says which kind of rejection it was.' },
  { icon: 'shield', t: 'The self-PAN rule, enforced', d: 'One public application per PAN per issue, plus one per reserved quota — checked on a keyed fingerprint rather than a name match.' },
];

export const PARTNER: Feature[] = [
  { icon: 'key', t: 'One endpoint, your own front end', d: 'Post final application data to the Partner Print-PDF API and keep your existing flow. Per-partner API keys, issued and revoked from the console.' },
  { icon: 'file-pdf', t: 'Forms that arrive filled on WhatsApp', d: 'WhatsApp\u2019s in-app viewer ignores the PDF flag telling a reader to regenerate field appearances, so a form that looks right in Adobe can reach a client blank. Every form we produce is flattened — what you forward is what they see.' },
  { icon: 'lock', t: 'What you send is what prints', d: 'Each print stores the exact payload received and the PDF is filled from that snapshot, not from a shared client record. A later correction for the same PAN produces a correct form without rewriting what earlier prints were based on.' },
  { icon: 'cursor', t: 'Documentation you can run', d: 'A full API reference with an inline tester: pick an issue, edit the payload, run it against the real print engine and download the PDF a partner would receive. Nothing persisted, no form numbers consumed.' },
  { icon: 'pie', t: 'Reporting that answers questions', d: 'Every call logged and every print reportable, with CSV export and summaries by partner, by day, by month and by IPO — including which issues are failing and why.' },
  { icon: 'layers', t: 'White-label', d: 'Your brand, your domain, your team logins, your own settings cascade. Clients never see ours.' },
  { icon: 'sitemap', t: 'Branches, properly scoped', d: 'Branches sit under their parent with scope enforced in the database rather than assumed in code, so a branch login sees its own book and no one else\u2019s.' },
  { icon: 'user-plus', t: 'Self-onboarding', d: 'Apply online, get reviewed, set a password from a one-time link. Applications live in their own queue, never as half-real tenants.' },
];

export const CONSOLE: Feature[] = [
  { icon: 'box', t: 'Catalogue and completeness', d: 'Every issue scored against 22 checks across six groups, so an incomplete page is visible before a client finds it rather than after.' },
  { icon: 'upload', t: 'Enter an issue four ways', d: 'By hand, from the operator\u2019s Excel workbook, from an exchange PREANCHOR file, or by reading a one-page IPO summary card image straight into the form.' },
  { icon: 'star', t: 'Anchor intimation, parsed', d: 'The anchor letter read into a reviewable roster — text extraction first, vision for the scanned copies NSE files as images, with unmatched investors addable to the master in one click.' },
  { icon: 'download', t: 'Allotment at scale', d: 'Registrar files to 120 MB in DBF, XLSB, XLSX or CSV, parsed off the request thread, matched to applications by PAN, searchable by partial PAN and amount, exportable as CSV, then archived and restorable.' },
  { icon: 'settings', t: 'Masters', d: 'Lead managers, registrars, sponsor banks, anchor investors, UPI handles, sectors, industries, categories and issue types — each with inline add from the issue form.' },
  { icon: 'edit', t: 'Content and messaging', d: 'A rich-text news engine, message templates with a per-template test send, and a delivery log across SMS, email and WhatsApp recording what was sent and what the provider replied.' },
  { icon: 'bell', t: 'Alerts that come to you', d: 'A readiness check on the dashboard naming any open issue the poller cannot compute, with trading days already lost and trading days left — because a warning nobody opens is not a warning.' },
  { icon: 'user', t: 'Roles and audit', d: 'Granular permissions per menu, and an audit trail attributing every change to a person and a time.' },
];

export const ENGINE: Feature[] = [
  { icon: 'exchange', t: 'The subscription poller', d: 'Both exchanges polled through the bidding window, every 60 seconds and every 5 seconds for the final 90 minutes, continuing through the grace hour while exchanges consolidate.' },
  { icon: 'check', t: 'The issue engine', d: 'Reservation, carve-outs, anchor allocation and category splits computed from one tested engine shared by every surface, so the website, the console and the mobile app cannot disagree.' },
  { icon: 'shield', t: 'The rule pack', d: 'ICDR category bounds, the NII split ratio, the anchor cap, minimum application value and the reserved-quota caps, held in one audited module and imported everywhere.' },
  { icon: 'calendar', t: 'A real trading calendar', d: 'Working-day arithmetic from the exchange\u2019s own published holiday list, so T+3 is counted correctly across a weekend and two festivals rather than guessed from weekdays.' },
  { icon: 'sitemap', t: 'Provenance on every figure', d: 'Each reservation count is marked as the exchange\u2019s, the operator\u2019s off the RHP, or derived by us — and a derived table says so on the page.' },
  { icon: 'eye-off', t: 'No synthesised data, anywhere', d: 'Every fabricated fallback was removed from this platform deliberately: no invented financials, no placeholder catalogue, no mock demand. Where we hold nothing, the page says so.' },
];

export const WHY: Feature[] = [
  { icon: 'exchange', t: 'Reconciled, not scraped', d: 'Every subscription row satisfies Book Size × Times = Subscribed, recomputed locally from raw exchange demand rather than trusted from a feed. When a figure disagrees with another site, we can say which basis each one is on.' },
  { icon: 'shield', t: 'QIB stated net of the anchor', d: 'The anchor portion is a sub-allocation of QIB, so measuring public demand against the gross quota overstates the book. We deduct it, label the row, and say whether the figure is an actual allotment or our own estimate.' },
  { icon: 'check', t: 'Validated as it is typed', d: 'Category floors and ceilings, the NII ratio, the anchor cap and the date rules are checked at entry, with blocking faults separated from warnings — so a legal but unusual split is flagged, not refused.' },
  { icon: 'box', t: 'SME is a first-class case', d: 'A different minimum bid, a two-lot individual application, its own demand thresholds, market-maker reservation and single-exchange issues — modelled properly, not bolted onto Mainboard assumptions.' },
  { icon: 'eye-off', t: 'Honest empty states', d: 'A blank is information; a plausible wrong number is not. Where we do not hold a figure, we show nothing and say why.' },
  { icon: 'bolt', t: 'Fastest where it counts', d: 'Five-second polling through the closing window, when the number your client is refreshing changes every tick.' },
];

export const COMPLIANCE: Feature[] = [
  { icon: 'shield', t: 'We distribute and inform, we do not advise', d: 'No recommendations, no ratings, no review scores and no target prices anywhere on the platform.' },
  { icon: 'user', t: 'The self-PAN rule', d: 'Every application uses that applicant\u2019s own PAN, demat and bank or UPI, enforced on a keyed fingerprint.' },
  { icon: 'check-fill', t: 'SEBI thresholds in one place', d: 'Retail, HNI and QIB limits, the UPI mandate cap and the ASBA form-type split live in a single audited module imported everywhere.' },
  { icon: 'clock', t: 'Bidding windows respected', d: 'The regulatory cutoff is a fixed anchor, with T+3 listing from the exchange\u2019s published calendar.' },
  { icon: 'lock', t: 'PII tokenised at rest', d: 'PAN and bank details held in an envelope-encrypted vault, tokenised per tenant.' },
  { icon: 'sitemap', t: 'Tenant isolation in the database', d: 'Row-level security scopes partner data in the database itself, not only in application code.' },
  { icon: 'eye', t: 'Masked by default', d: 'Reports show a masked PAN and the last four digits of an account — a support tool, not a contact list.' },
  { icon: 'doc', t: 'DPDP consent, itemised', d: 'Collected just in time with specific purposes listed, recorded against the applicant, never bundled into a blanket agreement.' },
];

export const STEPS = [
  { n: 1, t: 'Apply', d: 'A short form — your business, contact and any registrations you hold. Two minutes.' },
  { n: 2, t: 'We review', d: 'Our team checks the details and comes back to you, usually within a couple of working days.' },
  { n: 3, t: 'Set your password', d: 'On approval you get a one-time link to choose a password and sign in.' },
  { n: 4, t: 'Integrate or go live', d: 'Use the platform as it stands, take a white-label, or collect an API key and test against the real print engine from the documentation page.' },
];

export const DISCLAIMER =
  'Investoyard is operated by ' + DOC.entity + '. We distribute public issues and share information ' +
  'about them; we do not give investment advice or recommend any issue. Grey-market premium figures, ' +
  'where shown, are unofficial and unregulated and must not be read as a price or a forecast. ' +
  'Investing in securities carries risk, including loss of capital. Subscription figures shown in this ' +
  'document are a dated snapshot for illustration. Partner terms, including any commercial ' +
  'arrangement, are agreed in writing after approval.';
