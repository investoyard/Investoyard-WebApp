/**
 * Broker overview — content source for /brokers (page + PDF).
 *
 * v3.0 — COMPACT. Sir reviewed v2.0 and asked for four things: make it short,
 * key points only, a consistent tile layout, and plain Indian English a desk
 * can read without a second pass. 7 pages and ~1,730 words became 4 pages.
 *
 * WHAT WAS REMOVED, and why each removal is a CORRECTION rather than a trim:
 *
 *  1. LIVE SUBSCRIPTION AND DAY-WISE HISTORY left "what your clients get".
 *     Subscription is opt-in per account and its API scope is NOT in the
 *     default set, so advertising it as something a broker's clients receive
 *     over-promises the product. Day-wise and hourly history is derived from
 *     the same feed and went with it.
 *
 *  2. "WEB AND MOBILE" BECAME RESPONSIVE WEB ONLY. The Expo app is
 *     Investoyard-branded and is not white-labelled, so a broker does not get
 *     a native app. Saying so was simply wrong.
 *
 *  3. THE WHOLE "WHAT YOU CAN DISPLAY" TIER TABLE IS GONE. Ten rows of
 *     open / opt-in / locked / never is a compliance annexure, not a page of a
 *     short sales document. The two rows that are real RESTRICTIONS — no
 *     registrar rows for other applicants, no other partner's data — survive
 *     as compliance tiles, which is where a broker's compliance officer looks
 *     for them anyway.
 *
 *  4. "UPI AND BANK ASBA" → "UPI AND SYNDICATE ASBA", which is the actual
 *     split the product implements (ASBA_SYNDICATE_ABOVE, ₹5 lakh), and
 *     "print forms in your series" → "print forms", because the series is a
 *     detail, not the headline.
 *
 * WHAT REPLACED THE GOVERNANCE SECTION. Sir asked for the SEBI rules stated as
 * key points, against what we actually provide. That is section 05 and it is
 * the strongest page in the document for its real reader: every tile is a rule
 * the PRODUCT enforces in code, with the figure, so a compliance officer can
 * check it rather than take it on trust. The old governance section described
 * database mechanics — row-level security, envelope encryption — which is
 * engineer-speak and answers a question a compliance officer did not ask.
 *
 * WHAT THIS DOCUMENT STILL MUST NOT DO is answer a regulatory question FOR the
 * broker. It states what the platform enforces, because that is a fact about
 * our product. Whether a registered firm may publish a given figure is their
 * compliance function's call, and section 05 says so in as many words rather
 * than implying a clearance we cannot give.
 *
 * LANGUAGE: plain Indian English. Short sentences, active voice, lakh and
 * crore, and the terms a broker's desk already uses (ASBA, HNI, QIB, RHP,
 * demat) left alone. No literary phrasing — "as a record rather than a
 * projection" became "past record only, not a forecast".
 *
 * The visual system is imported from ../platform/platform.css so the two
 * documents cannot drift.
 */

export type Feature = { icon: string; t: string; d: string };

export const DOC = {
  title: 'Your IPO desk,\nunder your brand.',
  kicker: 'For SEBI-registered stock brokers',
  version: 'v3.0',
  updated: 'October 2026',
  entity: 'Safal Capital Services Private Limited',
  site: 'newipo.finwave.co',
};

export const HERO_LINE =
  'Mainboard and SME IPOs, end to end, under your own brand. Or inside the app you already have. ' +
  'Your clients stay with you, and the engineering is already done.';

/**
 * Four figures a broker can act on.
 *
 * NOTHING HERE MAY CLAIM A FEED WE ARE NOT OFFERING. v2.0 led with "5 sec —
 * refresh at the close" and "both exchanges reconciled into one table", which
 * are LIVE SUBSCRIPTION claims — the very thing removed from the offer above.
 * A cover figure that contradicts the body is worse than a weak figure.
 */
export const GLANCE = [
  { v: '1,260+', l: 'IPOs covered', s: 'Mainboard and SME' },
  { v: 'NSE + BSE', l: 'Both exchange rails', s: 'e-IPO and iBBS' },
  { v: 'Zero', l: 'Engineering needed', s: 'to go live on your brand' },
  { v: 'Your book', l: 'And nobody else’s', s: 'your data stays yours' },
];

