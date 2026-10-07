/**
 * The mobile IPO view model.
 *
 * THERE IS NO ARITHMETIC IN THIS FILE and there must never be again. Every
 * derived figure comes from `packages/shared-types/src/ipoDerive.ts`, which web
 * re-exports too, so the two surfaces cannot show different numbers for the
 * same issue.
 *
 * Until 2026-10-07 this file carried its OWN `subscriptionTable`, `lotLadder`
 * and `reservation`, and none of them had received the September rebuild. They
 * were not slightly behind — they were putting wrong figures in front of
 * investors:
 *
 *   • `subscriptionTable` ignored the record's reservation table and divided a
 *     hardcoded { qib: 50, nii: 15, retail: 35 }. That map has no key for hni,
 *     hni2, shareholder or policyholder, so all four showed a Book Size of
 *     ZERO — 59 rows across the catalogue — and SME showed a zero QIB because
 *     the SME map says qib: 0.
 *   • No anchor was deducted, so QIB was always gross.
 *   • No carve-out was counted, so a reserved quota had no Book Size.
 *   • `lotLadder` always returned the five-row MAINBOARD shape, so an SME issue
 *     showed Retail at ONE lot when the minimum is two.
 *
 * What stays here is what is genuinely mobile's: the `IpoFull` shape this app
 * passes around, and the three view helpers below.
 */
import type { IpoDetail, SubscriptionRow } from '@investoyard/shared-types';
import { reservedPctFor } from '@investoyard/shared-types';

/** Subscription row enriched with the category's reserved % of the issue. */
export type SubRow = SubscriptionRow & { reservedPct?: number };

/** The shared IpoDetail + fields the live API actually sends (logoUrl, extra). */
export interface IpoFull extends Omit<IpoDetail, 'subscription'> {
  subscription?: SubRow[];
  logoUrl?: string;
  /** operator-entered extended fields persisted via the admin form */
  extra?: Record<string, any>;
}

/* The generic split, used ONLY where the record names no percentage of its own
   — most of the catalogue, and the honest fallback for a legacy imported row.
   Mobile used to use it unconditionally; see `reservedPctFor`. */
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

/**
 * Attach reservedPct to subscription rows.
 *
 * THE RECORD'S OWN RESERVATION TABLE FIRST — `reservedPctFor` is the shared
 * resolver web's `enrich()` uses, and the reason it is shared is that mobile's
 * version read ONLY the generic map. Every issue whose split is not exactly
 * 50/15/35 was therefore stamped with percentages belonging to no actual IPO.
 */
export function enrich(ipo: IpoDetail): IpoFull {
  const res = ipo.type === 'sme' ? RESERVED_SME : RESERVED;
  const extra = (ipo as any).extra ?? undefined;
  return {
    ...ipo,
    status: effectiveStatus(ipo),
    logoUrl: (ipo as any).logoUrl ?? undefined,
    extra,
    subscription: ipo.subscription?.map((s) => ({ ...s, reservedPct: reservedPctFor(extra, s.category, res) })),
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Everything below is a RE-EXPORT. Nothing here computes anything, and nothing
 * here should start to: a figure both surfaces show belongs in one helper,
 * which is the lesson this codebase has now paid for five times over.
 * ─────────────────────────────────────────────────────────────────────────── */
export {
  issueInputsFor,
  derive,
  parseIssueValue,
  crOrInr,
  applicationBands,
  lotLadder,
  totalOfferedShares,
  reservation,
  subCatLabel,
  offeredByBucket,
  anchorRosterShares,
  subscriptionTable,
  timeline,
} from '@investoyard/shared-types';
export type { AppBand, LotRow, ResRow, SubRowT, AnchorBasis, TlItem } from '@investoyard/shared-types';
