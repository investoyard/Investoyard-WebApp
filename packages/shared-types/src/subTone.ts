/**
 * THE SUBSCRIPTION TONE LADDER — one word and one tone per multiple.
 *
 * It lived in `apps/web/components/SubscriptionHub.tsx` and was COPIED into the
 * detail page, where the two had already drifted: at JPL's 3.00x the hub said
 * *Oversubscribed* in green while the detail page said *Heavily subscribed*,
 * and between 2x and 3x they disagreed about the COLOUR as well — hot green on
 * one page, warm amber on the other, for one issue. The same class as the four
 * byte-identical dot palettes and the two demand ladders this project has
 * already paid for: A VOCABULARY READ BY MORE THAN ONE SURFACE BELONGS IN
 * EXACTLY ONE PLACE.
 *
 * It is here rather than in the web component because MOBILE needs it too —
 * its subscription screens had no tone word at all, so there was nothing to
 * drift until now, and the moment one is added a second copy is how it starts.
 *
 * Thresholds are the hub's, which was canonical because three surfaces already
 * read it (the hub cards, /subscription/v2 and the shared image) and only the
 * detail page differed.
 */

export type SubTone = 'hot' | 'warm' | 'cool' | 'cold';

/** The tone a multiple falls in. `cold` is specifically "nothing bid yet". */
export const subTone = (times: number): SubTone =>
  times >= 2 ? 'hot' : times >= 1 ? 'warm' : times > 0 ? 'cool' : 'cold';

/**
 * The customer-facing word. Four states, and `Awaiting bids` is deliberately
 * not "Undersubscribed": before any bid arrives there is nothing to be under.
 */
export const subToneLabel = (times: number): string =>
  times >= 2 ? 'Oversubscribed'
    : times >= 1 ? 'Fully subscribed'
      : times > 0 ? 'In progress'
        : 'Awaiting bids';

/**
 * ₹ crore for a headline figure: whole rupees once the number is big enough
 * that two decimals are noise, two decimals while it is not. `₹1,644 Cr` and
 * `₹32.15 Cr` are both the honest reading at their own size.
 *
 * Shared because `LiveSubscription` re-stated it locally beside the tone copy
 * it also re-stated — and a local copy of a formatter is exactly the shape that
 * produced the tone drift above.
 */
export const fmtCrore = (cr: number): string =>
  `₹${cr >= 1000 ? Math.round(cr).toLocaleString('en-IN') : cr.toFixed(2)} Cr`;

/** Indian grouping, no decimals — share counts and application counts. */
export const fmtIndian = (n: number): string => Math.round(n).toLocaleString('en-IN');
