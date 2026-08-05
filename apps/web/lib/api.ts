/**
 * Investoyard web — API client + re-exported shared types.
 * Tier-0 reads are public. Mock fallback keeps SEO pages building when the API is down.
 */
import type { IpoListItem, IpoDetail, SubscriptionRow } from '@investoyard/shared-types';
export type { IpoListItem, IpoDetail };

/** Web-local enrichment for the live-data detail page (kept out of the shared contract). */
export type SubRow = SubscriptionRow & { reservedPct?: number };
export interface IpoFull extends Omit<IpoDetail, 'subscription'> {
  subscription?: SubRow[];
  gmpHistory?: { day: string; value: number }[];
  anchors?: { name: string; amount: string }[];
  leadManagers?: string[];
  exchanges?: string[];
  logo?: string;
  /* ---- extended detail-page fields (synthesized until the live API provides them; TODO(prod)) ---- */
  faceValue?: number;
  freshIssue?: string;
  offerForSale?: string;
  formsFor1x?: { retail: number; sHni: number; bHni: number };
  appWise?: { key: string; label: string; formsFor1x: number; apps: number; times: number }[];
  totalApps?: number;
  financialYears?: string[];
  financialRows?: { metric: string; values: number[] }[];
  objects?: { text: string; amount?: string }[];
  strengths?: string[];
  strategies?: string[];
  promoters?: string[];
  faqs?: { q: string; a: string }[];
  /* operator-entered extended fields (rich HTML + structured data) persisted via the admin form */
  extra?: Record<string, any>;
  /** true when this detail came from the live API (a real catalog row with a server id),
   *  false/absent for the seeded MOCK fallback. Gates real apply submission. */
  live?: boolean;
}

// The browser uses NEXT_PUBLIC_API_URL (e.g. '/api', which IIS/nginx reverse-proxies
// to the API same-origin). But a RELATIVE base can't be fetched by Node during the
// static build — so at build (no `window`) a relative base is resolved against a local
// origin (API_INTERNAL_ORIGIN, default http://localhost:3000) so the exported pages are
// generated from live DB data. Set an absolute NEXT_PUBLIC_API_URL to bypass this.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
function apiUrl(path: string): string {
  // Server-only branch (dead-code-eliminated from the client bundle). At build the
  // static export fetches from the LOCAL live API so pages get real DB data even when
  // the public API URL (NEXT_PUBLIC_API_URL) isn't reachable from the build box:
  //   API_INTERNAL_URL  — explicit absolute base (e.g. http://localhost:3000/api)
  //   else a relative public base is resolved against API_INTERNAL_ORIGIN.
  if (typeof window === 'undefined') {
    if (process.env.API_INTERNAL_URL) return `${process.env.API_INTERNAL_URL}${path}`;
    if (API_BASE.startsWith('/')) {
      const origin = process.env.API_INTERNAL_ORIGIN ?? 'http://localhost:3000';
      return `${origin}${API_BASE}${path}`;
    }
  }
  return `${API_BASE}${path}`;
}

