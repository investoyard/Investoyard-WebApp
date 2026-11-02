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

/* ───────────────────────────────────────────────────────────────────────────
 * THE SERIES AS A RECONCILIATION — one line per application number
 *
 * The range above answers "show me the rows between these two numbers". This
 * half answers the different question the operator asked for: "I have a series
 * of application numbers — which of them are in the registrar's file, which
 * are not, and where the file holds a LONGER number under the same opening
 * digits, which one matched."
 *
 *
 * THE MATCH MODE DECIDES WHAT A MEMBER MATCHES, AND IT IS NOT DECORATION
 *
 * Each number in the range is a NEEDLE and each stored application number is
 * the HAYSTACK (operator's wording, 2026-11-02):
 *
 *   exact     the stored number IS the member
 *   prefix    the stored number BEGINS with the member and carries more digits
 *   contains  the member appears ANYWHERE inside the stored number
 *
 * Measured on JPL (1.60 crore rows, 2026-11-02), and the costs are three
 * orders of magnitude apart over a 1,000-member series:
 *
 *   exact     one IN of 1,000 ............................    14 ms
 *   prefix    collapsed to ONE index range ..............     2 ms
 *   prefix    the OR of 1,000 startsWith ...............     92 ms  (agrees)
 *   contains  1 term / 5 terms / 25 terms ... 2,272 / 3,572 / 7,378 ms
 *
 * PREFIX COLLAPSES AND THAT IS THE WHOLE TRICK. The members are contiguous and
 * the same width and the database collation is C (byte order), so the union of
 * 1,000 prefixes is one range — `>= first, < bumpByte(last)`. Checked against
 * the OR of all 1,000 `startsWith` and they return identically, which is why
 * prefix is as cheap as exact at any series size.
 *
 * CONTAINS CANNOT COLLAPSE. It is one parallel sequential scan with the terms
 * OR'd together, so it takes the same cap as the bulk search for the same
 * measured reason — see APP_NO_BULK_CONTAINS_MAX. That makes it useful for a
 * handful of numbers and useless for a series of thousands, which the refusal
 * says out loud rather than leaving to be discovered.
 *
 *
 * WHY THE MODES WERE NEARLY DISMISSED AS INERT, AND WHY THEY ARE NOT
 *
 * Within a SINGLE-WIDTH series all three modes return identically for a
 * full-width member: on UPJPL (every value 13 characters) a missing number
 * returns 0 rows under `startsWith` and 0 under `contains`. So if the ends are
 * typed at the stored width the dropdown changes nothing.
 *
 * They differ when the stored numbers are LONGER than the member — and that is
 * real in this data, not hypothetical. The `JPL` series carries nine widths
 * from 4 to 15 characters and shorter values genuinely are prefixes of longer
 * ones (`JPL1` -> `JPL10000000007`, 84,241 rows from 2 needles; `JPL17202` ->
 * `JPL1720224210`). Worth knowing before trusting a wide sweep: on a SHORT
 * needle prefix is a blunt instrument, and whether its hits are the same
 * application is a judgement only the operator can make from the file.
 *
 *
 * HOW WIDE A SERIES MAY BE, AND WHY THERE HAS TO BE A CAP
 *
 * Density varies enormously, so a span is not a count (measured 2026-11-02):
 *
 *   UPJPL    5,00,088 rows   span    6,04,627   82.7%
 *   DHNJPL   1,16,463 rows   span    1,29,442   90.0%
 *   KCCB       23,913 rows   span      24,318   98.3%
 *   OPJP     1,26,945 rows   span   99,99,611    1.3%   <- the reason
 *   INTGRD     13,164 rows   span   60,53,143    0.2%
 *   EA          4,546 rows   span  ~10 trillion  0.0%
 *
 * So "list every number between these two" is a sensible request on UPJPL and
 * an absurd one on OPJP, where it would produce a crore of lines of which 98.7%
 * say "Not found" — and a missing number in a 1.3%-dense series means nothing
 * at all, because it was never issued. RANGE_SERIES_MAX_SPAN refuses that
 * BEFORE anything runs, with the computed span named.
 *
 *
 * KNOWN LIMIT, STATED RATHER THAN HIDDEN
 *
 * The window is a STRING comparison, so in a mixed-width series it also admits
 * a longer value whose opening characters fall inside it. Those rows are
 * reported as `partial` rather than dropped, because the file has to be the
 * rows on screen — dropping them would make the export disagree with the count
 * above it, and this codebase's standing rule is one filter, one answer. In a
 * single-width series (every one anybody would range over) there are no
 * partials under `exact`, so exact is exact where it matters.
 */

