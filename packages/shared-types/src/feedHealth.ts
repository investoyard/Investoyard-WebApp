/**
 * Is an exchange's subscription feed still updating?
 *
 * WHY THIS EXISTS. On 2026-10-23 BSE's member /demandschedule API stopped
 * updating at ~18:54 and never resumed, straight through the 19:00 close of a
 * Rs 30,213 Cr issue — byte-identical figures across six fresh logins, with
 * `totalapplication` frozen too. JPL therefore published a QIB book 10.2%
 * short and read 67.15x where both exchanges published 70.55x.
 *
 * NOTHING TOLD US. The response carries no timestamp (checked: no date field,
 * and `no-store` headers rule out an HTTP cache), and `subscriptionAsOf`
 * records when WE last WROTE, not how old the data is — so the card read
 * "Updated 19:05" over figures frozen at 18:54. It was found only because the
 * operator compared against the exchange's own page, days later.
 *
 * THE DETECTOR IS RELATIVE, NOT ABSOLUTE, and that is the whole design.
 * An absolute "no change for N minutes" alarm cannot tell a frozen feed from a
 * quiet market, and a quiet market is the common case — an SME issue can
 * legitimately take no bids for an hour. But ONE exchange moving while the
 * OTHER sits still is unambiguous: the same issue, the same minute, two feeds
 * that should both be tracking it.
 *
 * It fires exchange-wide by construction. A frozen BSE affects every open
 * issue at once, and each of those issues independently sees "my NSE is
 * moving and my BSE is not". A cross-issue "is BSE alive anywhere" check
 * would have asked the wrong question and answered no.
 */

/** An exchange that changed this recently is demonstrably alive. */
export const FEED_FRESH_MIN = 10;
/**
 * One that has not changed for this long WHILE ITS SIBLING IS ALIVE is stale.
 *
 * Calibrated against the real incident: BSE was 22 minutes frozen before anyone
 * noticed, while NSE was changing every minute or two. Twenty minutes is long
 * enough that an ordinary lull between bids cannot reach it on an issue whose
 * other exchange is demonstrably busy, and short enough to catch a freeze
 * inside the hour rather than after the close.
 */
export const FEED_STALE_MIN = 20;

/** What the poller records per exchange: when its figures last CHANGED, and what they were. */
export interface FeedSeen {
  /** ISO instant of the last CHANGE — not of the last poll. */
  at: string;
  /** Total shares that exchange last reported, across every category. The change detector. */
  sh: number;
}
export type Exchange = 'nse' | 'bse';
export type FeedSeenMap = Partial<Record<Exchange, FeedSeen>>;

export type FeedHealth =
  | { stale: false; reason: 'both-moving' | 'both-quiet' | 'one-exchange-only' | 'nothing-seen' }
  | { stale: true; exchange: Exchange; stalledMin: number; siblingMin: number };

const minutesSince = (iso: string, now: number): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : Number.POSITIVE_INFINITY;
};

/**
 * Judge one issue's two feeds against each other.
 *
 * Deliberately says NOTHING in three cases, because in each of them the honest
 * answer is that we cannot tell:
 *
 *  - BOTH QUIET. A genuinely still market and a double outage look identical
 *    from here. Alarming on it would fire every lunchtime on a slow SME issue,
 *    and an alert that cries wolf is one people stop reading — the same reason
 *    the readiness card renders nothing when it has nothing to say.
 *  - ONE EXCHANGE ONLY. An issue listed on a single exchange has no sibling to
 *    compare against, so there is no second opinion to be had. Reporting it as
 *    healthy would be a guess; reporting it as stale would be a guess.
 *  - NOTHING SEEN. Before either feed has reported once there is no baseline.
 *
 * A feed that has never been seen while its sibling is alive is NOT reported
 * either: on the first minutes of a bidding day that is simply one exchange
 * answering before the other.
 */
export function feedHealth(seen: FeedSeenMap, now: number = Date.now()): FeedHealth {
  const nse = seen.nse;
  const bse = seen.bse;
  if (!nse && !bse) return { stale: false, reason: 'nothing-seen' };
  if (!nse || !bse) return { stale: false, reason: 'one-exchange-only' };

  const nMin = minutesSince(nse.at, now);
  const bMin = minutesSince(bse.at, now);

  /* The live one has to be CONVINCINGLY live and the other CONVINCINGLY not.
     The gap between the two thresholds is what stops a feed flapping in and
     out of the alert as the clock crosses a single boundary. */
  if (nMin <= FEED_FRESH_MIN && bMin >= FEED_STALE_MIN) {
    return { stale: true, exchange: 'bse', stalledMin: bMin, siblingMin: nMin };
  }
  if (bMin <= FEED_FRESH_MIN && nMin >= FEED_STALE_MIN) {
    return { stale: true, exchange: 'nse', stalledMin: nMin, siblingMin: bMin };
  }
  return { stale: false, reason: nMin <= FEED_FRESH_MIN && bMin <= FEED_FRESH_MIN ? 'both-moving' : 'both-quiet' };
}

/**
 * Fold a fresh reading into what we already recorded.
 *
 * AN EMPTY READ IS MISSING DATA, NOT A CHANGE TO ZERO — the same rule
 * `keepKnownFigures` enforces one layer down, and for the same reason. On the
 * day of the incident BSE returned a completely empty response at 13:34 UTC
 * and then went back to its frozen figures a minute later. Treating that as a
 * change would have stamped the feed "fresh" at the exact moment it was least
 * trustworthy, and treating it as a change TO ZERO would have wiped the
 * baseline the detector needs.
 *
 * A SMALLER non-zero figure IS a change: exchanges do revise down, and a
 * detector that only accepted increases would miss a feed that started
 * reporting nonsense.
 */
export function noteFeedReading(
  prev: FeedSeen | undefined,
  shares: number,
  nowIso: string,
): FeedSeen | undefined {
  if (!(shares > 0)) return prev;              // empty / failed read — say nothing
  if (prev && prev.sh === shares) return prev; // unchanged — the timestamp must NOT advance
  return { at: nowIso, sh: shares };
}