const MOCK: IpoDetail[] = [
  {
    id: '1', symbol: 'ACME', name: 'Acme Technologies Ltd', type: 'mainboard', status: 'open',
    openDate: '2026-07-01', closeDate: '2026-07-08', allotmentDate: '2026-07-11', listingDate: '2026-07-15',
    priceBandMin: 100, priceBandMax: 105, lotSize: 142, minAmount: 14910, issueSize: '₹500 Cr', registrar: 'Link Intime',
    subscriptionTimes: 12.4, gmp: 18, gmpPct: 17.1,
    about: 'Acme Technologies is a cloud infrastructure company serving enterprise customers across India and South-East Asia.',
    objectsOfIssue: 'Repayment of borrowings, capital expenditure for data centres, and general corporate purposes.',
    subscription: [
      { category: 'qib', timesSubscribed: 24.1, asOf: '2026-06-21T15:00:00Z' },
      { category: 'nii', timesSubscribed: 9.8, asOf: '2026-06-21T15:00:00Z' },
      { category: 'retail', timesSubscribed: 6.2, asOf: '2026-06-21T15:00:00Z' },
      { category: 'total', timesSubscribed: 12.4, asOf: '2026-06-21T15:00:00Z' },
    ],
    financials: [
      { label: 'Revenue (FY25)', value: '₹1,240 Cr' },
      { label: 'PAT (FY25)', value: '₹186 Cr' },
      { label: 'RoNW', value: '18.4%' },
      { label: 'P/E (upper)', value: '32.1x' },
    ],
    documents: [{ type: 'RHP', url: '#' }, { type: 'DRHP', url: '#' }],
  },
  {
    id: '2', symbol: 'BETA', name: 'Beta Industries Ltd', type: 'sme', status: 'upcoming',
    openDate: '2026-07-10', closeDate: '2026-07-12', allotmentDate: '2026-07-15', listingDate: '2026-07-18',
    priceBandMin: 55, priceBandMax: 58, lotSize: 2000, minAmount: 116000, issueSize: '₹42 Cr', registrar: 'Bigshare',
    gmp: 6, gmpPct: 10.3,
    about: 'Beta Industries manufactures precision auto components for OEMs.',
    objectsOfIssue: 'Working capital, plant & machinery, and general corporate purposes.',
    smeCompliance: { meetsNorms: true, ebitdaTest: true, ofsPct: 18, gcpPct: 9 },
    financials: [
      { label: 'Revenue (FY25)', value: '₹118 Cr' },
      { label: 'PAT (FY25)', value: '₹14.2 Cr' },
      { label: 'RoNW', value: '21.0%' },
      { label: 'P/E (upper)', value: '16.4x' },
    ],
    documents: [{ type: 'RHP', url: '#' }],
  },
  {
    id: '3', symbol: 'ZETA', name: 'Zeta Foods Ltd', type: 'mainboard', status: 'listed',
    openDate: '2026-06-05', closeDate: '2026-06-09', allotmentDate: '2026-06-11', listingDate: '2026-06-13',
    priceBandMin: 220, priceBandMax: 230, lotSize: 65, minAmount: 14950, issueSize: '₹820 Cr', registrar: 'KFin Technologies',
    listingGainPct: 14.2, subscriptionTimes: 48.7, gmp: 31, gmpPct: 13.5,
    about: 'Zeta Foods is a packaged-foods brand with a national distribution network and a fast-growing exports business.',
    objectsOfIssue: 'Brand building, capacity expansion and general corporate purposes.',
    financials: [
      { label: 'Revenue (FY25)', value: '₹2,010 Cr' },
      { label: 'PAT (FY25)', value: '₹240 Cr' },
      { label: 'RoNW', value: '22.7%' },
      { label: 'P/E (upper)', value: '28.5x' },
    ],
    documents: [{ type: 'RHP', url: '#' }, { type: 'DRHP', url: '#' }],
  },
  {
    id: '4', symbol: 'NIMBUS', name: 'Nimbus Renewables Ltd', type: 'mainboard', status: 'open',
    openDate: '2026-07-02', closeDate: '2026-07-09', allotmentDate: '2026-07-12', listingDate: '2026-07-16',
    priceBandMin: 312, priceBandMax: 328, lotSize: 45, minAmount: 14760, issueSize: '₹1,150 Cr', registrar: 'KFin Technologies',
    subscriptionTimes: 3.1, gmp: 42, gmpPct: 12.8,
    about: 'Nimbus Renewables develops and operates utility-scale solar and wind assets across western India.',
    objectsOfIssue: 'Funding capacity additions, debt repayment and general corporate purposes.',
    subscription: [
      { category: 'qib', timesSubscribed: 5.4, asOf: '2026-06-21T15:00:00Z' },
      { category: 'nii', timesSubscribed: 2.2, asOf: '2026-06-21T15:00:00Z' },
      { category: 'retail', timesSubscribed: 1.9, asOf: '2026-06-21T15:00:00Z' },
      { category: 'total', timesSubscribed: 3.1, asOf: '2026-06-21T15:00:00Z' },
    ],
    financials: [
      { label: 'Revenue (FY25)', value: '₹980 Cr' },
      { label: 'PAT (FY25)', value: '₹141 Cr' },
      { label: 'RoNW', value: '12.9%' },
      { label: 'P/E (upper)', value: '34.0x' },
    ],
    documents: [{ type: 'RHP', url: '#' }, { type: 'DRHP', url: '#' }],
  },
  {
    id: '5', symbol: 'VERDANT', name: 'Verdant Agritech Ltd', type: 'sme', status: 'open',
    openDate: '2026-06-30', closeDate: '2026-07-07', allotmentDate: '2026-07-10', listingDate: '2026-07-14',
    priceBandMin: 90, priceBandMax: 95, lotSize: 1200, minAmount: 114000, issueSize: '₹38 Cr', registrar: 'Bigshare',
    subscriptionTimes: 27.6, gmp: 22, gmpPct: 23.2,
    about: 'Verdant Agritech makes biological crop-protection inputs distributed to farmers across India.',
    objectsOfIssue: 'Capacity expansion, working capital and general corporate purposes.',
    smeCompliance: { meetsNorms: true, ebitdaTest: true, ofsPct: 12, gcpPct: 8 },
    subscription: [
      { category: 'qib', timesSubscribed: 18.2, asOf: '2026-06-21T15:00:00Z' },
      { category: 'nii', timesSubscribed: 41.3, asOf: '2026-06-21T15:00:00Z' },
      { category: 'retail', timesSubscribed: 30.1, asOf: '2026-06-21T15:00:00Z' },
      { category: 'total', timesSubscribed: 27.6, asOf: '2026-06-21T15:00:00Z' },
    ],
    documents: [{ type: 'RHP', url: '#' }],
  },
  {
    id: '6', symbol: 'HELIOS', name: 'Helios Financial Services Ltd', type: 'mainboard', status: 'upcoming',
    openDate: '2026-07-14', closeDate: '2026-07-16', allotmentDate: '2026-07-18', listingDate: '2026-07-22',
    priceBandMin: 440, priceBandMax: 462, lotSize: 32, minAmount: 14784, issueSize: '₹2,400 Cr', registrar: 'Link Intime',
    gmp: 28, gmpPct: 6.1,
    about: 'Helios Financial Services is a retail-focused NBFC offering secured and unsecured lending across 14 states.',
    objectsOfIssue: 'Augmenting the capital base for onward lending and general corporate purposes.',
    financials: [
      { label: 'AUM (FY25)', value: '₹18,200 Cr' },
      { label: 'PAT (FY25)', value: '₹612 Cr' },
      { label: 'RoNW', value: '15.8%' },
      { label: 'P/B (upper)', value: '3.1x' },
    ],
    documents: [{ type: 'DRHP', url: '#' }],
  },
  {
    id: '7', symbol: 'AURELIA', name: 'Aurelia Lifesciences Ltd', type: 'mainboard', status: 'upcoming',
    openDate: '2026-07-17', closeDate: '2026-07-19', allotmentDate: '2026-07-23', listingDate: '2026-07-25',
    priceBandMin: 178, priceBandMax: 188, lotSize: 78, minAmount: 14664, issueSize: '₹690 Cr', registrar: 'KFin Technologies',
    about: 'Aurelia Lifesciences is a specialty API and CDMO player supplying regulated markets.',
    objectsOfIssue: 'Capex for a new API block, debt repayment and general corporate purposes.',
    documents: [{ type: 'DRHP', url: '#' }],
  },
  {
    id: '8', symbol: 'ORION', name: 'Orion Logistics Ltd', type: 'mainboard', status: 'listed',
    openDate: '2026-05-28', closeDate: '2026-06-01', allotmentDate: '2026-06-03', listingDate: '2026-06-05',
    priceBandMin: 145, priceBandMax: 152, lotSize: 98, minAmount: 14896, issueSize: '₹560 Cr', registrar: 'Bigshare',
    listingGainPct: -4.6, subscriptionTimes: 2.3,
    about: 'Orion Logistics runs an asset-light third-party logistics and warehousing network.',
    financials: [
      { label: 'Revenue (FY25)', value: '₹1,420 Cr' },
      { label: 'PAT (FY25)', value: '₹58 Cr' },
      { label: 'RoNW', value: '9.2%' },
      { label: 'P/E (upper)', value: '41.0x' },
    ],
    documents: [{ type: 'RHP', url: '#' }],
  },
  {
    id: '9', symbol: 'KESARI', name: 'Kesari Textiles Ltd', type: 'sme', status: 'listed',
    openDate: '2026-05-30', closeDate: '2026-06-03', allotmentDate: '2026-06-05', listingDate: '2026-06-09',
    priceBandMin: 66, priceBandMax: 70, lotSize: 1600, minAmount: 112000, issueSize: '₹29 Cr', registrar: 'Bigshare',
    listingGainPct: 36.4, subscriptionTimes: 96.2,
    about: 'Kesari Textiles is an integrated home-textiles exporter.',
    smeCompliance: { meetsNorms: true, ebitdaTest: true, ofsPct: 0, gcpPct: 14 },
    documents: [{ type: 'RHP', url: '#' }],
  },
];

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    // Default (cacheable) fetch — required by `output: export`. The static pages are a
    // build-time snapshot of the DB; rebuild (clearing .next/cache) to refresh them.
    const res = await fetch(apiUrl(path));
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/* ----------------------------------------------------------- live-data enrichment */
function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const RESERVED: Record<string, number> = { qib: 50, nii: 15, retail: 35, employee: 5, total: 100 };
const RESERVED_SME: Record<string, number> = { qib: 0, nii: 50, retail: 50, employee: 0, total: 100 };
const ANCHOR_NAMES = ['Govt Pension Fund Global', 'HDFC Mutual Fund', 'SBI Life Insurance', 'Nomura Funds', 'Abu Dhabi Inv. Authority', 'ICICI Prudential MF', 'Morgan Stanley Asia'];

