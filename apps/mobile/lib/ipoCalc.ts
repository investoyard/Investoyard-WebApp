/**
 * Per-metric detail shown when an IPO card tile is expanded.
 *
 * The arithmetic is NO LONGER a copy of the web file — both now call
 * computeIssue() from @investoyard/shared-types, so a category share count
 * cannot differ between the two surfaces. Only the presentation types are
 * local.
 */
import type { IpoDetail, SubscriptionRow } from '@investoyard/shared-types';
import { computeIssue, rulePackFor, inferRegulationBasis, type IssueInputs } from '@investoyard/shared-types';

/** Subscription row enriched with the category's reserved % of the issue. */
export type SubRow = SubscriptionRow & { reservedPct?: number };

/** The shared IpoDetail + fields the live API actually sends (logoUrl, extra). */
export interface IpoFull extends Omit<IpoDetail, 'subscription'> {
  subscription?: SubRow[];
  logoUrl?: string;
  /** operator-entered extended fields persisted via the admin form */
  extra?: Record<string, any>;
}

/* Standard reservation splits (mirrors apps/web/lib/api.ts enrich()). */
const RESERVED: Record<string, number> = { qib: 50, nii: 15, retail: 35, employee: 5, total: 100 };
const RESERVED_SME: Record<string, number> = { qib: 0, nii: 50, retail: 50, employee: 0, total: 100 };

/**
 * The operator sets status manually and often forgets to advance it — derive the
 * real lifecycle stage from the dates and never show an EARLIER stage than the
 * dates prove (an IPO whose close date passed can't still be "upcoming").
 * Explicit 'withdrawn' is always respected.
 */
const STATUS_ORDER = ['upcoming', 'open', 'closed', 'listed'];
export function effectiveStatus(ipo: Pick<IpoDetail, 'status' | 'openDate' | 'closeDate' | 'listingDate'>): IpoDetail['status'] {
  if (ipo.status === 'withdrawn') return ipo.status;
  const now = new Date();
  const day = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); // local YYYY-MM-DD
  let derived = 'upcoming';
  if (ipo.listingDate && day >= ipo.listingDate) derived = 'listed';
  else if (ipo.closeDate && day > ipo.closeDate) derived = 'closed';
  else if (ipo.openDate && day >= ipo.openDate) derived = 'open';
  const a = STATUS_ORDER.indexOf(ipo.status);
  const d = STATUS_ORDER.indexOf(derived);
  return (d > a ? derived : ipo.status) as IpoDetail['status'];
}

/**
 * Listing price + gain for a LISTED issue. Price comes from the admin-entered
 * NSE/BSE listing price (extra.nse/bseListingPrice, GMP & Listing page) and the
 * gain from the listingGainPct column — each derives the other from the band
 * ceiling when only one is entered. null until any listing data exists.
 */
export function listingInfo(ipo: IpoFull): { price?: number; gainPct?: number } | null {
  if (ipo.status !== 'listed') return null;
  const ex: any = ipo.extra ?? {};
  const issue = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  let price = Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) || 0;
  let gainPct = ipo.listingGainPct ?? undefined;
  if (!price && gainPct != null && issue) price = Math.round(issue * (1 + gainPct / 100));
  if (gainPct == null && price && issue) gainPct = Math.round(((price - issue) / issue) * 1000) / 10;
  if (!price && gainPct == null) return null;
  return { price: price || undefined, gainPct };
}

/** Attach reservedPct to subscription rows so reservation()/subscriptionTable() work. */
export function enrich(ipo: IpoDetail): IpoFull {
  const res = ipo.type === 'sme' ? RESERVED_SME : RESERVED;
  return {
    ...ipo,
    status: effectiveStatus(ipo),
    logoUrl: (ipo as any).logoUrl ?? undefined,
    extra: (ipo as any).extra ?? undefined,
    subscription: ipo.subscription?.map((s) => ({ ...s, reservedPct: res[s.category] ?? 0 })),
  };
}

/** Band thresholds come from the rule pack — never a literal here. */
function packFor(ipo: IpoFull) {
  const ex: any = (ipo as any).extra ?? {};
  const qib = Number(String(ex.shareResv?.qib?.pct ?? '').replace(/[^\d.]/g, '')) || 0;
  return rulePackFor(
    ipo.type === 'sme' ? 'sme' : 'mainboard',
    ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    ex.regulationBasis || inferRegulationBasis(qib),
  );
}

/** Mirrors issueInputsFor() in apps/web/lib/ipoCalc.ts. */
export function issueInputsFor(ipo: IpoFull): IssueInputs {
  const ex: any = (ipo as any).extra ?? {};
  const sr: any = ex.shareResv ?? {};
  const pct = (k: string) => { const r = sr[k]; const v = Number(String(r?.pct ?? '').replace(/[^\d.]/g, '')); return r?.on && Number.isFinite(v) ? v : 0; };
  return {
    board: ipo.type === 'sme' ? 'sme' : 'mainboard',
    mechanism: ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    regulationBasis: ex.regulationBasis || undefined,
    lotSize: ipo.lotSize,
    priceFloor: ipo.priceBandMin,
    priceCap: ipo.priceBandMax ?? ipo.priceBandMin,
    issueSizeCr: parseIssueValue(ipo.issueSize) / 1e7 || undefined,
    // the stated count outranks the ₹ total — see IssueInputs.totalShares
    totalShares: Number(ex.totalShares) || undefined,
    fresh: ex.fresh,
    ofs: ex.ofs,
    reservation: { qib: pct('qib'), hni: pct('hni'), hni2: pct('hni2'), retail: pct('retail'), employee: pct('employee'), shareholder: pct('shareholder'), other: pct('other') },
    discounts: { retail: Number(ex.retailDiscount) || 0 },
    // pctOfQib drives the split; shares/price record what the book actually took
    anchor: Number(ex.anchorPct) || Number(ex.anchorShares)
      ? {
          pctOfQib: Number(ex.anchorPct) || undefined,
          mfPct: Number(ex.anchorMfPct) || undefined,
          shares: Number(ex.anchorShares) || undefined,
          price: Number(ex.anchorPrice) || undefined,
        }
      : undefined,
  };
}

