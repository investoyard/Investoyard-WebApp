/**
 * Which categories the Application-wise view shows, and in what order.
 *
 * IT LIVES HERE because three surfaces read it — the web hub card, the web
 * detail panel and now the mobile subscription panel — and a fourth copy is how
 * "we dropped a category" becomes "we dropped it in two places out of three".
 * It was a literal inside `apps/web/components/SubscriptionHub.tsx` until
 * 2026-10-09, where mobile could not reach it at all.
 *
 * WHY QIB IS ABSENT, and it is the only exclusion that is permanent: an
 * Application-wise figure divides a category's bids by the applications needed
 * to reach 1×, which needs a MINIMUM BID. Retail has one (a lot), both HNI
 * bands have one (₹2 L), the reserved quotas bid in whole lots. **QIB has none
 * — institutional bids vary without limit** — so `minApplicationLots` returns 0
 * for it and the row could only ever print `Req 1×` as 0 beside a multiple
 * divided by nothing. QIB stays in SHARE-wise, where the shares basis is real.
 *
 * Employee / shareholder / policyholder LEFT on 2026-09-28 for that same
 * reason and CAME BACK on 2026-09-30 when the demand settled it: every
 * employee row carrying real share figures is an exact multiple of the lot
 * (4 of 4, with retail 20 of 20 as the control), so they bid in whole lots and
 * the minimum is one. See `minApplication.ts` for the evidence.
 */
export const APP_WISE_ORDER: Record<string, number> = {
  hni: 0,
  hni2: 1,
  retail: 2,
  employee: 3,
  shareholder: 4,
  policyholder: 5,
};

/** Row shape this module needs — a structural subset of `SubRowT`. */
export interface AppWiseRowLike {
  key?: string;
  applicationsTimes?: number;
  bidCount?: number;
}

/**
 * The rows an Application-wise view should render, in order.
 *
 * Returns EMPTY when no row carries both figures, and every caller uses that to
 * hide itself — an empty Application-wise table is worse than no table, and on
 * most of the catalogue there are no application figures at all (the exchanges
 * report bid counts for a minority of issues, and the day-wise log only carries
 * them from 2026-10-01 onwards, which cannot be backfilled).
 */
export function appWiseRows<T extends AppWiseRowLike>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => r.applicationsTimes != null && r.bidCount != null && r.key != null && r.key in APP_WISE_ORDER)
    .sort((a, b) => APP_WISE_ORDER[a.key!] - APP_WISE_ORDER[b.key!]);
}
