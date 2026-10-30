/**
 * Searching the allotment data by APPLICATION NUMBER — the match modes, their
 * term caps, and the rule that decides whether a start/end pair is a range at
 * all.
 *
 * It lives here, shared, for the reason `pollWindow.ts` does: the screen has to
 * state the limits the API enforces, and a second copy of a limit is a screen
 * that explains a rule the server does not apply.
 *
 *
 * WHY A RANGE NEEDS A RULE AT ALL
 *
 * `AllotmentRecord.applicationNo` is not one series and not a number. It holds
 * whatever each intermediary issued, so on a single IPO (JPL, 1.60 crore rows,
 * measured 2026-10-30) it carries sixteen different widths from 1 to 16
 * characters, and 72% of the values contain letters:
 *
 *     GROWW000005b35bd   48,19,084 rows   hex tail - a range is meaningless
 *     A12462920100001    23,13,695 rows   sequential
 *     2400000042985001    6,94,659 rows   sequential
 *     UPJPL00000001       5,00,088 rows   sequential
 *     1700000001             91,190 rows   sequential, step 1
 *
 * Inside ONE fixed-width series, text order IS numeric order, so a plain
 * `>= start AND <= end` is exactly right — and index-backed on
 * `(ipoId, applicationNo)` at 0.04 ms. Across widths it is silently wrong:
 *
 *     start 1700001  end 170010000   ->  '170000001' sorts BEFORE '1700001',
 *                                        so the first 9,000 applications in
 *                                        the range never appear and nothing
 *                                        says so.
 *
 * A wrong row count that looks plausible is the expensive failure here, so a
 * mismatched pair is REFUSED with the widths named rather than guessed at.
 *
 *
 * CASE IS NEVER CHANGED
 *
 * PAN is uppercased everywhere in this codebase. An application number must
 * NOT be: 47,92,920 of JPL's rows contain a lowercase letter (every Groww
 * value does), so uppercasing would fail to match nearly 48 lakh rows while
 * looking like an empty result. `cleanAppNo` trims and stops.
 */

/** How a typed application number is matched. */
export type AppNoMode = 'exact' | 'prefix' | 'contains';

export const APP_NO_MODES: readonly AppNoMode[] = ['exact', 'prefix', 'contains'];

export const APP_NO_MODE_LABEL: Record<AppNoMode, string> = {
  exact: 'Exact',
  prefix: 'Starts with',
  contains: 'Contains',
};

export function isAppNoMode(v: unknown): v is AppNoMode {
  return v === 'exact' || v === 'prefix' || v === 'contains';
}

/**
 * Pasted application numbers per bulk search.
 *
 * `exact` and `prefix` both resolve to an index range on
 * `(ipoId, applicationNo)` and answer in under a millisecond, so their cap is
 * about a sensible response size rather than speed — the same 5,000 the PAN
 * search uses.
 */
export const APP_NO_BULK_MAX = 5000;

/**
 * `contains` CANNOT use the index and is capped far lower, measured rather
 * than guessed (JPL, 1.60 crore rows, 2026-10-30):
 *
 *      1 term   2,300 ms        20 terms   6,963 ms
 *      5 terms  3,502 ms        50 terms  16,282 ms
 *
 * One parallel sequential scan with the terms OR'd together, so the cost is a
 * ~2.3 s floor plus ~280 ms per extra term. 25 lands near 8 s, which a request
 * can wear; 200 would be about a minute of held connection, which it cannot.
 *
 * A regex alternation was tried first and is 2-3x WORSE (50 terms: 45,978 ms),
 * so do not reach for it. The way to lift this cap is a `pg_trgm` GIN index on
 * the column, which would tax every row of a million-row import — the hot path
 * here — so it is deliberately not in place.
 */
export const APP_NO_BULK_CONTAINS_MAX = 25;

export function appNoBulkMax(mode: AppNoMode): number {
  return mode === 'contains' ? APP_NO_BULK_CONTAINS_MAX : APP_NO_BULK_MAX;
}

/** Trim, and NOTHING else — see the case note above. */
export function cleanAppNo(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * The leading non-digit run, which is what identifies the series: `UPJPL` in
 * `UPJPL00000001`, `A` in `A12462920100001`, and the empty string in
 * `1700000001` or `002E211026000691`.
 */
export function seriesPrefix(v: string): string {
  const m = /^[^0-9]*/.exec(v);
  return m ? m[0] : '';
}

/**
 * Is this start/end pair a usable range? Returns the reason it is not, or null.
 *
 * The message names the actual widths, because "invalid range" tells an
 * operator nothing they can act on.
 */
export function rangeProblem(fromRaw: unknown, toRaw: unknown): string | null {
  const from = cleanAppNo(fromRaw);
  const to = cleanAppNo(toRaw);
  if (!from || !to) return 'Enter both a start and an end application number.';

  if (from.length !== to.length) {
    return `Start and end must be the same length — the start is ${from.length} character${from.length === 1 ? '' : 's'}`
      + ` and the end is ${to.length}. Inside one series every application number is the same width, and a short`
      + ' end silently drops rows rather than failing. Paste both in full.';
  }

  const pf = seriesPrefix(from);
  const pt = seriesPrefix(to);
  if (pf !== pt) {
    return `Start and end look like different series (“${pf || 'digits only'}” and “${pt || 'digits only'}”).`
      + ' A range only means something inside one series.';
  }

  if (from > to) return 'The start is after the end — swap them.';
  return null;
}

/**
 * How many application numbers the range covers, so the screen can say
 * "8,240 of 10,000 in this range" and a gap is visible without listing it.
 *
 * Null when the span cannot be stated honestly: a non-numeric tail (a Groww hex
 * id has no count), or a span past `Number.MAX_SAFE_INTEGER`. A 16-digit series
 * reaches 9.96e15, which is ABOVE 2^53 — the same precision trap that made the
 * money columns BigInt — so the arithmetic is done in BigInt and only returned
 * when it fits.
 *
 * Assumes `rangeProblem` returned null; it does not re-check.
 */
export function rangeSpan(fromRaw: unknown, toRaw: unknown): number | null {
  const from = cleanAppNo(fromRaw);
  const to = cleanAppNo(toRaw);
  if (!from || !to || from.length !== to.length) return null;

  const p = seriesPrefix(from);
  if (p !== seriesPrefix(to)) return null;
  const a = from.slice(p.length);
  const b = to.slice(p.length);
  if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) return null;

  const span = BigInt(b) - BigInt(a) + 1n;
  if (span <= 0n || span > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(span);
}
