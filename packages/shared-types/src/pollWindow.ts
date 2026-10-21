/**
 * The subscription poller's window — its numbers, its minute format, and the
 * one test for whether a per-issue override is usable.
 *
 * IT LIVES HERE BECAUSE THE FORM HAS TO EXPLAIN WHAT THE POLLER ENFORCES.
 * `extra.pollFromMin` / `extra.pollToMin` have been read by the poller since
 * they were added, with no way to set them but a database write; giving the
 * admin form two boxes means the screen now states a limit the API applies.
 * A stated limit that disagrees with the enforced one is how an operator
 * learns to distrust the screen — the allotment upload cap was retyped in four
 * places for exactly this reason — so the constants and the acceptance rule
 * are defined once and imported by both sides.
 *
 * MINUTES FROM MIDNIGHT IS THE STORED UNIT, and nothing above this module
 * should ever see it. `540` is unreadable in a form box; the operator types
 * `09:00` into an `<input type="time">` and these two converters are the only
 * place the two representations meet.
 */

/** 10:00 IST — SEBI bidding open; the global default when nothing overrides it. */
export const DEFAULT_POLL_FROM_MIN = 10 * 60;
/**
 * 18:00 IST — one hour past the 17:00 bidding close. The grace matters: the
 * exchanges keep serving consolidated figures for 30–60 min after bidding
 * stops, and on closing day those are the numbers most worth having.
 */
export const DEFAULT_POLL_TO_MIN = 18 * 60;

/**
 * THE WIDEST THE POLLER WILL EVER CALL AN EXCHANGE, whatever a per-issue
 * window says. The 10-second tick checks it before loading anything, so it has
 * to come first — which means a window set outside it is accepted by the
 * override and then never acted on. That is precisely the kind of box the form
 * must warn about rather than quietly take.
 */
export const POLL_ENVELOPE_FROM_MIN = 7 * 60;   // 07:00 IST
export const POLL_ENVELOPE_TO_MIN = 22 * 60;    // 22:00 IST

/** Minutes-from-midnight → `HH:MM`, or '' when there is nothing usable. */
export function pollTimeToHhmm(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1440) return '';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * `HH:MM` → minutes-from-midnight, or **null** for anything blank or
 * unparseable.
 *
 * Null rather than 0 is deliberate and the caller depends on it: a cleared box
 * has to DELETE the stored key, and `0` would be written as a value. A key
 * present and falsy reads as *set* to anything testing for presence, which is
 * the trailing-`""` fault `mergeContentPatch` exists to avoid.
 */
export function pollHhmmToMin(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const total = h * 60 + min;
  return total > 0 ? total : null;
}

/**
 * The poller's own usability test for one stored minute, so the form cannot
 * disagree with it: finite, positive, within a day. `windowFor` imports this
 * rather than keeping its own copy.
 */
export function pollMinute(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 1440 ? n : fallback;
}

export type PollWindowProblem = {
  code: 'inverted' | 'outside-envelope';
  message: string;
};

/**
 * What is wrong with a per-issue override, if anything — for the form to say
 * out loud. `null` means the poller will act on it as entered.
 *
 * EITHER END MAY BE BLANK and that is a legitimate half-override: an unset end
 * falls back to the global window, so "poll until 20:00, start at the usual
 * time" is a real thing to want. So the inverted test fires only when BOTH are
 * set, where the pair is unambiguous — the form has not read the tenant's
 * configured global and must not claim to know it. The envelope test needs no
 * such care: it is a hard bound on each end independently.
 */
export function pollWindowProblem(
  fromMin: number | null,
  toMin: number | null,
): PollWindowProblem | null {
  if (fromMin != null && toMin != null && toMin <= fromMin) {
    return {
      code: 'inverted',
      message:
        `The poll window closes at ${pollTimeToHhmm(toMin)}, at or before it opens at ${pollTimeToHhmm(fromMin)}. `
        + 'The poller refuses an inverted window and falls back to the global one, so this issue would be polled on the normal schedule and neither box would do anything.',
    };
  }
  const out: string[] = [];
  if (fromMin != null && fromMin < POLL_ENVELOPE_FROM_MIN) {
    out.push(`opens at ${pollTimeToHhmm(fromMin)}, before ${pollTimeToHhmm(POLL_ENVELOPE_FROM_MIN)}`);
  }
  if (toMin != null && toMin > POLL_ENVELOPE_TO_MIN) {
    out.push(`closes at ${pollTimeToHhmm(toMin)}, after ${pollTimeToHhmm(POLL_ENVELOPE_TO_MIN)}`);
  }
  if (out.length) {
    return {
      code: 'outside-envelope',
      message:
        `This window ${out.join(' and ')}. The poller's sweep never runs outside `
        + `${pollTimeToHhmm(POLL_ENVELOPE_FROM_MIN)}–${pollTimeToHhmm(POLL_ENVELOPE_TO_MIN)} IST, so the part beyond that is accepted here and then ignored. `
        + 'Nothing is polled in those hours and nothing is recorded for them.',
    };
  }
  return null;
}