export const derive = (ipo: IpoFull) => computeIssue(issueInputsFor(ipo));

export function parseIssueValue(s?: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*Cr/i);
  if (m) return parseFloat(m[1]) * 1e7;
  const n = s.replace(/[^\d.]/g, '');
  return n ? parseFloat(n) : 0;
}
export function crOrInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
const up = (ipo: IpoFull) => ipo.priceBandMax ?? ipo.priceBandMin ?? 0;

export interface AppBand { cat: string; sub: string; lots: number; amount: number; }
export function applicationBands(ipo: IpoFull): AppBand[] {
  const perLot = (ipo.lotSize ?? 0) * up(ipo);
  if (!perLot) return [];
  const th = packFor(ipo).thresholds;
  // one more lot than fits under the threshold — the bands are STRICT
  const lotsAbove = (amt?: number) => (amt ? Math.floor(amt / perLot) + 1 : 1);
  const hni1 = lotsAbove(th.hni2?.above);
  const hni2 = lotsAbove(th.hni?.above);
  return [
    { cat: 'Retail', sub: 'upto ₹2 L', lots: 1, amount: perLot },
    { cat: 'HNI 1', sub: '₹2 L – ₹10 L', lots: hni1, amount: hni1 * perLot },
    { cat: 'HNI 2', sub: 'above ₹10 L', lots: hni2, amount: hni2 * perLot },
  ];
}

export interface LotRow { cat: string; sub: string; lots: number; shares: number; amount: number; }
export function lotLadder(ipo: IpoFull): LotRow[] {
  const lot = ipo.lotSize ?? 0;
  const perLot = lot * up(ipo);
  if (!perLot) return [];
  const th = packFor(ipo).thresholds;
  const rMax = Math.max(1, Math.floor((th.hni2?.above ?? 0) / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor((th.hni?.above ?? 0) / perLot));
  const bMin = sMax + 1;
  const mk = (cat: string, sub: string, lots: number): LotRow => ({ cat, sub, lots, shares: lots * lot, amount: lots * perLot });
  return [
    mk('Retail', 'Up to ₹2 L', 1),
    mk('Retail', 'Up to ₹2 L', rMax),
    mk('S-HNI', '₹2 L to ₹10 L', sMin),
    mk('S-HNI', '₹2 L to ₹10 L', sMax),
    mk('B-HNI', 'Above ₹10 L', bMin),
  ];
}

export interface ResRow { cat: string; pct: number; shares: number; amount: number; }
export function reservation(ipo: IpoFull): ResRow[] {
  const total = parseIssueValue(ipo.issueSize);
  if (!total) return [];
  /**
   * Shares come from the ENGINE, which floors each category to a whole number
   * of lots and gives the residual to one named category. This was
   * Math.round(amount / price) — a count that was not a whole lot and could
   * disagree with the same figure on web.
   */
  const d = derive(ipo);
  if (d.primary?.categories.length) {
    return d.primary.categories.map((c) => ({ cat: c.label, pct: c.pct, shares: c.shares, amount: c.amount }));
  }
  const rows = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  if (!rows.length) return [];
  return rows
    .map((r) => {
      const pct = r.reservedPct ?? 0;
      const amount = (total * pct) / 100;
      return { cat: r.category.toUpperCase(), pct, shares: Math.round(amount / (up(ipo) || 1)), amount };
    })
    .filter((r) => r.pct > 0); // an all-zero table would render an empty bar — hide instead
}

export interface SubRowT { cat: string; bookSize: number; subscribed: number; times: number; }
export function subscriptionTable(ipo: IpoFull): { rows: SubRowT[]; total: SubRowT } | null {
  const total = parseIssueValue(ipo.issueSize);
  const subs = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  if (!subs.length || !total) return null;
  const totalShares = total / (up(ipo) || 1);
  const rows: SubRowT[] = subs.map((r) => {
    const book = (totalShares * (r.reservedPct ?? 0)) / 100;
    return { cat: r.category.toUpperCase(), bookSize: Math.round(book), subscribed: Math.round(book * r.timesSubscribed), times: r.timesSubscribed };
  });
  const bookSum = rows.reduce((a, b) => a + b.bookSize, 0);
  const subSum = rows.reduce((a, b) => a + b.subscribed, 0);
  return { rows, total: { cat: 'Total', bookSize: bookSum, subscribed: subSum, times: bookSum ? +(subSum / bookSum).toFixed(2) : 0 } };
}

export interface TlItem { label: string; date?: string; }
function addDays(d?: string, n = 1): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function timeline(ipo: IpoFull): TlItem[] {
  return [
    { label: 'Open date', date: ipo.openDate },
    { label: 'Close date', date: ipo.closeDate },
    { label: 'Basis of allotment', date: ipo.allotmentDate },
    { label: 'Initiation of refunds', date: addDays(ipo.allotmentDate, 1) },
    { label: 'Credit to demat', date: addDays(ipo.allotmentDate, 1) },
    { label: 'Listing date', date: ipo.listingDate },
  ];
}
