/**
 * Which categories the Application-wise view shows, in what order, and which of
 * them an application-wise MULTIPLE actually means anything for.
 *
 * IT LIVES HERE because three surfaces read it — the web hub card, the web
 * detail panel and the mobile subscription panel — and a fourth copy is how
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
 * the minimum is one. See `minApplication.ts` for the evidence. They keep their
 * row and their application COUNT; what they no longer carry is the multiple —
 * see `PRO_RATA_CATEGORIES` below.
 */

/**
 * THE CATEGORIES WHERE AN APPLICATION-WISE MULTIPLE PREDICTS NOTHING, because
 * allotment is PRO-RATA (operator ruling, 2026-10-21).
 *
 * The column exists to answer "what are my chances". In RETAIL that is exactly
 * what it answers: the quota goes out in minimum lots and, once it cannot go
 * round, by DRAW OF LOTS — so applications-needed-for-1× is the number of
 * tickets the draw can pay out, and the multiple is the inverse of a chance.
 * In a pro-rata category nobody is drawn: the quota is divided in proportion to
 * what each applicant bid for, so **the SHARE-wise multiple is what decides an
 * allotment and the application count decides nothing.**
 *
 * JPL IS WHY THIS WAS REPORTED, and it shows the cost plainly. Its employee
 * quota is OVER-subscribed at 1.08× by shares — every applicant gets roughly
 * 93% of their bid — while the Application-wise cell beside it read 0.16× in a
 * low-demand tone. Two panels on one screen pointing opposite ways, with the
 * colour on the misleading one. Shareholder read 1.01× against 0.21×.
 *
 * The figure was not WRONG, which is the subtle part: `book ÷ one lot` is a
 * true capacity count. It is the FRAME that does not apply, so the honest
 * rendering is "not applicable" rather than a corrected number — and the row
 * keeps its real application count, which is the one figure there that means
 * something.
 *
 * NII IS DELIBERATELY NOT IN THIS LIST, and the asymmetry is the operator's
 * call rather than an oversight. Both HNI bands are proportionate under ICDR
 * too, so a strict reading would take them as well and leave Retail alone. But
 * NII has a hard minimum allotment parcel — the ₹2 L NII application size,
 * with a draw of lots when the quota cannot give everyone that much — so its
 * count is a real capacity figure, which is exactly what `minAllotmentLots`
 * was built for the day before this. Worth knowing before anyone "tidies" the
 * two together: on JPL, bHNI's gap between the two multiples (0.70× vs 0.08×,
 * 8.8×) is WIDER than employee's, because a bHNI must bid over ₹10 L while the
 * parcel is ₹2 L worth. That gap is structural and correct there.
 *
 * `allotmentOddsPct` in the API's `applications.service.ts` already drew this
 * line for the investor-facing odds — it is gated to retail, commented "each
 * application is one lottery ticket". This panel was the one place the ratio
 * reached past the mechanic that makes it true.
 */
export const PRO_RATA_CATEGORIES: readonly string[] = ['employee', 'shareholder', 'policyholder'];

/**
 * Is this category allotted pro-rata, i.e. does an application-wise multiple
 * mean nothing for it?
 *
 * Applied ONCE, in `subscriptionTable`, which sets `SubRowT.proRata` so the
 * renderers read a decided row rather than each re-testing the condition.
 */
export function isProRataAllotment(category: string | undefined | null): boolean {
  return category != null && PRO_RATA_CATEGORIES.includes(category);
}

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
  proRata?: boolean;
}

/**
 * The rows an Application-wise view should render, in order.
 *
 * Returns EMPTY when no row carries a bid count, and every caller uses that to
 * hide itself — an empty Application-wise table is worse than no table, and on
 * most of the catalogue there are no application figures at all (the exchanges
 * report bid counts for a minority of issues, and the day-wise log only carries
 * them from 2026-10-01 onwards, which cannot be backfilled).
 *
 * A PRO-RATA ROW IS ADMITTED ON ITS BID COUNT ALONE, because that count is the
 * only figure on it that means anything and dropping the row would lose it —
 * which is what the 2026-09-28 state did. Its ratio columns render as "not
 * applicable"; see `PRO_RATA_CATEGORIES`.
 *
 * Measured before this changed: across the whole catalogue there is NO issue
 * where only pro-rata categories carry bid counts, so no panel gains or loses
 * its visibility from the looser test.
 */
export function appWiseRows<T extends AppWiseRowLike>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => {
      if (r.key == null || !(r.key in APP_WISE_ORDER)) return false;
      if (r.bidCount == null) return false;
      return r.applicationsTimes != null || r.proRata === true || isProRataAllotment(r.key);
    })
    .sort((a, b) => APP_WISE_ORDER[a.key!] - APP_WISE_ORDER[b.key!]);
}