/* ── 01 ─────────────────────────────────────────────────────────────────── */
export const WHY: Feature[] = [
  { icon: 'users', t: 'Keep clients in your app',
    d: 'In IPO week your clients open other apps. Give them a full IPO desk under your own name.' },
  { icon: 'bolt', t: 'Go live without a build',
    d: 'Send us your logo, your colours and a subdomain. We host and run the rest.' },
  { icon: 'pie', t: 'A back office, not just a website',
    d: 'Reports on your own book, registrar files matched by PAN, CSV export by day, month and IPO.' },
  { icon: 'shield', t: 'Compliance is built in',
    d: 'The platform enforces SEBI bid limits, the one-PAN rule and ICDR offer checks.' },
];

/* ── 02 ─────────────────────────────────────────────────────────────────── */
export const CLIENT: Feature[] = [
  { icon: 'list', t: 'IPO list and key dates',
    d: 'Open, upcoming and listed issues. Price band, lot size, issue size, and reminders before an issue closes.' },
  { icon: 'chart', t: 'Lot ladder and minimum bid',
    d: 'Minimum bid for each category, with lot ranges and amounts, from the issue’s own reservation table.' },
  { icon: 'check-fill', t: 'Allotment check on any PAN',
    d: 'Registrar files matched to applications automatically, with the registrar’s own rejection reason.' },
  { icon: 'trending', t: 'Listing performance',
    d: 'Listing-day gain or loss on past issues. Past record only, not a forecast.' },
  { icon: 'doc', t: 'Documents and financials',
    d: 'RHP and DRHP, four-year financials, objects of the issue, promoters and the anchor book.' },
  { icon: 'globe', t: 'Responsive website',
    d: 'One site for desktop and mobile, carrying your brand throughout. It also installs like an app.' },
];

/* ── 03 ─────────────────────────────────────────────────────────────────── */
export const MODELS = [
  { n: '01', k: 'White-label', t: 'Your brand, end to end',
    d: 'Your logo, your colours, your own domain. We host and run it. Nothing for your team to build.' },
  { n: '02', k: 'API', t: 'Keep your own app',
    d: 'Call our API from your own app. Full documentation with a live tester you can run before you write code.' },
  { n: '03', k: 'Hybrid', t: 'Start on ours, move to yours',
    d: 'Run on the hosted site while you build. Switch later without re-onboarding a single client.' },
] as const;

/* ── 04 ─────────────────────────────────────────────────────────────────── */
export const APPLY: Feature[] = [
  { icon: 'bolt', t: 'UPI and syndicate ASBA',
    d: 'Retail, HNI and reserved-quota tabs, with cut-off bidding and one itemised consent. Your client sees the exchange’s own UPI status.' },
  { icon: 'file-pdf', t: 'Print forms',
    d: 'Prefilled ASBA forms from the real SEBI template, ready to print and hand to the client.' },
  { icon: 'users', t: 'The whole family in one go',
    d: 'A client and their family together, each with their own PAN, demat and UPI, as the rules require.' },
  { icon: 'wallet', t: 'More than one demat',
    d: 'A PAN may hold several demat accounts. Your client picks which one gets the allotment.' },
  { icon: 'repeat', t: 'Modify a live bid',
    d: 'Change a wrong UPI ID after submission. It updates every live bid that client is holding.' },
  { icon: 'bank', t: 'Unblock stuck funds',
    d: 'If money stays blocked after allotment, raise an unblock request with the issue’s sponsor banks.' },
];

/* ── 05 ─────────────────────────────────────────────────────────────────── */
/**
 * SEBI RULES, AS KEY POINTS — sir's own instruction, and the page that earns
 * the document its forward to compliance.
 *
 * EVERY TILE CARRIES ITS FIGURE. "Bid limits are enforced" is a claim; "Retail
 * up to ₹2 lakh, S-HNI ₹2 to ₹10 lakh, B-HNI above ₹10 lakh" is something a
 * compliance officer can check against the regulation in ten seconds. The
 * thresholds come from ONE place in the code (issueRules.ts) and are the same
 * numbers that drive live apply validation, so this page cannot drift from the
 * product by a quiet edit somewhere else.
 *
 * Nine tiles, in a 3x3 grid: the six that are SEBI bid and offer rules first,
 * then the three about conduct and data.
 */
