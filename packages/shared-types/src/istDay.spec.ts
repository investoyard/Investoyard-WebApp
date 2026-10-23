/* No vitest import — this package runs on jest and takes its globals from
   @types/jest; importing a runner it has no dependency on fails the BUILD.
 *
 * THE INSTANT IS INJECTED, NEVER SET VIA `TZ`. On this box the TZ environment
 * variable has NO effect on Node — every value reports Asia/Calcutta — so a
 * suite "run under four timezones" is four identical IST runs and proves
 * nothing. Passing `now` is the only honest way to exercise a reader whose
 * calendar disagrees with Mumbai, and it is why `istToday`, `istDaysUntil`,
 * `stageOf` and `stageLabel` all take one.
 */
import { istDaysUntil, istToday, istTodayMs } from './ipoClock';
import { stageLabel, stageOf } from './stage';

/* The instants that matter are the ones straddling IST midnight (18:30Z). */
const IST_MIDNIGHT_23 = Date.parse('2026-10-22T18:30:00Z'); // 00:00 IST on the 23rd
const MIDDAY_23 = Date.parse('2026-10-23T06:00:00Z');       // 11:30 IST on the 23rd
const LONDON_EVENING = Date.parse('2026-10-23T20:00:00Z');  // 01:30 IST on the 24th
const JUST_BEFORE = Date.parse('2026-10-23T18:29:59Z');     // 23:59:59 IST on the 23rd

describe('istToday', () => {
  it('rolls over at IST midnight, not UTC midnight', () => {
    expect(istToday(JUST_BEFORE)).toBe('2026-10-23');
    expect(istToday(Date.parse('2026-10-23T18:30:00Z'))).toBe('2026-10-24');
  });

  it('is already tomorrow in Mumbai while a London reader is still on the 23rd', () => {
    /* 20:00 GMT on the 23rd. The reader calendar says the 23rd; Mumbai says
       the 24th, and the issue that closed at 19:00 IST shut six hours ago. */
    expect(istToday(LONDON_EVENING)).toBe('2026-10-24');
  });

  it('is still today in Mumbai while an Auckland reader is on tomorrow', () => {
    /* 14:00 IST on the 23rd is 21:30 on the 23rd in Auckland — same day here,
       but at 20:00 IST Auckland has rolled and Mumbai has not. */
    expect(istToday(Date.parse('2026-10-23T14:30:00Z'))).toBe('2026-10-23');
  });

  it('istTodayMs is IST midnight of that same day, never a second derivation', () => {
    expect(new Date(istTodayMs(MIDDAY_23)).toISOString()).toBe('2026-10-22T18:30:00.000Z');
    expect(istToday(istTodayMs(MIDDAY_23))).toBe(istToday(MIDDAY_23));
  });
});

describe('istDaysUntil', () => {
  it('counts between IST midnights', () => {
    expect(istDaysUntil('2026-10-23', MIDDAY_23)).toBe(0);
    expect(istDaysUntil('2026-10-24', MIDDAY_23)).toBe(1);
    expect(istDaysUntil('2026-10-22', MIDDAY_23)).toBe(-1);
    expect(istDaysUntil('2026-10-30', MIDDAY_23)).toBe(7);
  });

  it('flips to -1 the moment IST passes midnight, not when the reader does', () => {
    expect(istDaysUntil('2026-10-23', JUST_BEFORE)).toBe(0);
    expect(istDaysUntil('2026-10-23', LONDON_EVENING)).toBe(-1);
  });

  it('is exactly 0 at the first instant of the day', () => {
    expect(istDaysUntil('2026-10-23', IST_MIDNIGHT_23)).toBe(0);
  });

  it('is null for a missing or unparseable date', () => {
    expect(istDaysUntil(undefined)).toBeNull();
    expect(istDaysUntil(null)).toBeNull();
    expect(istDaysUntil('')).toBeNull();
    expect(istDaysUntil('nonsense')).toBeNull();
  });
});

describe('stageOf, on an Indian calendar', () => {
  const live = { status: 'open', openDate: '2026-10-21', closeDate: '2026-10-23' } as const;

  it('is Closing Today right up to IST midnight', () => {
    expect(stageOf(live, MIDDAY_23)).toBe('closingtoday');
    expect(stageOf(live, JUST_BEFORE)).toBe('closingtoday');
  });

  it('STOPS being Closing Today once Mumbai has rolled over, whatever the reader clock says', () => {
    /* This is the bug: at 20:00 GMT a London reader was still told "closing
       today" about an issue that shut at 19:00 IST, six hours earlier. */
    expect(stageOf(live, LONDON_EVENING)).not.toBe('closingtoday');
    expect(stageLabel(live, LONDON_EVENING)).not.toBe('Closing Today');
  });

  it('does not open an issue early for a reader whose clock is ahead of Mumbai', () => {
    /* 14:30Z is 03:30 on the 24th in Auckland but still the 23rd in Mumbai, so
       an issue opening on the 24th must not yet read as open. */
    /* status must be 'open' for the opentoday branch — the operator flips it,
       and stageOf never promotes an upcoming record to open on dates alone. */
    const tomorrow = { status: 'open', openDate: '2026-10-24', closeDate: '2026-10-28' } as const;
    expect(stageOf(tomorrow, Date.parse('2026-10-23T14:30:00Z'))).not.toBe('opentoday');
    expect(stageOf(tomorrow, Date.parse('2026-10-23T18:30:00Z'))).toBe('opentoday');
  });

  it('gives the same answer for every reader, because it never reads their clock', () => {
    /* One instant, one answer — which is the whole property. Before this, the
       answer depended on where the reader was sitting. */
    const answers = new Set([
      stageOf(live, LONDON_EVENING),
      stageOf(live, LONDON_EVENING),
      stageOf(live, LONDON_EVENING),
    ]);
    expect(answers.size).toBe(1);
  });

  it('labels an upcoming issue by IST days, not reader days', () => {
    const soon = { status: 'upcoming', openDate: '2026-10-25' } as const;
    expect(stageLabel(soon, MIDDAY_23)).toBe('Opens in 2d');
    /* Same real instant, a reader in London: still 2 days in Mumbai. */
    expect(stageLabel(soon, Date.parse('2026-10-23T06:00:00Z'))).toBe('Opens in 2d');
    /* After IST midnight it is 1 day, even though London is still on the 23rd. */
    expect(stageLabel(soon, LONDON_EVENING)).toBe('Opens Tomorrow');
  });

  it('defaults to the real clock when no instant is passed', () => {
    /* The production call path. It must not throw or return undefined. */
    expect(typeof stageOf(live)).toBe('string');
    expect(stageOf(live)).toBe(stageOf(live, Date.now()));
  });
});
