/* No vitest import — this package runs on jest and takes its globals from
   @types/jest; importing a runner it has no dependency on fails the BUILD.

   EVERY ASSERTION HERE IS AN ABSOLUTE INSTANT, never a local clock reading.
   The first version of this file compared `new Date(ms).getHours()` against
   "19:00", which passes on this box because this box is in IST — and would
   have gone on passing if the code read the reader's zone instead, which is
   the exact bug the IST pinning exists to fix. A test that only holds in one
   timezone cannot catch a timezone bug. */
import {
  DEFAULT_CLOSE_TIME, DEFAULT_OPEN_TIME, IST_OFFSET, IST_OFFSET_MIN,
  closeAt, istClock, milestoneAt, openAt,
} from './ipoClock';

/* JPL is the record this was written for: the operator corrected its close to
   19:00 in the IPO form, which lands in `extra.closeDate`, while the column
   stays date-only. Every render site appended a hardcoded hour. */
const JPL = {
  openDate: '2026-10-21',
  closeDate: '2026-10-23',
  extra: { openDate: '2026-10-21T10:00', closeDate: '2026-10-23T19:00' },
};

/** The instant a wall-clock time in IST actually is. */
const ist = (s: string) => Date.parse(`${s}+05:30`);

describe('IST pinning', () => {
  it('is a FIXED offset, which is exact because India has no DST', () => {
    expect(IST_OFFSET).toBe('+05:30');
    expect(IST_OFFSET_MIN).toBe(330);
  });

  it('resolves to the same instant whatever the reader timezone is', () => {
    /* The claim is about an INSTANT. 19:00 IST is 13:30 UTC, full stop. */
    expect(closeAt(JPL)).toBe(ist('2026-10-23T19:00:00'));
    expect(new Date(closeAt(JPL)!).toISOString()).toBe('2026-10-23T13:30:00.000Z');
  });

  it('puts the 17:00 default at 11:30 UTC, not at 17:00 UTC', () => {
    expect(new Date(closeAt({ closeDate: '2026-10-29' })!).toISOString()).toBe('2026-10-29T11:30:00.000Z');
  });

  it('puts the 10:00 open default at 04:30 UTC', () => {
    expect(new Date(openAt({ openDate: '2026-10-21' })!).toISOString()).toBe('2026-10-21T04:30:00.000Z');
  });
});

