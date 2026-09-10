/**
 * IPO detail completeness — the score behind the admin catalog progress bar.
 *
 * Operator ask (2026-09-09): every row on Admin → IPO List carries a bar
 * showing how much of the IPO's detail has been filled in. Click to see
 * WHICH fields are missing, with a jump-to-edit link per group.
 *
 * Design:
 *   - 25 checks, grouped into 7 buckets, EQUAL WEIGHT (4% each). One perm
 *     per check keeps the score transparent — an operator ticks off items
 *     one by one and the bar moves in obvious steps.
 *   - Once the issue has CLOSED (stage ∈ awaiting / allotment-out / listed /
 *     withdrawn), the three "Application rail" checks — ASBA templates,
 *     print form series, bid config — DROP OUT of both numerator and
 *     denominator. They're irrelevant to a closed issue and shouldn't
 *     drag the bar down after the window has passed.
 *   - "Filled" is deliberately LIBERAL — a truthy scalar, a non-empty
 *     array, an object with keys — so the bar reflects "did the operator
 *     enter something" rather than "did they enter the RIGHT thing"
 *     (validation errors are handled separately by the form's `derived.issues`).
 *
 * Pure data function — no side effects, no I/O. Kept in apps/web because
 * only the admin surface uses it; nothing on the consumer path scores
 * completeness. If mobile ever grows an admin console, promote to
 * packages/shared-types.
 */
import { ipoPhase } from '@/lib/format';

export type CompletenessGroup =
  | 'Identity' | 'Pricing' | 'Structure' | 'Dates' | 'Parties' | 'Documents' | 'Application rail';

export interface CompletenessCheck {
  key: string;
  label: string;
  group: CompletenessGroup;
  filled: boolean;
  /** True when this check is skipped because the IPO has already closed. */
  skipped?: boolean;
}

export interface Completeness {
  filled: number;
  total: number;
  pct: number;
  checks: CompletenessCheck[];
  missing: CompletenessCheck[];
}

/** Is this value considered "filled"? Deliberately permissive — see file doc. */
function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return true;
}

/** Fresh / OFS leg is filled when its `basis` isn't 'none' and its value
 *  is a positive number. The form stores { basis, value } where basis is
 *  'amount' | 'percent' | 'shares' | 'none' — 'none' means the operator
 *  hasn't declared this leg exists on the issue. */
function legFilled(leg: any): boolean {
  if (!leg || leg.basis === 'none' || leg.basis == null) return false;
  const v = Number(leg.value ?? leg.amountCr ?? 0);
  return Number.isFinite(v) && v > 0;
}

/** Reservation table filled = the map exists AND its `pct` values sum near 100. */
function reservationFilled(extra: any): boolean {
  const t = extra?.shareResv;
  if (!t || typeof t !== 'object') return false;
  const entries = Object.values(t as Record<string, any>).filter((r: any) => r && r.on !== false);
  if (!entries.length) return false;
  const sum = entries.reduce((a, r: any) => a + (Number(r?.pct) || 0), 0);
  return sum >= 99.5 && sum <= 100.5;
}

/** Are we past the close date? Uses the shared phase engine. */
function isClosed(ipo: any): boolean {
  const ph = ipoPhase(ipo).phase;
  return ph === 'closed' || ph === 'allotment' || ph === 'listed' || ph === 'withdrawn';
}

/**
 * Compute the completeness score. `ipo` is a full row from `fetchIpos({all:true})`
 * — the admin catalog page already holds this shape.
 */
