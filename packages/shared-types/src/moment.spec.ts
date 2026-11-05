import {
  ACTION_MOMENTS,
  LISTING_TIME,
  MOMENT_PRIORITY,
  momentKindFor,
  momentPlan,
  momentRank,
  requiresApplication,
  type MomentIpo,
} from './moment';

/* JEST, not vitest — this package declares "test": "jest" with @types/jest and
   has no vitest dependency. A spec importing vitest passes under `npx vitest`
   and FAILS `npm run build`, because tsconfig compiles the specs too. */

/* Every assertion is against an ABSOLUTE INSTANT, which is the only kind that
   cannot be faked by the environment. `TZ` has no effect on Node on this box —
   every value reports Asia/Calcutta — so a suite "run under four timezones" is
   four identical IST runs. Injecting `now` is the honest way. */

/** 2026-11-05, 11:00 IST = 05:30Z. A Thursday, mid-morning. */
const NOV5_11AM = Date.parse('2026-11-05T05:30:00.000Z');
/** 2026-11-05, 20:30 IST = 15:00Z — the same IST day, well into the evening. */
const NOV5_EVENING = Date.parse('2026-11-05T15:00:00.000Z');

const ipo = (over: Partial<MomentIpo> & { symbol: string }): MomentIpo => ({
  status: 'upcoming',
  ...over,
});

const OPEN_TODAY = ipo({
  symbol: 'ALPHA',
  name: 'Alpha Industries Limited',
  status: 'open',
  openDate: '2026-11-05',
  closeDate: '2026-11-07',
});

const CLOSING_TODAY = ipo({
  symbol: 'BRAVO',
  status: 'open',
  openDate: '2026-11-03',
  closeDate: '2026-11-05',
});

const ALLOTMENT_TODAY = ipo({
  symbol: 'CHARLIE',
  status: 'closed',
  openDate: '2026-10-28',
  closeDate: '2026-10-30',
  allotmentDate: '2026-11-05',
});

const LISTING_TODAY = ipo({
  symbol: 'DELTA',
  status: 'listed',
  openDate: '2026-10-26',
  closeDate: '2026-10-28',
  allotmentDate: '2026-10-31',
  listingDate: '2026-11-05',
});

describe('momentKindFor', () => {
  it('reads the four live stages as their own Moment', () => {
    expect(momentKindFor(OPEN_TODAY, false, NOV5_11AM)).toBe('open');
    expect(momentKindFor(CLOSING_TODAY, false, NOV5_11AM)).toBe('closing');
    expect(momentKindFor(ALLOTMENT_TODAY, true, NOV5_11AM)).toBe('allotment');
    expect(momentKindFor(LISTING_TODAY, true, NOV5_11AM)).toBe('listing');
  });

  it('is quiet between close and allotment — waiting is not a Moment', () => {
    const awaiting = ipo({
      symbol: 'ECHO',
      status: 'closed',
      closeDate: '2026-11-03',
      allotmentDate: '2026-11-09',
    });
    expect(momentKindFor(awaiting, true, NOV5_11AM)).toBe('quiet');
  });

  it('is quiet for an issue that has not opened', () => {
    const soon = ipo({ symbol: 'FOX', openDate: '2026-11-12', closeDate: '2026-11-14' });
    expect(momentKindFor(soon, false, NOV5_11AM)).toBe('quiet');
  });

  /* A RESULT MOMENT IS ABOUT THE FAMILY'S OWN MONEY. */
  it('withholds BOTH result Moments from a family that did not apply', () => {
    expect(momentKindFor(ALLOTMENT_TODAY, false, NOV5_11AM)).toBe('quiet');
    expect(momentKindFor(LISTING_TODAY, false, NOV5_11AM)).toBe('quiet');
  });

  it('still shows an ACTION Moment to a family that has not applied — that is the point of it', () => {
    expect(momentKindFor(CLOSING_TODAY, false, NOV5_11AM)).toBe('closing');
    expect(momentKindFor(OPEN_TODAY, false, NOV5_11AM)).toBe('open');
  });

  it('gates on an APPLICATION, never on an allotment — the family that missed is the curious one', () => {
    expect(requiresApplication('listing')).toBe(true);
    expect(requiresApplication('allotment')).toBe(true);
    expect(requiresApplication('closing')).toBe(false);
    expect(requiresApplication('open')).toBe(false);
  });

  /* TODAY ONLY, or every issue the family ever applied to queues up. */
  it('drops a result Moment the day after, however recent', () => {
    const yesterday = ipo({ ...ALLOTMENT_TODAY, allotmentDate: '2026-11-04' });
    expect(momentKindFor(yesterday, true, NOV5_11AM)).toBe('quiet');

    const listedYesterday = ipo({ ...LISTING_TODAY, listingDate: '2026-11-04' });
    expect(momentKindFor(listedYesterday, true, NOV5_11AM)).toBe('quiet');
  });

  it('holds an allotment Moment all the way to IST midnight — it is an EVENING', () => {
    expect(momentKindFor(ALLOTMENT_TODAY, true, NOV5_EVENING)).toBe('allotment');
  });

  it('reads the day in IST, not on the reader clock', () => {
    /* 2026-11-05 20:30 IST is still the 5th in Mumbai and already the 6th in
       Auckland. A reader there was being told an allotment had not happened. */
    expect(momentKindFor(ALLOTMENT_TODAY, true, NOV5_EVENING)).toBe('allotment');
    /* And 19:00Z on the 5th (00:30 IST on the 6th) is a different IST day. */
    const pastIstMidnight = Date.parse('2026-11-05T19:00:00.000Z');
    expect(momentKindFor(ALLOTMENT_TODAY, true, pastIstMidnight)).toBe('quiet');
  });

  it('accepts a full datetime in the date fields, as the operator stores', () => {
    const withHour = ipo({ ...LISTING_TODAY, listingDate: '2026-11-05T10:00' });
    expect(momentKindFor(withHour, true, NOV5_11AM)).toBe('listing');
  });
});