export const SEBI: Feature[] = [
  { icon: 'shield', t: 'One PAN, one application',
    d: 'One per PAN per issue, plus one per reserved quota. Matched on the encrypted PAN, never on a name.' },
  { icon: 'bank', t: 'Money blocked, not debited',
    d: 'ASBA with a UPI mandate. Funds stay in your client’s own bank until shares are allotted.' },
  { icon: 'wallet', t: 'Bid limits enforced',
    d: 'Retail up to ₹2 lakh. S-HNI ₹2–10 lakh. B-HNI above ₹10 lakh. SME needs two lots minimum.' },
  { icon: 'file-pdf', t: 'Form chosen automatically',
    d: 'UPI mandate up to ₹5 lakh. Above that, the application moves to a syndicate ASBA form.' },
  { icon: 'pie', t: 'ICDR offer structure checked',
    d: 'QIB, NII and Retail limits, the NII split and the 60% anchor cap. A wrong figure is flagged or blocked.' },
  { icon: 'calendar', t: 'T+3 listing dates',
    d: 'Checked on the real NSE trading calendar with exchange holidays, not just weekdays.' },
  { icon: 'eye', t: 'No advice, anywhere',
    d: 'No buy or sell calls, no ratings, no target prices. We distribute and inform only.' },
  { icon: 'sitemap', t: 'Your book only',
    d: 'Your reports cover your own clients only. No other applicant’s data, and no other broker’s.' },
  { icon: 'lock', t: 'Client data protected',
    d: 'PAN and bank details encrypted, and masked in reports. Consent taken at apply time, item by item.' },
];

/**
 * The one sentence that keeps this document honest.
 *
 * It states what the PLATFORM enforces and stops there. Whether a registered
 * firm may publish a given figure depends on that firm's registration and its
 * own agreements, and a partner document must not read as a clearance.
 */
export const SEBI_NOTE =
  'These are rules the platform enforces. What your own registration allows you to publish stays ' +
  'your compliance team’s call. Tell us what they decide and we will configure it and lock it.';

/* ── 06 ─────────────────────────────────────────────────────────────────── */
/**
 * Every item maps to a field the application actually captures
 * (PartnerApplication: sebiRegNo, legalName, entityType, pan, gstin, city,
 * state, contactName, email, mobile, documents). It is a real list, not a
 * wish list, which is the only reason it is worth printing.
 */
export const REQUIREMENTS = [
  { k: 'Registration', items: [
    'SEBI registration number, with a copy of the certificate',
    'ARN, if you distribute mutual funds too',
  ] },
  { k: 'The entity', items: [
    'Legal name and entity type',
    'Business PAN and GSTIN',
    'Registered city and state',
  ] },
  { k: 'People', items: [
    'A contact person, email and mobile — this becomes your admin login',
    'An authorised signatory',
    'A compliance contact',
  ] },
  { k: 'For a white-label', items: [
    'Your logo and brand colour',
    'The subdomain you want, and DNS access',
  ] },
  { k: 'For the API', items: [
    'A technical contact',
    'The server addresses your calls come from',
  ] },
] as const;

export const CLOSE = {
  title: 'Ready when you are.',
  body:
    'Tell us which model suits you and what your compliance team needs to see. Approval takes a ' +
    'couple of working days, and we configure your brand, your domain and your settings before a ' +
    'single client sees it.',
  label: 'Apply online at',
  url: 'newipo.finwave.co/partner',
};

export const DISCLAIMER =
  'Investoyard is an IPO information and application platform operated by Safal Capital Services ' +
  'Private Limited. We distribute and inform, and give no investment advice or recommendation. ' +
  'Investments in securities carry market risk — read all offer documents carefully. This document ' +
  'describes platform capability. It is not an offer, and not a regulatory clearance for any figure ' +
  'a partner chooses to publish.';

export const SECTIONS = [
  { id: 'why', n: '01', t: 'Why brokers partner with us' },
  { id: 'client', n: '02', t: 'What your clients get' },
  { id: 'models', n: '03', t: 'Three ways to work with us' },
  { id: 'apply', n: '04', t: 'How your clients apply' },
  { id: 'onboard', n: '05', t: 'What we need from you' },
  /* SEBI LAST, DELIBERATELY. It is the page that earns the forward to
     compliance, and it sits immediately before the invitation to apply — so
     the last thing a broker reads before the call to action is everything the
     product already enforces on their behalf. */
  { id: 'sebi', n: '06', t: 'SEBI rules, built into the product' },
] as const;
