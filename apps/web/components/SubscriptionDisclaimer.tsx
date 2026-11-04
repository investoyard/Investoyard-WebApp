import {
  SUBSCRIPTION_DISCLAIMER,
  SUBSCRIPTION_DISCLAIMER_HEADING,
} from '@investoyard/shared-types';

/**
 * SubscriptionDisclaimer — legal boilerplate rendered at the bottom of
 * /subscription and /subscription/v2.
 *
 * Wording locked by the operator on 2026-09-18. Do not change without an
 * explicit re-sign-off — this is the disclaimer users read before acting on
 * live figures.
 *
 * THE TEXT MOVED TO shared-types/subDisclaimer.ts, because MOBILE renders the
 * same pages and had no disclaimer at all. This file's own note already gave
 * the reason — "same text on both pages so we render it from one place; a copy
 * edit lands on both surfaces at once" — and that argument reaches across
 * SURFACES exactly as it reached across routes. A legal notice is the last
 * thing that should exist in two copies: one edited and one not is worse than
 * one merely out of date, because nothing on either screen says which is
 * which.
 *
 * Proved byte-identical to the JSX it replaces before the move — normalising
 * the entities and the JSX whitespace collapse, both come to 1,259 characters
 * and compare equal, so nothing a reader sees changed. A spec in shared-types
 * now asserts that exact length, so any later edit fails a test and forces the
 * re-sign-off this docblock asks for.
 */
export function SubscriptionDisclaimer() {
  return (
    <section className="sub-disclaimer" aria-labelledby="sub-disclaimer-h">
      <h4 id="sub-disclaimer-h">{SUBSCRIPTION_DISCLAIMER_HEADING}</h4>
      <p>{SUBSCRIPTION_DISCLAIMER}</p>
    </section>
  );
}