/** The widest application number this will ever build. The longest in the data is 16. */
export const APP_NO_MAX_LEN = 24;

/**
 * How many application numbers one series export may enumerate.
 *
 * Covers UPJPL's whole span (6,04,627 — the widest DENSE series in the data)
 * and refuses OPJP's 99,99,611, which is 1.3% dense and would be a crore of
 * lines to report 1.27 lakh rows. The export streams, so the constraint is the
 * reader's patience and the file size rather than memory.
 */
export const RANGE_SERIES_MAX_SPAN = 1_000_000;

/** How many members one query covers, so neither the rows nor the lines pile up. */
export const SERIES_BATCH = 2000;

/** A start/end pair resolved into the series it describes. */
export type SeriesParts = {
  /** The leading non-digit run, shared by both ends. */
  prefix: string;
  /** Total length of every member. */
  width: number;
  /** Digits after the prefix. */
  tailWidth: number;
  from: bigint;
  to: bigint;
  /** How many numbers the range covers, inclusive. */
  span: number;
};

/**
 * Resolve a start/end pair into its series, or null when it is not one.
 *
 * Null means the range cannot be listed number by number — a non-decimal tail
 * (a Groww id is hexadecimal) or a span past Number.MAX_SAFE_INTEGER. A
 * 16-digit series reaches 9.96e15, which is ABOVE 2^53, so the arithmetic is
 * done in BigInt and only narrowed when it fits — the same precision trap that
 * made the money columns BigInt.
 *
 * Assumes nothing: it re-checks everything `rangeProblem` does, so it is safe
 * to call on raw input.
 */
export function seriesParts(fromRaw: unknown, toRaw: unknown): SeriesParts | null {
  const from = cleanAppNo(fromRaw);
  const to = cleanAppNo(toRaw);
  if (!from || !to || from.length !== to.length) return null;

  const prefix = seriesPrefix(from);
  if (prefix !== seriesPrefix(to)) return null;

  const a = from.slice(prefix.length);
  const b = to.slice(prefix.length);
  if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) return null;

  const lo = BigInt(a);
  const hi = BigInt(b);
  if (hi < lo) return null;

  const span = hi - lo + 1n;
  if (span <= 0n || span > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  return { prefix, width: from.length, tailWidth: a.length, from: lo, to: hi, span: Number(span) };
}

/** `UPJPL` + 1 at tail width 8 -> `UPJPL00000001`. */
export function padMember(prefix: string, n: bigint, tailWidth: number): string {
  return prefix + n.toString().padStart(tailWidth, '0');
}

/** The i-th member of the series, 0-based. */
export function memberAt(p: SeriesParts, i: number): string {
  return padMember(p.prefix, p.from + BigInt(i), p.tailWidth);
}

/**
 * The byte-order successor, carrying when a character is already 0xFF.
 *
 * This is what lets a contiguous set of PREFIXES collapse into one index
 * range: everything under `UPJPL0001` is `>= 'UPJPL0001' AND < 'UPJPL0002'`.
 * It must carry rather than increment blindly, and the boundaries are where a
 * naive version goes wrong — `9` becomes `:` (0x3A, above every digit, which is
 * correct) and `Z` becomes `[` (0x5B, which is BELOW lowercase, so a trailing
 * `Z` needs the carry rather than a bare bump). Returns the TRUNCATED string,
 * because an upper bound does not need the characters after the bumped one.
 *
 * Null when every character is 0xFF, which no application number can be.
 */
export function bumpByte(s: string): string | null {
  const a = s.split('');
  for (let i = a.length - 1; i >= 0; i--) {
    const c = a[i].charCodeAt(0);
    if (c < 0xff) {
      a[i] = String.fromCharCode(c + 1);
      return a.slice(0, i + 1).join('');
    }
  }
  return null;
}

/** The index window for a whole series, or for one batch of it. */
export type SeriesWindow = { gte: string; lte?: string; lt?: string };

/**
 * The index window that covers every member between `from` and `to`.
 *
 * `exact` closes the window on the last member; `prefix` opens it to everything
 * under that member, which is what makes the union of N prefixes one range.
 * `contains` has no window at all — it cannot use the index — so the caller
 * builds an OR of its terms instead.
 */