describe('momentPlan priority', () => {
  it('gives the hero to LISTING over closing — the one clash the design states', () => {
    const plan = momentPlan([CLOSING_TODAY, LISTING_TODAY], ['DELTA'], NOV5_11AM);
    expect(plan.kind).toBe('listing');
    expect(plan.hero?.symbol).toBe('DELTA');
  });

  it('never hides the losing Moment — it goes in the clash card', () => {
    const plan = momentPlan([CLOSING_TODAY, LISTING_TODAY], ['DELTA'], NOV5_11AM);
    expect(plan.also?.kind).toBe('closing');
    expect(plan.also?.symbol).toBe('BRAVO');
  });

  /* THE REASON `also` IS NOT JUST all[1]. */
  it('puts the ACTION in the clash card, not a second result', () => {
    const plan = momentPlan(
      [LISTING_TODAY, ALLOTMENT_TODAY, CLOSING_TODAY],
      ['DELTA', 'CHARLIE'],
      NOV5_11AM,
    );
    expect(plan.hero?.kind).toBe('listing');
    /* By rank alone this would be the allotment, and the only deadline on the
       day would have fallen off the screen. */
    expect(plan.all[1].kind).toBe('allotment');
    expect(plan.also?.kind).toBe('closing');
  });

  it('falls back to any differing kind when the day holds no action at all', () => {
    const plan = momentPlan([LISTING_TODAY, ALLOTMENT_TODAY], ['DELTA', 'CHARLIE'], NOV5_11AM);
    expect(plan.hero?.kind).toBe('listing');
    expect(plan.also?.kind).toBe('allotment');
  });

  it('leaves the clash card empty when every candidate is the same kind', () => {
    const second = ipo({ ...CLOSING_TODAY, symbol: 'ZULU' });
    const plan = momentPlan([CLOSING_TODAY, second], [], NOV5_11AM);
    expect(plan.hero?.kind).toBe('closing');
    expect(plan.all).toHaveLength(2);
    expect(plan.also).toBeNull();
  });

  it('ranks closing above open — a deadline today beats one with days left', () => {
    const plan = momentPlan([OPEN_TODAY, CLOSING_TODAY], [], NOV5_11AM);
    expect(plan.hero?.symbol).toBe('BRAVO');
    expect(plan.also?.symbol).toBe('ALPHA');
  });

  it('keeps MOMENT_PRIORITY and the rank map in step', () => {
    const ranks = MOMENT_PRIORITY.map(momentRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(MOMENT_PRIORITY.length);
  });

  it('breaks a tie on SYMBOL, so the same day cannot render two ways', () => {
    const a = ipo({ ...CLOSING_TODAY, symbol: 'SWASTIKAIN' });
    const b = ipo({ ...CLOSING_TODAY, symbol: 'ELEVATE' });
    expect(momentPlan([a, b], [], NOV5_11AM).hero?.symbol).toBe('ELEVATE');
    expect(momentPlan([b, a], [], NOV5_11AM).hero?.symbol).toBe('ELEVATE');
  });

  it('puts the sooner deadline first within one kind', () => {
    const sooner = ipo({ ...CLOSING_TODAY, symbol: 'AAA', extra: { closeDate: '2026-11-05T13:00' } });
    const later = ipo({ ...CLOSING_TODAY, symbol: 'BBB', extra: { closeDate: '2026-11-05T19:00' } });
    const plan = momentPlan([later, sooner], [], NOV5_11AM);
    expect(plan.all.map((c) => c.symbol)).toEqual(['AAA', 'BBB']);
  });
});

describe('momentPlan clocks', () => {
  it("honours the operator's own close hour", () => {
    const late = ipo({ ...CLOSING_TODAY, extra: { closeDate: '2026-11-05T19:00' } });
    const plan = momentPlan([late], [], NOV5_11AM);
    expect(plan.hero?.at).toBe(Date.parse('2026-11-05T13:30:00.000Z'));
  });

  it('falls back to the 17:00 SEBI close when the record states no hour', () => {
    const plan = momentPlan([CLOSING_TODAY], [], NOV5_11AM);
    expect(plan.hero?.at).toBe(Date.parse('2026-11-05T11:30:00.000Z'));
  });

  it('counts a listing from the 10:00 market open', () => {
    const plan = momentPlan([LISTING_TODAY], ['DELTA'], NOV5_11AM);
    expect(LISTING_TIME).toBe('10:00');
    expect(plan.hero?.at).toBe(Date.parse('2026-11-05T04:30:00.000Z'));
  });

  /* INVENTED PRECISION ON THE MOMENT PEOPLE REFRESH HARDEST. */
  it('gives an allotment NO clock, because registrars publish when they publish', () => {
    const plan = momentPlan([ALLOTMENT_TODAY], ['CHARLIE'], NOV5_11AM);
    expect(plan.hero?.kind).toBe('allotment');
    expect(plan.hero?.at).toBeNull();
  });
});

describe('momentPlan on a quiet day', () => {
  it('reports quiet with no hero and no clash card', () => {
    const soon = ipo({ symbol: 'FOX', openDate: '2026-11-12', closeDate: '2026-11-14' });
    const plan = momentPlan([soon], [], NOV5_11AM);
    expect(plan.kind).toBe('quiet');
    expect(plan.hero).toBeNull();
    expect(plan.also).toBeNull();
    expect(plan.all).toEqual([]);
  });

  it('looks ahead to the SOONEST issue that opens next', () => {
    const later = ipo({ symbol: 'LATER', openDate: '2026-11-20' });
    const sooner = ipo({ symbol: 'SOONER', openDate: '2026-11-09' });
    const plan = momentPlan([later, sooner], [], NOV5_11AM);
    expect(plan.nextOpen?.symbol).toBe('SOONER');
    expect(plan.nextOpenAt).toBe(Date.parse('2026-11-09T04:30:00.000Z'));
  });

  it('counts a pre-apply issue as something to look ahead to', () => {
    const preapply = ipo({ symbol: 'PRE', openDate: '2026-11-09', extra: { startBid: true } });
    expect(momentPlan([preapply], [], NOV5_11AM).nextOpen?.symbol).toBe('PRE');
  });

  it('breaks a same-day tie on symbol', () => {
    const a = ipo({ symbol: 'ZULU', openDate: '2026-11-09' });
    const b = ipo({ symbol: 'ALPHA2', openDate: '2026-11-09' });
    expect(momentPlan([a, b], [], NOV5_11AM).nextOpen?.symbol).toBe('ALPHA2');
    expect(momentPlan([b, a], [], NOV5_11AM).nextOpen?.symbol).toBe('ALPHA2');
  });

  it('reports no next issue rather than guessing one', () => {
    const plan = momentPlan([LISTING_TODAY], ['DELTA'], NOV5_11AM);
    expect(plan.nextOpen).toBeNull();
    expect(plan.nextOpenAt).toBeNull();
  });

  it('computes nextOpen even on a busy day, so a hero can offer what is next', () => {
    const soon = ipo({ symbol: 'FOX', openDate: '2026-11-12' });
    const plan = momentPlan([CLOSING_TODAY, soon], [], NOV5_11AM);
    expect(plan.kind).toBe('closing');
    expect(plan.nextOpen?.symbol).toBe('FOX');
  });
});

describe('momentPlan inputs', () => {
  it('matches a symbol case-insensitively — a symbol is canonically upper case', () => {
    expect(momentPlan([LISTING_TODAY], ['delta'], NOV5_11AM).kind).toBe('listing');
    expect(momentPlan([LISTING_TODAY], ['  Delta  '], NOV5_11AM).kind).toBe('listing');
  });

  it('carries whether the family applied, on an action Moment too', () => {
    const cold = momentPlan([CLOSING_TODAY], [], NOV5_11AM);
    expect(cold.hero?.applied).toBe(false);
    const warm = momentPlan([CLOSING_TODAY], ['BRAVO'], NOV5_11AM);
    expect(warm.hero?.applied).toBe(true);
  });

  it('survives an empty catalogue and junk rows without throwing', () => {
    expect(momentPlan([], [], NOV5_11AM).kind).toBe('quiet');
    const junk = [
      null as unknown as MomentIpo,
      ipo({ symbol: '  ' }),
      CLOSING_TODAY,
    ];
    const plan = momentPlan(junk, ['', '  '], NOV5_11AM);
    expect(plan.all).toHaveLength(1);
    expect(plan.hero?.symbol).toBe('BRAVO');
  });

  it('names the action Moments, so a surface cannot form its own opinion', () => {
    expect([...ACTION_MOMENTS].sort()).toEqual(['closing', 'open']);
  });
});
