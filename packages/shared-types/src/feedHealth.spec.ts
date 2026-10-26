/* JEST, not vitest — this package declares "test": "jest" and has no vitest
   dependency at all. A spec that imports vitest PASSES under `npx vitest run`
   and FAILS `npm run build`, because tsconfig compiles the specs with
   everything else. describe/it/expect come from the globals; import nothing. */
import {
  FEED_FRESH_MIN, FEED_STALE_MIN, feedHealth, noteFeedReading, type FeedSeenMap,
} from './feedHealth';

/* A fixed instant, so nothing here depends on when the suite runs. */
const NOW = Date.parse('2026-10-23T13:16:00.000Z'); // 18:46 IST, mid-incident
const agoIso = (min: number) => new Date(NOW - min * 60000).toISOString();

describe('feedHealth — the relative rule', () => {
  it('catches the real incident: BSE frozen while NSE keeps moving', () => {
    /* The actual shape on 2026-10-23: NSE changing every minute or two,
       BSE byte-identical for 22 minutes. */
    const seen: FeedSeenMap = {
      nse: { at: agoIso(1), sh: 1824148944 },
      bse: { at: agoIso(22), sh: 1466857368 },
    };
    const v = feedHealth(seen, NOW);
    expect(v.stale).toBe(true);
    if (v.stale) {
      expect(v.exchange).toBe('bse');
      expect(v.stalledMin).toBe(22);
      expect(v.siblingMin).toBe(1);
    }
  });

  it('catches it the other way round too — NSE frozen, BSE moving', () => {
    const v = feedHealth({ nse: { at: agoIso(40), sh: 10 }, bse: { at: agoIso(2), sh: 20 } }, NOW);
    expect(v.stale).toBe(true);
    if (v.stale) expect(v.exchange).toBe('nse');
  });

  it('says NOTHING when both are moving', () => {
    const v = feedHealth({ nse: { at: agoIso(1), sh: 10 }, bse: { at: agoIso(3), sh: 20 } }, NOW);
    expect(v).toEqual({ stale: false, reason: 'both-moving' });
  });

  it('says NOTHING when both are quiet — a still market and a double outage look identical', () => {
    const v = feedHealth({ nse: { at: agoIso(45), sh: 10 }, bse: { at: agoIso(50), sh: 20 } }, NOW);
    expect(v).toEqual({ stale: false, reason: 'both-quiet' });
  });

  it('says nothing for a single-exchange issue — there is no sibling to compare against', () => {
    expect(feedHealth({ nse: { at: agoIso(90), sh: 10 } }, NOW))
      .toEqual({ stale: false, reason: 'one-exchange-only' });
    expect(feedHealth({ bse: { at: agoIso(90), sh: 10 } }, NOW))
      .toEqual({ stale: false, reason: 'one-exchange-only' });
  });

  it('says nothing before either feed has reported', () => {
    expect(feedHealth({}, NOW)).toEqual({ stale: false, reason: 'nothing-seen' });
  });

  it('does NOT fire on an exchange that has simply not answered yet', () => {
    /* First minutes of a bidding day: NSE in, BSE not yet. That is one feed
       being quicker than the other, not a fault. */
    const v = feedHealth({ nse: { at: agoIso(1), sh: 10 } }, NOW);
    expect(v.stale).toBe(false);
  });

  it('leaves a gap between the thresholds so a feed cannot flap', () => {
    /* Sibling fresh, subject sitting BETWEEN the two thresholds: no alert
       either way until it convincingly crosses. */
    const between = Math.floor((FEED_FRESH_MIN + FEED_STALE_MIN) / 2);
    expect(FEED_STALE_MIN).toBeGreaterThan(FEED_FRESH_MIN);
    const v = feedHealth({ nse: { at: agoIso(1), sh: 10 }, bse: { at: agoIso(between), sh: 20 } }, NOW);
    expect(v.stale).toBe(false);
  });

  it('needs the live side to be CONVINCINGLY live, not merely livelier', () => {
    /* Both old, one older. Without the FRESH gate this would report the older
       one as stale every time the market went quiet. */
    const v = feedHealth({ nse: { at: agoIso(30), sh: 10 }, bse: { at: agoIso(120), sh: 20 } }, NOW);
    expect(v).toEqual({ stale: false, reason: 'both-quiet' });
  });

  it('treats an unparseable timestamp as infinitely old rather than as fresh', () => {
    const v = feedHealth({ nse: { at: agoIso(1), sh: 10 }, bse: { at: 'not-a-date', sh: 20 } }, NOW);
    expect(v.stale).toBe(true);
    if (v.stale) expect(v.exchange).toBe('bse');
  });
});

describe('noteFeedReading — what counts as a change', () => {
  const iso = new Date(NOW).toISOString();

  it('records the first reading', () => {
    expect(noteFeedReading(undefined, 500, iso)).toEqual({ at: iso, sh: 500 });
  });

  it('does NOT advance the timestamp when the figure is unchanged — the whole point', () => {
    const prev = { at: agoIso(30), sh: 500 };
    expect(noteFeedReading(prev, 500, iso)).toBe(prev);
  });

  it('advances on a real change', () => {
    expect(noteFeedReading({ at: agoIso(30), sh: 500 }, 650, iso)).toEqual({ at: iso, sh: 650 });
  });

  it('advances on a DOWNWARD revision — exchanges do revise, and a detector that only took increases would miss a feed gone wrong', () => {
    expect(noteFeedReading({ at: agoIso(30), sh: 500 }, 400, iso)).toEqual({ at: iso, sh: 400 });
  });

  it('IGNORES an empty read rather than treating it as a change to zero', () => {
    /* BSE returned a completely empty response mid-incident and was back to
       its frozen figures a minute later. Counting that as a change would have
       stamped the feed fresh at its least trustworthy moment; counting it as
       zero would have destroyed the baseline. */
    const prev = { at: agoIso(30), sh: 500 };
    expect(noteFeedReading(prev, 0, iso)).toBe(prev);
    expect(noteFeedReading(prev, Number.NaN, iso)).toBe(prev);
  });

  it('stays undefined when an empty read is all there has ever been', () => {
    expect(noteFeedReading(undefined, 0, iso)).toBeUndefined();
  });
});