describe('closeAt', () => {
  it("takes the operator's hour — this is the bug it exists for", () => {
    expect(closeAt(JPL)).toBe(ist('2026-10-23T19:00:00'));
  });

  it('falls back to 17:00 IST when the record carries no time', () => {
    const want = ist('2026-10-29T17:00:00');
    expect(closeAt({ closeDate: '2026-10-29' })).toBe(want);
    expect(closeAt({ closeDate: '2026-10-29', extra: {} })).toBe(want);
    expect(closeAt({ closeDate: '2026-10-29', extra: { closeDate: '2026-10-29' } })).toBe(want);
  });

  it('IGNORES a time whose DAY disagrees with the column', () => {
    /* Every other derivation reads the column; honouring the hour off a
       different date would point the countdown at a day nothing else believes
       in. 111 of 111 records agreed when this was written — the guard is for
       the divergence that has not happened yet. */
    const drifted = { closeDate: '2026-10-23', extra: { closeDate: '2026-10-30T19:00' } };
    expect(closeAt(drifted)).toBe(ist('2026-10-23T17:00:00'));
  });

  it('ignores a malformed or out-of-range time rather than producing NaN', () => {
    const want = ist('2026-10-23T17:00:00');
    for (const bad of ['2026-10-23T25:00', '2026-10-23T7:00', '2026-10-23Txx:yy', '2026-10-23 19:00', '2026-10-23T19', 19 as unknown]) {
      expect(closeAt({ closeDate: '2026-10-23', extra: { closeDate: bad } })).toBe(want);
    }
  });

  it('keeps a real non-default hour that is not 17:00', () => {
    /* Three records close at 16:00 and one at 17:33 — both legitimate. */
    expect(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T16:00' } })).toBe(ist('2026-10-05T16:00:00'));
    expect(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T17:33' } })).toBe(ist('2026-10-05T17:33:00'));
  });

  it('is null when there is no close date at all', () => {
    expect(closeAt({})).toBeNull();
    expect(closeAt({ closeDate: null })).toBeNull();
    expect(closeAt({ closeDate: 'not-a-date' })).toBeNull();
  });

  it('reads a column that carries its own time, using only its DAY', () => {
    /* The column is pinned to UTC midnight but a serializer could hand back an
       ISO string; only the date part should matter. */
    const x = { closeDate: '2026-10-23T00:00:00.000Z', extra: { closeDate: '2026-10-23T19:00' } };
    expect(closeAt(x)).toBe(ist('2026-10-23T19:00:00'));
  });
});

describe('openAt', () => {
  it('defaults to 10:00 IST, not to the close hour', () => {
    expect(openAt({ openDate: '2026-10-21' })).toBe(ist('2026-10-21T10:00:00'));
    expect(DEFAULT_OPEN_TIME).toBe('10:00');
    expect(DEFAULT_CLOSE_TIME).toBe('17:00');
  });

  it("takes the operator's hour when there is one", () => {
    expect(openAt({ openDate: '2026-10-21', extra: { openDate: '2026-10-21T09:00' } })).toBe(ist('2026-10-21T09:00:00'));
  });

  it('does not read the close time for the open, or the other way round', () => {
    const x = { openDate: '2026-10-21', closeDate: '2026-10-23', extra: { closeDate: '2026-10-23T19:00' } };
    expect(openAt(x)).toBe(ist('2026-10-21T10:00:00'));
    expect(closeAt(x)).toBe(ist('2026-10-23T19:00:00'));
  });

  it('is null with no open date', () => {
    expect(openAt({})).toBeNull();
  });
});

describe('istClock', () => {
  it('reads the IST wall clock, not the reader clock', () => {
    /* 13:30 UTC IS 19:00 in Mumbai. A London reader must be told 7 pm, which
       is what the exchange and every other source say. */
    expect(istClock(Date.parse('2026-10-23T13:30:00.000Z'))).toBe('7 pm');
    expect(istClock(closeAt(JPL))).toBe('7 pm');
  });

  it('renders the common hours the catalogue actually uses', () => {
    expect(istClock(closeAt({ closeDate: '2026-10-29' }))).toBe('5 pm');
    expect(istClock(openAt({ openDate: '2026-10-29' }))).toBe('10 am');
    expect(istClock(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T16:00' } }))).toBe('4 pm');
  });

  it('shows minutes only when there are any', () => {
    expect(istClock(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T17:33' } }))).toBe('5:33 pm');
    expect(istClock(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T17:00' } }))).toBe('5 pm');
  });

  it('gets midday and midnight right rather than printing 0', () => {
    expect(istClock(ist('2026-10-23T12:00:00'))).toBe('12 pm');
    expect(istClock(ist('2026-10-23T00:00:00'))).toBe('12 am');
    expect(istClock(ist('2026-10-23T00:05:00'))).toBe('12:05 am');
  });

  it('is null for nothing, rather than a clock reading for the epoch', () => {
    expect(istClock(null)).toBeNull();
    expect(istClock(Number.NaN)).toBeNull();
  });
});

describe('milestoneAt', () => {
  it('takes the hour from the caller, because allotment and listing have no convention', () => {
    expect(milestoneAt('2026-10-27', '10:00')).toBe(ist('2026-10-27T10:00:00'));
    expect(milestoneAt('2026-10-27')).toBe(ist('2026-10-27T17:00:00'));
  });

  it('is null for a missing or unparseable date', () => {
    expect(milestoneAt(undefined)).toBeNull();
    expect(milestoneAt(null)).toBeNull();
    expect(milestoneAt('')).toBeNull();
  });
});
