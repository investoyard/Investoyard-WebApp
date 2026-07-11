/** Derives the per-metric detail shown when an IPO card tile is expanded.
    Everything is computed from the IpoFull fields (band, lot, issue size,
    reservation %, subscription ×, dates) — matches the app mockups. */
import type { IpoFull } from '@/lib/api';

const RETAIL_MAX = 200000;   // ≤ ₹2L Retail
const SNII_MAX = 1000000;    // ₹2L–₹10L Small-HNI; above → Big-HNI

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
  const hni1 = Math.floor(RETAIL_MAX / perLot) + 1;
  const hni2 = Math.floor(SNII_MAX / perLot) + 1;
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
  const rMax = Math.max(1, Math.floor(RETAIL_MAX / perLot));
  const sMin = rMax + 1;
  const sMax = Math.max(sMin, Math.floor(SNII_MAX / perLot));
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
  const rows = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  if (!rows.length || !total) return [];
  return rows.map((r) => {
    const pct = r.reservedPct ?? 0;
    const amount = (total * pct) / 100;
    return { cat: r.category.toUpperCase(), pct, shares: Math.round(amount / (up(ipo) || 1)), amount };
  });
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