export function computeIpoCompleteness(ipo: any): Completeness {
  const extra = ipo?.extra ?? {};
  const docs: any[] = Array.isArray(ipo?.documents) ? ipo.documents : [];
  const leads: any[] = Array.isArray(extra?.leads) ? extra.leads : Array.isArray(ipo?.leadManagers) ? ipo.leadManagers : [];
  const exchanges: string[] = Array.isArray(ipo?.exchanges) ? ipo.exchanges : [];
  const closed = isClosed(ipo);

  const raw: CompletenessCheck[] = [
    // Identity (5)
    { key: 'symbol',     label: 'Symbol',                    group: 'Identity', filled: has(ipo?.symbol) },
    { key: 'name',       label: 'Full name',                 group: 'Identity', filled: has(ipo?.name) },
    { key: 'category',   label: 'Category (Board + type)',   group: 'Identity', filled: has(ipo?.type) && (has(extra?.categoryName) || ipo.type === 'mainboard' || ipo.type === 'sme') },
    // Face value is persisted in `extra.faceValue` (the form field); some
    // records also carry a top-level `faceValue`. Check both.
    { key: 'faceValue',  label: 'Face value',                group: 'Identity', filled: has(ipo?.faceValue) || has(extra?.faceValue) },
    { key: 'isin',       label: 'ISIN',                      group: 'Identity', filled: has(ipo?.isin) },

    // Pricing (4)
    { key: 'priceMin',   label: 'Price band — min',          group: 'Pricing',  filled: has(ipo?.priceBandMin) },
    { key: 'priceMax',   label: 'Price band — max',          group: 'Pricing',  filled: has(ipo?.priceBandMax) || ipo?.mechanism === 'fixed_price' },
    { key: 'lotSize',    label: 'Lot size',                  group: 'Pricing',  filled: has(ipo?.lotSize) },
    { key: 'issueSize',  label: 'Issue size (₹ Cr)',         group: 'Pricing',  filled: has(ipo?.issueSizeCr) || has(extra?.issueSizeCr) || has(ipo?.issueSize) },

    // Structure (3). Fresh / OFS are saved as `{ basis, value }` under
    // `extra.fresh` / `extra.ofs` — `basis` says whether `value` is in
    // ₹ Cr, %, or shares. Any non-'none' basis + positive value counts.
    { key: 'freshCr',    label: 'Fresh issue (₹ Cr)',        group: 'Structure', filled: legFilled(extra?.fresh) || has(extra?.freshIssueCr) },
    { key: 'ofsCr',      label: 'OFS (₹ Cr)',                group: 'Structure', filled: legFilled(extra?.ofs) || has(extra?.ofsCr) },
    { key: 'shareResv',  label: 'Reservation table',        group: 'Structure', filled: reservationFilled(extra) },

    // Dates (5)
    { key: 'anchorDate',    label: 'Anchor date',             group: 'Dates',    filled: has(ipo?.anchorDate) || has(extra?.anchorDate) },
    { key: 'openDate',      label: 'Issue open',              group: 'Dates',    filled: has(ipo?.openDate) },
    { key: 'closeDate',     label: 'Issue close',             group: 'Dates',    filled: has(ipo?.closeDate) },
    { key: 'allotmentDate', label: 'Basis of allotment',      group: 'Dates',    filled: has(ipo?.allotmentDate) },
    { key: 'listingDate',   label: 'Listing date',            group: 'Dates',    filled: has(ipo?.listingDate) },

    // Parties (3)
    { key: 'registrar',  label: 'Registrar',                 group: 'Parties',   filled: has(ipo?.registrar) },
    { key: 'leads',      label: 'Lead managers',             group: 'Parties',   filled: leads.length > 0 },
    { key: 'exchanges',  label: 'Exchanges',                 group: 'Parties',   filled: exchanges.length > 0 },

    // Documents (2)
    { key: 'drhp',       label: 'DRHP link / file',          group: 'Documents', filled: has(ipo?.drhpUrl) || docs.some((d) => d?.type === 'drhp' && has(d?.url)) },
    { key: 'rhp',        label: 'RHP link / file',           group: 'Documents', filled: has(ipo?.rhpUrl) || docs.some((d) => d?.type === 'rhp' && has(d?.url)) },

    // Application rail (3) — dropped for closed issues
    { key: 'asba',       label: 'Application PDF template',  group: 'Application rail', filled: docs.some((d) => typeof d?.type === 'string' && d.type.startsWith('asba_form') && has(d?.url)), skipped: closed },
    { key: 'series',     label: 'Application series for PDF', group: 'Application rail', filled: has(extra?.printFormSeries) || has(extra?.pdfSeries) || has(extra?.printSeries), skipped: closed },
    { key: 'bid',        label: 'Bid rail integration',       group: 'Application rail', filled: has(extra?.bidding) || has(extra?.exchangeSymbol) || ipo?.startBid === true, skipped: closed },
  ];

  const active = raw.filter((c) => !c.skipped);
  const filled = active.filter((c) => c.filled).length;
  const total = active.length;
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const missing = active.filter((c) => !c.filled);
  return { filled, total, pct, checks: raw, missing };
}

/** Groups in display order — mirrors the operator's IPO form tab flow. */
export const COMPLETENESS_GROUPS: CompletenessGroup[] = [
  'Identity', 'Pricing', 'Structure', 'Dates', 'Parties', 'Documents', 'Application rail',
];
