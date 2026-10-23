/**
 * WHEN an issue opens and closes — the hour, not just the day.
 *
 * `Ipo.openDate` and `Ipo.closeDate` are DATE-ONLY columns (they are pinned to
 * UTC midnight of their IST date, deliberately — see the timestamptz note in
 * CLAUDE.md). The HOUR the operator entered lives in `extra.openDate` /
 * `extra.closeDate` as a `datetime-local` string, "2026-10-23T19:00".
 *
 * NOTHING ON THE WEB READ IT. Three render sites appended a hardcoded
 * `T17:00:00` to the column instead — `IpoCard`'s close hint, `CountdownDial`,
 * and the featured panel — so JPL, which the operator had corrected to 19:00,
 * counted down to 17:00 on every one of them. Reported 2026-10-23.
 *
 * SEBI's 10:00–17:00 is the usual case and stays the fallback; it is not a
 * guarantee, which is the same reason the poller grew a per-issue window.
 * Measured across the catalogue when this was written: 104 records close at
 * 17:00, and the ones that do not are 16:00 (x3), 17:33, and JPL's 19:00.
 */

/** The hour an issue opens when the record does not say otherwise. */
export const DEFAULT_OPEN_TIME = '10:00';
/** The hour bidding closes when the record does not say otherwise. */
export const DEFAULT_CLOSE_TIME = '17:00';

/** The minimum this needs: the two date columns and the operator's `extra`. */
export interface ClockIpo {
  openDate?: string | null;
  closeDate?: string | null;
  extra?: Record<string, unknown> | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-10-23T19:00" -> "19:00"; anything else -> null. */
function timeOf(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 16 || v[10] !== 'T') return null;
  const t = v.slice(11, 16);
  return HHMM.test(t) ? t : null;
}

/** "2026-10-23T19:00" or "2026-10-23" -> "2026-10-23". */
function dayOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(DAY);
  return m ? m[0] : null;
}

/**
 * The operator's time for this milestone, or the default.
 *
 * TAKEN ONLY WHEN THE TWO AGREE ON THE DAY. Every other derivation on the
 * platform — the stage engine, the poller window, the sort order — reads the
 * COLUMN, so if `extra` named a different date, honouring its hour would point
 * a countdown at a time on a day nothing else believes in. Measured when this
 * was written: 111 of 111 records carrying a time agreed with their column, so
 * this guard costs nothing today and is the thing that keeps a later divergence
 * from moving a countdown somewhere nobody chose.
 */
function timeFor(ipo: ClockIpo, key: 'openDate' | 'closeDate', fallback: string): string {
  const col = dayOf(ipo[key]);
  const ex = (ipo.extra ?? {})[key];
  if (!col) return fallback;
  if (dayOf(ex) !== col) return fallback;
  return timeOf(ex) ?? fallback;
}

/**
 * An instant for `date` at `time` **in IST** (operator decision, 2026-10-23).
 *
 * These are Indian exchange hours: an issue closes at 19:00 in Mumbai and at
 * no other time anywhere. Parsing without an offset reads the string in the
 * READER OWN zone, which is what the four hardcoded render sites did — so a
 * reader in London counted down to 19:00 GMT, half past midnight IST, six
 * hours after bidding had actually shut.
 */
/** IST as a fixed offset. **Exact, not an approximation: India has no DST**
    and has not since 1945. The same shortcut would be wrong for a zone that
    observes it, where the offset depends on the date being parsed. */
export const IST_OFFSET = '+05:30';
/** The same constant as minutes east of UTC, for arithmetic. */
export const IST_OFFSET_MIN = 330;

function at(date: string | null | undefined, time: string): number | null {
  const d = dayOf(date);
  if (!d) return null;
  const ms = new Date(`${d}T${time}:00${IST_OFFSET}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** When bidding opens, in ms. Null when the record has no open date. */
export function openAt(ipo: ClockIpo): number | null {
  return at(ipo.openDate, timeFor(ipo, 'openDate', DEFAULT_OPEN_TIME));
}

/** When bidding closes, in ms. Null when the record has no close date. */
export function closeAt(ipo: ClockIpo): number | null {
  return at(ipo.closeDate, timeFor(ipo, 'closeDate', DEFAULT_CLOSE_TIME));
}

/**
 * An instant rendered as an IST clock time — "7 pm", "5 pm", "5:33 pm".
 *
 * **IST, NOT THE READER ZONE, AND THAT IS THE POINT.** The instant is pinned
 * to IST, so formatting it with `getHours()` would undo half the fix: a
 * reader in London would get a correct countdown captioned "closes today,
 * 1:30 pm" for an issue the exchange, the RHP and every other site put at 7.
 * The hour an Indian IPO closes is a fact about Mumbai, not about the reader.
 *
 * Minutes appear only when there are any: "7:00 pm" beside a ticking clock is
 * a decimal point nobody needs.
 */
export function istClock(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  /* Shift into IST and read the UTC parts — the standard way to get another
     zone wall clock without pulling in a timezone library. */
  const d = new Date(ms + IST_OFFSET_MIN * 60_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Any other dated milestone — allotment, listing — at a stated hour.
 *
 * These carry no operator time and no convention of their own, so the caller
 * names the hour it wants rather than this pretending to know one.
 */
export function milestoneAt(date: string | null | undefined, time: string = DEFAULT_CLOSE_TIME): number | null {
  return at(date, time);
}