function gmpSeries(symbol: string, end: number): { day: string; value: number }[] {
  const pts: { day: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const base = end * (1 - i * 0.07);
    const wig = (hash(symbol + 'g' + i) % 7) - 3;
    pts.push({ day: i === 0 ? 'Today' : `D-${i}`, value: i === 0 ? end : Math.max(0, Math.round(base + wig)) });
  }
  return pts;
}
function pickAnchors(symbol: string, count: number): { name: string; amount: string }[] {
  const out: { name: string; amount: string }[] = [];
  for (let i = 0; out.length < count && i < count + 3; i++) {
    const name = ANCHOR_NAMES[hash(symbol + 'a' + i) % ANCHOR_NAMES.length];
    if (!out.find((o) => o.name === name)) out.push({ name, amount: `₹${60 + (hash(symbol + 'm' + i) % 240)} Cr` });
  }
  return out;
}
function issueCr(s?: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*Cr/i);
  return m ? parseFloat(m[1]) : 0;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

function enrich(ipo: IpoDetail): IpoFull {
  const res = ipo.type === 'sme' ? RESERVED_SME : RESERVED;
  const ex: any = (ipo as any).extra ?? {};
  const f: IpoFull = {
    ...ipo,
    logo: (ipo as any).logoUrl ?? (ipo as any).logo, // API sends logoUrl; cards/hero read `logo`
    subscription: ipo.subscription?.map((s) => ({ ...s, reservedPct: res[s.category] ?? 0 })),
    leadManagers: Array.isArray(ex.leads) && ex.leads.length ? ex.leads : (ipo.type === 'sme' ? ['Nuvama', 'JM Financial'] : ['Axis Capital', 'Nuvama', 'JM Financial']),
    exchanges: ipo.type === 'sme' ? ['NSE SME', 'BSE SME'] : ['NSE', 'BSE'],
  };
  if (ipo.gmp != null) f.gmpHistory = gmpSeries(ipo.symbol, ipo.gmp);
  if (ipo.type === 'mainboard' && ipo.subscription) f.anchors = pickAnchors(ipo.symbol, 4);

  const cr = issueCr(ipo.issueSize);
  const upper = ipo.priceBandMax ?? ipo.priceBandMin ?? 1;
  const lot = ipo.lotSize ?? 1;
  f.faceValue = 10;
  f.freshIssue = `₹${Math.round(cr * (ipo.type === 'sme' ? 1 : 0.85))} Cr`;
  if (ipo.type !== 'sme' && cr) f.offerForSale = `₹${Math.round(cr * 0.15)} Cr`;

  // Applications required for 1× + app-wise subscription (from live subscription data only)
  if (ipo.subscription && cr) {
    const totalShares = (cr * 1e7) / upper;
    const retailForms = Math.max(1, Math.round((totalShares * 0.35) / lot));
    const sHniForms = Math.max(1, Math.round((totalShares * 0.05) / (14 * lot)));
    const bHniForms = Math.max(1, Math.round((totalShares * 0.10) / (67 * lot)));
    f.formsFor1x = { retail: retailForms, sHni: sHniForms, bHni: bHniForms };
    const sub = Object.fromEntries(ipo.subscription.map((s) => [s.category, s.timesSubscribed]));
    const nT = sub.nii ?? sub.hni ?? 0, rT = sub.retail ?? 0;
    f.appWise = [
      { key: 'hniBt', label: 'HNI-BT (S-HNI)', formsFor1x: sHniForms, apps: Math.round(sHniForms * nT * 1.1), times: r2(nT * 1.1) },
      { key: 'hniAt', label: 'HNI-AT (B-HNI)', formsFor1x: bHniForms, apps: Math.round(bHniForms * nT * 0.8), times: r2(nT * 0.8) },
      { key: 'retail', label: 'Retail', formsFor1x: retailForms, apps: Math.round(retailForms * rT), times: r2(rT) },
    ];
    f.totalApps = f.appWise.reduce((a, b) => a + b.apps, 0);
  }

  // Financials (4-year, synthesized from a deterministic base)
  const baseRev = Math.max(90, cr * 1.4 + (hash(ipo.symbol) % 200));
  const g = 1.14 + (hash(ipo.symbol + 'g') % 9) / 100;
  const rev = [0, 1, 2, 3].map((i) => baseRev / Math.pow(g, i));
  const pm = 0.08 + (hash(ipo.symbol + 'p') % 9) / 100, em = pm + 0.09;
  f.financialYears = ['FY26', 'FY25', 'FY24', 'FY23'];
  f.financialRows = [
    { metric: 'Total Income', values: rev.map(r2) },
    { metric: 'EBITDA', values: rev.map((r) => r2(r * em)) },
    { metric: 'Profit After Tax', values: rev.map((r) => r2(r * pm)) },
    { metric: 'Net Worth', values: rev.map((r) => r2(r * 0.42)) },
    { metric: 'Total Assets', values: rev.map((r) => r2(r * 0.75)) },
    { metric: 'Total Borrowing', values: rev.map((r) => r2(r * 0.22)) },
  ];

  f.objects = [
    { text: ipo.objectsOfIssue ?? 'Capacity expansion and capital expenditure', amount: cr ? `₹${Math.round(cr * 0.6)} Cr` : undefined },
    { text: 'General corporate purposes' },
  ];
  f.strengths = ['Experienced promoters and management team', 'Diversified, marquee customer base', 'Integrated and cost-efficient operations', 'Consistent growth in revenue and margins'];
  f.strategies = ['Expand capacity and product range', 'Deepen distribution and grow exports', 'Invest in automation and technology', 'Strengthen the balance sheet'];
  f.promoters = [`${ipo.name.split(' ')[0]} Holdings Pvt Ltd`, 'Promoter Family (individuals)'];
  f.faqs = [
    { q: `What is the minimum investment in the ${ipo.name} IPO?`, a: `One lot of ${lot} shares — ₹${(ipo.minAmount ?? 0).toLocaleString('en-IN')} at the upper price band of ₹${upper}.` },
    { q: 'How many bids can I place?', a: 'Up to 3 bids per application. Retail applications are capped at ₹2,00,000; above that you must apply in the HNI category.' },
    { q: 'When are the funds debited?', a: 'Funds are blocked via a UPI mandate at application and debited only on allotment. If shares are not allotted, the block is released automatically.' },
    { q: 'When will the shares list?', a: `Tentative listing on ${ipo.listingDate ?? 'the listing date'} on ${ipo.type === 'sme' ? 'NSE SME / BSE SME' : 'NSE & BSE'}.` },
  ];
  return f;
}

