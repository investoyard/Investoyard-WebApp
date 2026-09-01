/** Derives the per-metric detail shown when an IPO card tile is expanded.
    Everything is computed from the IpoFull fields (band, lot, issue size,
    reservation %, subscription ×, dates) — matches the app mockups. */
import type { IpoFull } from '@/lib/api';
import { computeIssue, rulePackFor, inferRegulationBasis, type IssueInputs } from '@investoyard/shared-types';

/**
 * The ₹2 L / ₹10 L band thresholds used to be literals here AND in
 * lib/api.ts AND in mobile. They now come from the rule pack, so a
 * regulatory change is one edit in packages/shared-types/src/issueRules.ts.
 */
function packFor(ipo: IpoFull) {
  const sr: any = (ipo as any).extra?.shareResv;
  const qib = Number(String(sr?.qib?.pct ?? '').replace(/[^\d.]/g, '')) || 0;
  const ex: any = (ipo as any).extra ?? {};
  return rulePackFor(
    ipo.type === 'sme' ? 'sme' : 'mainboard',
    ex.mechanism === 'fixed_price' ? 'fixed_price' : 'book_built',
    ex.regulationBasis || inferRegulationBasis(qib),
  );
}

/**
 * Map an IPO onto the engine's inputs. ONE mapper for the whole web app —
 * lib/api.ts calls this too, so the public figures and the admin/card panels
 * can no longer be derived from differently-shaped inputs.
 */
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

/** The single derivation for this IPO. */
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
  /**
   * Shares come from the ENGINE, which floors each category to a whole number
   * of lots and gives the rounding residual to one named category. This used
   * to be Math.round(amount / price) — a share count that was not a whole lot
   * and did not agree with the same figure on the public page.
   */
  const d = derive(ipo);
  if (d.primary?.categories.length) {
    return d.primary.categories.map((c) => ({ cat: c.label, pct: c.pct, shares: c.shares, amount: c.amount }));
  }
  // no reservation table yet — fall back to the exchange's own category split
  const total = parseIssueValue(ipo.issueSize);
  if (!total) return [];
  const rows = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  if (!rows.length) return [];
  return rows
    .map((r) => {
      const pct = (r as any).reservedPct ?? 0;
      const amount = (total * pct) / 100;
      return { cat: r.category.toUpperCase(), pct, shares: Math.round(amount / (up(ipo) || 1)), amount };
    })
    .filter((r) => r.pct > 0); // an all-zero table would render an empty bar
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
