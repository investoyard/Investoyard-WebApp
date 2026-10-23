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
 * An instant for `date` at `time`, in the READER'S OWN timezone.
 *
 * That is what the three render sites did before this and is kept deliberately
 * rather than pinned to IST: changing it would move every countdown for every
 * reader outside India, which is a separate decision from fixing the hour.
 * It is a real limitation — a reader in London sees JPL's 19:00 close land at
 * 19:00 GMT, which is 00:30 IST the next day.
 */
function at(date: string | null | undefined, time: string): number | null {
  const d = dayOf(date);
  if (!d) return null;
  const ms = new Date(`${d}T${time}:00`).getTime();
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
 * Any other dated milestone — allotment, listing — at a stated hour.
 *
 * These carry no operator time and no convention of their own, so the caller
 * names the hour it wants rather than this pretending to know one.
 */
export function milestoneAt(date: string | null | undefined, time: string = DEFAULT_CLOSE_TIME): number | null {
  return at(date, time);
}