const FULL: IpoFull[] = MOCK.map(enrich);

export async function getIpos(): Promise<IpoListItem[]> {
  // API returns IpoDetail[] (mapped to the shared contract); enrich each into a full card.
  // On any failure safeGet returns the base MOCK, which is enriched the same way.
  const list = await safeGet<IpoDetail[]>('/ipos', MOCK);
  return list.map(enrich);
}

export async function getIpoDetail(symbol: string): Promise<IpoFull | undefined> {
  const fromApi = await safeGet<IpoDetail | null>(`/ipos/by-symbol/${symbol}`, null);
  if (fromApi) return { ...enrich(fromApi), live: true };
  return FULL.find((i) => i.symbol.toLowerCase() === symbol.toLowerCase());
}

/** Synchronous mock lookup for client components (apply flow runs on seeded data). */
export function mockIpoBySymbol(symbol: string): IpoFull | undefined {
  return FULL.find((i) => i.symbol.toLowerCase() === symbol.toLowerCase());
}
export function mockIpos(): IpoFull[] { return FULL; }

/** Symbols to statically generate — the live DB list at build time. Never empty:
 *  `output: export` rejects a dynamic route with zero params, so when the catalog is
 *  empty we fall back to placeholder symbols (their pages are simply unreachable from
 *  the empty home until real IPOs are added). */
export async function ipoSymbols(): Promise<string[]> {
  const list = await safeGet<IpoDetail[]>('/ipos', MOCK);
  const symbols = list.map((i) => i.symbol);
  return symbols.length ? symbols : MOCK.map((i) => i.symbol);
}
