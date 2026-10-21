import {
  DEFAULT_POLL_FROM_MIN, DEFAULT_POLL_TO_MIN,
  POLL_ENVELOPE_FROM_MIN, POLL_ENVELOPE_TO_MIN,
  pollTimeToHhmm, pollHhmmToMin, pollMinute, pollWindowProblem,
} from './pollWindow';

describe('the stored unit never reaches a form box', () => {
  it('round-trips the real values', () => {
    // JPL is the only record carrying an override: 09:00 -> 20:00.
    expect(pollTimeToHhmm(540)).toBe('09:00');
    expect(pollTimeToHhmm(1200)).toBe('20:00');
    expect(pollHhmmToMin('09:00')).toBe(540);
    expect(pollHhmmToMin('20:00')).toBe(1200);
    for (const m of [DEFAULT_POLL_FROM_MIN, DEFAULT_POLL_TO_MIN, POLL_ENVELOPE_FROM_MIN, POLL_ENVELOPE_TO_MIN]) {
      expect(pollHhmmToMin(pollTimeToHhmm(m))).toBe(m);
    }
  });

  it('pads both halves, so the control is never handed an invalid value', () => {
    // A `time` input rejects `9:5` and renders EMPTY, which reads as "the
    // operator never set this" over a value that is set. Same class as the
    // card parser writing a bare date into a datetime-local.
    expect(pollTimeToHhmm(545)).toBe('09:05');
    expect(pollTimeToHhmm(60)).toBe('01:00');
  });

  it('A BLANK BOX IS NULL, NEVER ZERO', () => {
    // The caller deletes the stored key on null. Zero would be written as a
    // value, and a key present and falsy reads as SET to anything testing for
    // presence — the trailing-"" fault mergeContentPatch exists to avoid.
    expect(pollHhmmToMin('')).toBeNull();
    expect(pollHhmmToMin(undefined)).toBeNull();
    expect(pollHhmmToMin('  ')).toBeNull();
    expect(pollHhmmToMin('garbage')).toBeNull();
    expect(pollHhmmToMin('25:00')).toBeNull();
    expect(pollHhmmToMin('09:70')).toBeNull();
    // Midnight is not a usable window edge and the poller rejects it too
    // (`pollMinute` requires > 0), so the two agree on it.
    expect(pollHhmmToMin('00:00')).toBeNull();
  });

  it('refuses a stored value the poller would refuse', () => {
    // This IS the poller's test — `windowFor` imports it rather than keeping a
    // copy, which is the only thing that stops the form explaining a rule the
    // API does not apply.
    expect(pollMinute(540, 99)).toBe(540);
    expect(pollMinute(1440, 99)).toBe(1440);
    expect(pollMinute(0, 99)).toBe(99);
    expect(pollMinute(-1, 99)).toBe(99);
    expect(pollMinute(1441, 99)).toBe(99);
    expect(pollMinute('', 99)).toBe(99);
    expect(pollMinute(null, 99)).toBe(99);
    expect(pollMinute('nope', 99)).toBe(99);
    // A STRING survives, because that is what a form posts and what several
    // `extra` keys already hold.
    expect(pollMinute('540', 99)).toBe(540);
  });
});

describe('pollWindowProblem', () => {
  it('passes the one override in the catalogue', () => {
    expect(pollWindowProblem(540, 1200)).toBeNull();      // JPL, 09:00-20:00
    expect(pollWindowProblem(DEFAULT_POLL_FROM_MIN, DEFAULT_POLL_TO_MIN)).toBeNull();
  });

  it('says nothing when nothing is set', () => {
    expect(pollWindowProblem(null, null)).toBeNull();
  });

  it('A HALF-SET WINDOW IS LEGITIMATE, not an error', () => {
    // `windowFor` falls each end back to the global independently, so "poll
    // until 20:00, start at the usual time" is a real thing to want.
    expect(pollWindowProblem(null, 1200)).toBeNull();
    expect(pollWindowProblem(540, null)).toBeNull();
  });

  it('catches an inverted window, which the poller discards WHOLE', () => {
    const p = pollWindowProblem(1200, 540);
    expect(p?.code).toBe('inverted');
    // The message has to say that BOTH boxes stop working, not just that the
    // order is wrong: windowFor returns the global pair, it does not swap them.
    expect(p?.message).toContain('20:00');
    expect(p?.message).toContain('09:00');
    expect(p?.message).toContain('global');
    // Equal ends are inverted too — `toMin <= fromMin` is the poller's test.
    expect(pollWindowProblem(600, 600)?.code).toBe('inverted');
  });

  it('INVERTED ONLY FIRES WHEN BOTH ARE SET', () => {
    // With one end blank the effective pair depends on the tenant's configured
    // global, which this form has not read. Claiming to know it would be worse
    // than staying quiet: a false warning on a correct entry is how a banner
    // gets trained into background noise.
    expect(pollWindowProblem(null, 480)).toBeNull();
  });

  it('catches a window the envelope would silently ignore', () => {
    // 06:00 is accepted by the override and then never acted on, because the
    // 10s tick rules out the hour before it ever reads an issue.
    const early = pollWindowProblem(6 * 60, 1200);
    expect(early?.code).toBe('outside-envelope');
    expect(early?.message).toContain('07:00');

    const late = pollWindowProblem(540, 23 * 60);
    expect(late?.code).toBe('outside-envelope');
    expect(late?.message).toContain('22:00');

    // Both ends out: ONE message naming both, not two warnings for one window.
    const both = pollWindowProblem(6 * 60, 23 * 60);
    expect(both?.code).toBe('outside-envelope');
    expect(both?.message).toContain('06:00');
    expect(both?.message).toContain('23:00');
  });

  it('the envelope edges themselves are inside it', () => {
    expect(pollWindowProblem(POLL_ENVELOPE_FROM_MIN, POLL_ENVELOPE_TO_MIN)).toBeNull();
  });

  it('reports INVERTED ahead of the envelope', () => {
    // An inverted window is discarded entirely, so telling the operator about
    // its hours would be advice about a window that will never be used.
    expect(pollWindowProblem(23 * 60, 6 * 60)?.code).toBe('inverted');
  });
});