export function seriesWindow(p: SeriesParts, mode: AppNoMode, from = p.from, to = p.to): SeriesWindow | null {
  if (mode === 'contains') return null;
  const lo = padMember(p.prefix, from, p.tailWidth);
  const hi = padMember(p.prefix, to, p.tailWidth);
  if (mode === 'prefix') {
    const stop = bumpByte(hi);
    return stop ? { gte: lo, lt: stop } : { gte: lo };
  }
  return { gte: lo, lte: hi };
}

/**
 * Which member explains this stored value, for `exact` and `prefix`.
 *
 * A fixed-length slice and one comparison, NOT a scan over the members: a
 * series runs to a million and a prefix match can return tens of thousands of
 * rows, so terms x rows is the quadratic shape already fixed once in the bulk
 * search. Null when the row is outside the series, which can happen because the
 * window is a string comparison — see the limit note above.
 */
export function memberFor(stored: string, p: SeriesParts): string | null {
  if (stored.length < p.width) return null;
  const head = stored.slice(0, p.width);
  if (!head.startsWith(p.prefix)) return null;
  const tail = head.slice(p.prefix.length);
  if (!/^[0-9]+$/.test(tail)) return null;
  const n = BigInt(tail);
  if (n < p.from || n > p.to) return null;
  return head;
}

/** What happened to one member of the series. */
export type SeriesStatus = 'full' | 'partial' | 'missing';

export const SERIES_STATUS_LABEL: Record<SeriesStatus, string> = {
  full: 'Matched (full)',
  partial: 'Matched (partial)',
  missing: 'Not found',
};

/**
 * `full` when the stored number IS the member, `partial` when it merely carries
 * it. The operator's own words for the two, and the distinction is the point of
 * the report: a partial row is a number the registrar wrote differently, which
 * is a thing to look at rather than a tick.
 */
export function seriesStatus(stored: string, member: string): SeriesStatus {
  return stored === member ? 'full' : 'partial';
}

/**
 * Can this range be listed number by number in this mode? Returns the reason it
 * cannot, or null.
 *
 * Checked BEFORE anything runs, and every message names the figure that caused
 * it — "invalid range" tells an operator nothing they can act on, and a span of
 * a crore is not something to discover from a stalled download.
 */
export function seriesProblem(fromRaw: unknown, toRaw: unknown, modeRaw?: unknown): string | null {
  const basic = rangeProblem(fromRaw, toRaw);
  if (basic) return basic;

  const p = seriesParts(fromRaw, toRaw);
  if (!p) {
    return 'This series cannot be listed number by number — the part after the prefix is not a plain'
      + ' decimal number (a Groww application id is hexadecimal, for example), so there is no "every'
      + ' number in between" to list. The range still filters the table.';
  }

  const mode: AppNoMode = isAppNoMode(modeRaw) ? modeRaw : 'exact';
  if (mode === 'contains') {
    if (p.span > APP_NO_BULK_CONTAINS_MAX) {
      return `“Contains” cannot use the index — each number adds about a third of a second to one full`
        + ` scan — so it is limited to ${APP_NO_BULK_CONTAINS_MAX} of them, and this range covers`
        + ` ${p.span.toLocaleString('en-IN')}. Use Exact or Starts with for a series this size.`;
    }
    return null;
  }

  if (p.span > RANGE_SERIES_MAX_SPAN) {
    return `This range covers ${p.span.toLocaleString('en-IN')} application numbers and the series export`
      + ` is limited to ${RANGE_SERIES_MAX_SPAN.toLocaleString('en-IN')}. Narrow it — and note that a`
      + ' sparse series spans far more numbers than it ever issued.';
  }

  return null;
}

/**
 * Re-pad both ends to a WIDER stored width, so a list written without the
 * leading zeros reconciles against the file.
 *
 * The operator's case: a list of `UPJPL0001`..`UPJPL1000` against a file that
 * stores `UPJPL00000001`. Normalising the ENDS is exact and costs one index
 * range; matching on the numeric VALUE instead would need a window per width,
 * and a string window at one width admits longer values at another — so this is
 * the cheap correct half of the same idea.
 *
 * Null when there is nothing to do: the stored width is not wider, or the
 * range's own numbers would not fit in it.
 */
export function normaliseEnds(p: SeriesParts, storedWidth: number): { from: string; to: string } | null {
  const tail = storedWidth - p.prefix.length;
  if (!Number.isFinite(tail) || tail <= p.tailWidth || storedWidth > APP_NO_MAX_LEN) return null;
  if (p.to.toString().length > tail) return null;
  return { from: padMember(p.prefix, p.from, tail), to: padMember(p.prefix, p.to, tail) };
}
