/* No vitest import — this package runs on jest and takes its globals from
   @types/jest; importing a runner it has no dependency on fails the BUILD. */
import { DEFAULT_CLOSE_TIME, DEFAULT_OPEN_TIME, closeAt, milestoneAt, openAt } from './ipoClock';

/* JPL is the record this was written for: the operator corrected its close to
   19:00 in the IPO form, which lands in `extra.closeDate`, while the column
   stays date-only. Every render site appended a hardcoded 17:00. */
const JPL = {
  openDate: '2026-10-21',
  closeDate: '2026-10-23',
  extra: { openDate: '2026-10-21T10:00', closeDate: '2026-10-23T19:00' },
};

const hhmm = (ms: number | null) => {
  if (ms == null) return null;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const ymd = (ms: number | null) => {
  if (ms == null) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('closeAt', () => {
  it("takes the operator's hour — this is the bug it exists for", () => {
    expect(hhmm(closeAt(JPL))).toBe('19:00');
    expect(ymd(closeAt(JPL))).toBe('2026-10-23');
  });

  it('falls back to 17:00 when the record carries no time', () => {
    expect(hhmm(closeAt({ closeDate: '2026-10-29' }))).toBe('17:00');
    expect(hhmm(closeAt({ closeDate: '2026-10-29', extra: {} }))).toBe('17:00');
    expect(hhmm(closeAt({ closeDate: '2026-10-29', extra: { closeDate: '2026-10-29' } }))).toBe('17:00');
  });

  it('IGNORES a time whose DAY disagrees with the column', () => {
    /* Every other derivation reads the column; honouring the hour off a
       different date would point the countdown at a day nothing else believes
       in. 111 of 111 records agreed when this was written — the guard is for
       the divergence that has not happened yet. */
    const drifted = { closeDate: '2026-10-23', extra: { closeDate: '2026-10-30T19:00' } };
    expect(hhmm(closeAt(drifted))).toBe('17:00');
    expect(ymd(closeAt(drifted))).toBe('2026-10-23');
  });

  it('ignores a malformed or out-of-range time rather than producing NaN', () => {
    for (const bad of ['2026-10-23T25:00', '2026-10-23T7:00', '2026-10-23Txx:yy', '2026-10-23 19:00', '2026-10-23T19', 19 as unknown]) {
      expect(hhmm(closeAt({ closeDate: '2026-10-23', extra: { closeDate: bad } }))).toBe('17:00');
    }
  });

  it('keeps a real non-default hour that is not 17:00', () => {
    /* Three records close at 16:00 and one at 17:33 — both are legitimate. */
    expect(hhmm(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T16:00' } }))).toBe('16:00');
    expect(hhmm(closeAt({ closeDate: '2026-10-05', extra: { closeDate: '2026-10-05T17:33' } }))).toBe('17:33');
  });

  it('is null when there is no close date at all', () => {
    expect(closeAt({})).toBeNull();
    expect(closeAt({ closeDate: null })).toBeNull();
    expect(closeAt({ closeDate: 'not-a-date' })).toBeNull();
  });

  it('reads a column that carries its own time, ignoring the time part', () => {
    /* The column is pinned to UTC midnight but a serializer could hand back an
       ISO string; only its DAY should matter. */
    expect(ymd(closeAt({ closeDate: '2026-10-23T00:00:00.000Z', extra: { closeDate: '2026-10-23T19:00' } }))).toBe('2026-10-23');
    expect(hhmm(closeAt({ closeDate: '2026-10-23T00:00:00.000Z', extra: { closeDate: '2026-10-23T19:00' } }))).toBe('19:00');
  });
});

describe('openAt', () => {
  it('defaults to 10:00, not to the close hour', () => {
    expect(hhmm(openAt({ openDate: '2026-10-21' }))).toBe('10:00');
    expect(DEFAULT_OPEN_TIME).toBe('10:00');
    expect(DEFAULT_CLOSE_TIME).toBe('17:00');
  });

  it("takes the operator's hour when there is one", () => {
    expect(hhmm(openAt({ openDate: '2026-10-21', extra: { openDate: '2026-10-21T09:00' } }))).toBe('09:00');
  });

  it('does not read the close time for the open, or the other way round', () => {
    const x = { openDate: '2026-10-21', closeDate: '2026-10-23', extra: { closeDate: '2026-10-23T19:00' } };
    expect(hhmm(openAt(x))).toBe('10:00');
    expect(hhmm(closeAt(x))).toBe('19:00');
  });

  it('is null with no open date', () => {
    expect(openAt({})).toBeNull();
  });
});

describe('milestoneAt', () => {
  it('takes the hour from the caller, because allotment and listing have no convention', () => {
    expect(hhmm(milestoneAt('2026-10-27', '10:00'))).toBe('10:00');
    expect(hhmm(milestoneAt('2026-10-27'))).toBe('17:00');
  });

  it('is null for a missing or unparseable date', () => {
    expect(milestoneAt(undefined)).toBeNull();
    expect(milestoneAt(null)).toBeNull();
    expect(milestoneAt('')).toBeNull();
  });
});
