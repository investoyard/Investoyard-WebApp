/**
 * The status colour contract.
 *
 * Pinned explicitly rather than derived from STAGE_TONE, so that changing a
 * status's colour has to be a deliberate edit to a test that says what the
 * colour MEANS — not a silent side effect. The whole point of this map is that
 * six surfaces had drifted apart on exactly these values.
 */
import { STAGE_TONE, toneOf, stageOf, type Stage } from './stage';

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

describe('STAGE_TONE', () => {
  it('assigns every stage exactly one tone', () => {
    expect(STAGE_TONE).toEqual({
      opentoday: 'live',
      live: 'live',
      closingtoday: 'urgent',
      allotmentout: 'urgent',
      preapply: 'soon',
      upcoming: 'soon',
      listed: 'listed',
      awaiting: 'quiet',
      withdrawn: 'quiet',
    });
  });

  it('covers every stage the engine can produce — no stage falls through undefined', () => {
    const stages: Stage[] = [
      'closingtoday', 'opentoday', 'live', 'preapply', 'upcoming',
      'awaiting', 'allotmentout', 'listed', 'withdrawn',
    ];
    for (const s of stages) expect(STAGE_TONE[s]).toBeDefined();
    expect(Object.keys(STAGE_TONE).sort()).toEqual([...stages].sort());
  });

  it('reserves gold for the two states that need the investor TODAY', () => {
    const urgent = Object.entries(STAGE_TONE).filter(([, t]) => t === 'urgent').map(([s]) => s);
    expect(urgent.sort()).toEqual(['allotmentout', 'closingtoday']);
  });

  it('never paints an upcoming issue with the urgent tone', () => {
    // the original defect: gold meant Closing Today on a card and Upcoming in
    // the filter bar, on the same screen
    expect(STAGE_TONE.upcoming).not.toBe('urgent');
    expect(STAGE_TONE.upcoming).toBe(STAGE_TONE.preapply);
  });
});

describe('toneOf', () => {
  it('reads the tone straight off a live record', () => {
    expect(toneOf({ status: 'open', closeDate: today() })).toBe('urgent');
    expect(toneOf({ status: 'open', openDate: today() })).toBe('live');
    expect(toneOf({ status: 'listed' })).toBe('listed');
    expect(toneOf({ status: 'withdrawn' })).toBe('quiet');
  });

  it('agrees with stageOf for every input', () => {
    const cases = [
      { status: 'open', closeDate: today() },
      { status: 'open', openDate: today() },
      { status: 'open' },
      { status: 'closed', allotmentDate: today() },
      { status: 'closed' },
      { status: 'listed' },
      { status: 'withdrawn' },
      { status: 'upcoming' },
      { status: 'upcoming', extra: { startBid: true } },
    ];
    for (const c of cases) expect(toneOf(c)).toBe(STAGE_TONE[stageOf(c)]);
  });
});
