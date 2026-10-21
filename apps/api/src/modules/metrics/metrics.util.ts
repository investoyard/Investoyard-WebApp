import { createHash } from 'crypto';

/**
 * The pure parts of visitor tracking — what counts as a page we track, what
 * counts as a bot, which hour a view falls in, and who a visitor is.
 *
 * SEPARATED SO THEY CAN BE TESTED. The service around them needs Prisma and
 * Redis; these four decisions are the ones that can be quietly wrong, and
 * every one of them is a pure function of its inputs. Same reason
 * `offeredFromIpo`, `parseAnchorRows` and `offerTotals` were pulled out of the
 * files that hid them.
 */

/**
 * THE PAGES WE TRACK, AND THIS IS A WHITELIST FOR A REASON.
 *
 * The beacon endpoint is PUBLIC and unauthenticated — it has to be, the site
 * is a static export with no session on these pages. An attacker who can POST
 * an arbitrary `path` can write an unbounded number of distinct rows into the
 * table, so the server decides what a page is and the client only gets to pick
 * from the list.
 *
 * Adding a page is one entry here plus mounting the component; the whole
 * mechanism is path-generic.
 */
export const TRACKED_PATHS = ['/subscription', '/subscription/v2'] as const;
export type TrackedPath = (typeof TRACKED_PATHS)[number];

/**
 * Normalise a reported path to one of the tracked ones, or null.
 *
 * Trailing slashes and a query string are stripped because the static export
 * serves `/subscription/` and the single-issue page carries `?symbol=`; those
 * are the same page and must not become two rows.
 */
export function normalisePath(raw: unknown): TrackedPath | null {
  let p = String(raw ?? '').trim().toLowerCase();
  if (!p) return null;
  p = p.split('?')[0].split('#')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return (TRACKED_PATHS as readonly string[]).includes(p) ? (p as TrackedPath) : null;
}

/**
 * The IPO a page was showing, or '' for none.
 *
 * EMPTY STRING, NEVER NULL, and that is a database constraint rather than a
 * preference: Postgres treats NULLs as DISTINCT in a unique index, so a
 * nullable `symbol` would make the upsert insert a fresh row on every single
 * beacon instead of incrementing one.
 *
 * Symbols are the exchange's own, which are upper-case alphanumerics. Anything
 * else is dropped rather than stored — this arrives from a public endpoint.
 */
export function normaliseSymbol(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.slice(0, 20);
}

/**
 * Obvious crawlers, flagged rather than dropped.
 *
 * FLAGGED, NOT DROPPED, because a count that silently discards traffic cannot
 * be reconciled against the IIS log, and the operator will reconcile it — the
 * log shows ~6 bot-flagged requests a day on these pages. The report excludes
 * them by default and can show them.
 *
 * Deliberately a coarse list: a crawler that disguises itself is not something
 * a user-agent test will catch, and pretending otherwise would be worse than
 * the honest approximation.
 */
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|curl|wget|python-requests|axios|monitor|uptime/i;
export function isBot(ua: unknown): boolean {
  const s = String(ua ?? '');
  if (!s.trim()) return true;          // no UA at all is a script, not a reader
  return BOT_RE.test(s);
}

/** IST is a fixed +05:30 — no DST, so this needs no timezone library. */
const IST_OFFSET_MIN = 5 * 60 + 30;

/**
 * The start of the IST hour a view falls in, as the true instant.
 *
 * Stored rather than derived so the unique index has something stable to key
 * on, and bucketed in IST because a day boundary has to be the OPERATOR's day
 * — the same reason the partner-api summary groups with
 * `AT TIME ZONE 'Asia/Kolkata'`. A view at 00:30 IST belongs to that date, not
 * to the previous one.
 */
export function istHourStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  shifted.setUTCMinutes(0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MIN * 60_000);
}

/** The IST calendar date (YYYY-MM-DD) an instant falls on — the salt's lifetime. */
export function istDateKey(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/**
 * Who a visitor is, for one day only.
 *
 * NOTHING IS STORED ON THE VISITOR'S DEVICE — no cookie, no localStorage, no
 * identifier of any kind. The key is a hash of a SERVER-HELD salt that rotates
 * at IST midnight, plus the IP and user agent. That buys three things at once:
 *
 *   • unique-visitor counts within a day are real;
 *   • the same person on two days hashes differently, so nothing can be
 *     followed across days even by us;
 *   • there is no device identifier to ask consent for, which keeps this clean
 *     under DPDP rather than relying on a banner nobody reads.
 *
 * The cost is honest and worth stating in the report: a RANGE total is the sum
 * of daily uniques, so somebody who visits on three days counts three times.
 *
 * The IP and user agent are never stored — only this digest, which cannot be
 * reversed to either once the day's salt is gone.
 */
export function visitorKey(salt: string, ip: unknown, ua: unknown): string {
  return createHash('sha256')
    .update(`${salt}|${String(ip ?? '')}|${String(ua ?? '')}`)
    .digest('hex')
    .slice(0, 32);
}
