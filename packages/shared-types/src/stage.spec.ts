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
      closingtoday: 'closing',
      preapply: 'preapply',
      upcoming: 'upcoming',
      awaiting: 'awaiting',
      allotmentout: 'allotment',
      listed: 'listed',
      withdrawn: 'closing',
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

  it('gives every status its own colour, bar the two families', () => {
    // A colour code, not a mood. Exactly two groups share: Open Today IS Live
    // on day one, and Closing Today / Closed / Withdrawn are one event at
    // different moments. Everything else owns its colour outright, and the
    // card separates states inside a family with a solid fill.
    const byTone: Record<string, string[]> = {};
    for (const [stage, tone] of Object.entries(STAGE_TONE)) (byTone[tone] ??= []).push(stage);
    const shared = Object.entries(byTone).filter(([, stages]) => stages.length > 1);
    expect(shared).toEqual([
      ['live', ['opentoday', 'live']],
      ['closing', ['closingtoday', 'withdrawn']],
    ]);
  });

  it('paints Closing and Closed the same — they are the same event', () => {
    expect(STAGE_TONE.withdrawn).toBe(STAGE_TONE.closingtoday);
  });

  it('never lets Closing Today and Allotment Out share a colour', () => {
    // the defect that survived two rounds: both were 'urgent' gold, so the
    // Today row showed two different statuses in the same swatch
    expect(STAGE_TONE.closingtoday).not.toBe(STAGE_TONE.allotmentout);
  });

  it('keeps the four Today-row events visually distinct', () => {
    // Open · Closing · Allotment · Listing sit side by side in one row
    const row = [STAGE_TONE.live, STAGE_TONE.closingtoday, STAGE_TONE.allotmentout, STAGE_TONE.listed];
    expect(new Set(row).size).toBe(4);
  });

  it('never paints an upcoming issue with the closing colour', () => {
    // the first defect sir reported: gold meant Closing Today on a card and
    // Upcoming in the filter bar, on the same screen
    expect(STAGE_TONE.upcoming).not.toBe(STAGE_TONE.closingtoday);
  });
});

describe('toneOf', () => {
  it('reads the tone straight off a live record', () => {
    expect(toneOf({ status: 'open', closeDate: today() })).toBe('closing');
    expect(toneOf({ status: 'open', openDate: today() })).toBe('live');
    expect(toneOf({ status: 'listed' })).toBe('listed');
    expect(toneOf({ status: 'withdrawn' })).toBe('closing');
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
