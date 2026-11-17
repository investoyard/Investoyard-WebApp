import * as st from '@investoyard/shared-types';
import type { RawIpo } from './data.server';
import { dayMon, priceBand, wdDayMon } from './format';
import { isoDay, normalise, toCard, type Tone } from './models';

/*
 * THE IPO CALENDAR — the data every variant's calendar page renders.
 *
 * The same four events as investoyard.com's /calendar (opens, closes,
 * allotment, listing), read from the same four date fields. Pure and free of
 * React, so a client component can import the helpers too.
 *
 * A static export bakes this in, so it carries a window rather than the whole
 * catalogue: the last twelve months plus everything ahead (~250 IPOs, ~870
 * events). Older months belong to the archive.
 */

export type CalKind = 'open' | 'close' | 'allot' | 'list';
export const CAL_KINDS: CalKind[] = ['open', 'close', 'allot', 'list'];
export const KIND_LABEL: Record<CalKind, string> = { open: 'Opens', close: 'Closes', allot: 'Allotment', list: 'Listing' };
/** Column / section headings, where a noun reads better than a verb. */
export const KIND_TITLE: Record<CalKind, string> = { open: 'Opening', close: 'Closing', allot: 'Allotment', list: 'Listing' };

export interface CalIpo {
  sym: string; name: string; board: 'Mainboard' | 'SME'; logo: string | null; ini: string; href: string;
  band: string; size: string; tone: Tone; status: string; dates: string;
  /** Every key date as YYYY-MM-DD ('' when not entered), for a design that tabulates them. */
  open: string; close: string; allot: string; refund: string; demat: string; list: string;
  industry: string | null; sizeN: number | null;
}
/** One event. `i` indexes `ipos`, so an IPO with four events is carried once. */
export interface CalEvent { d: string; k: CalKind; i: number }
export interface CalendarModel {
  ipos: CalIpo[];
  /** Sorted by date, then by kind in the order above, then by name. */
  events: CalEvent[];
  /** The build day (IST). The page moves to the reader's own day after mount. */
  asOf: string;
  /** First and last day a reader may move to. */
  from: string;
  to: string;
}

const FIELD: Record<CalKind, 'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate'> = {
  open: 'openDate', close: 'closeDate', allot: 'allotmentDate', list: 'listingDate',
};

export function calendarModel(raw: RawIpo[]): CalendarModel {
  const asOf = st.istToday();
  const from = monthStart(addMonths(ymOf(asOf), -12));
  const all = raw.map(normalise).filter((x) => x.status !== 'withdrawn');
  const ipos: CalIpo[] = [];
  const events: CalEvent[] = [];
  for (const x of all) {
    const mine: { d: string; k: CalKind }[] = [];
    for (const k of CAL_KINDS) {
      const d = String((x as any)[FIELD[k]] || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from) mine.push({ d, k });
    }
    if (!mine.length) continue;
    const c = toCard(x, 1);
    const i = ipos.push({
      sym: c.sym, name: c.name, board: c.board, logo: c.logo, ini: c.ini, href: c.href,
      band: priceBand(Number(x.priceBandMin) || null, Number(x.priceBandMax) || null), size: c.size,
      tone: c.tone, status: c.status, dates: c.dates,
      open: c.open, close: c.close, allot: c.allotment, list: c.listing,
      refund: isoDay((x.extra || {}).refundDate), demat: isoDay((x.extra || {}).dematDate),
      industry: c.industry, sizeN: c.sizeN,
    }) - 1;
    for (const e of mine) events.push({ ...e, i });
  }
  const rank = (k: CalKind) => CAL_KINDS.indexOf(k);
  events.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : rank(a.k) - rank(b.k) || ipos[a.i].name.localeCompare(ipos[b.i].name)));
  const last = events.length ? events[events.length - 1].d : asOf;
  const end = monthEnd(ymOf(asOf));
  return { ipos, events, asOf, from, to: last > end ? monthEnd(ymOf(last)) : end };
}

/* ------------------------------------------------------- date helpers --- */
/* Calendar dates are YYYY-MM-DD strings handled in UTC, so no reader's zone can shift a day. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const ymOf = (iso: string) => iso.slice(0, 7);
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => fromUtc(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0));
export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * 86_400_000);
export const addMonths = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
/** Monday = 0 … Sunday = 6. */
export const dowOf = (iso: string) => (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
export const weekStart = (iso: string) => addDays(iso, -dowOf(iso));
export const dayNum = (iso: string) => +iso.slice(8, 10);
export const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const monthShort = (ym: string) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export { dayMon, wdDayMon };

/** The seven days of the week holding `iso`, Monday first. */
export const weekDays = (iso: string): string[] => {
  const s = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};

/** A month as whole Monday-first weeks; days outside the month are included so the grid is square. */
export function monthGrid(ym: string): string[][] {
  const last = monthEnd(ym);
  const weeks: string[][] = [];
  for (let d = weekStart(monthStart(ym)); d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

/** Every day of the month, in order. */
export const monthDays = (ym: string): string[] => {
  const out: string[] = [];
  for (let d = monthStart(ym); d <= monthEnd(ym); d = addDays(d, 1)) out.push(d);
  return out;
};

/** "18 – 24 Nov 2026", "29 Dec 2026 – 4 Jan 2027" */
export function weekLabel(iso: string): string {
  const s = weekStart(iso);
  const e = addDays(s, 6);
  const y = (x: string) => x.slice(0, 4);
  if (y(s) !== y(e)) return `${dayMon(s)} ${y(s)} – ${dayMon(e)} ${y(e)}`;
  return ymOf(s) === ymOf(e) ? `${dayNum(s)} – ${dayMon(e)} ${y(e)}` : `${dayMon(s)} – ${dayMon(e)} ${y(e)}`;
}

/** Events grouped by day. Each day's list keeps the model's order. */
export function byDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const m = new Map<string, CalEvent[]>();
  for (const e of events) {
    const l = m.get(e.d);
    if (l) l.push(e); else m.set(e.d, [e]);
  }
  return m;
}

export const countKinds = (events: CalEvent[]): Record<CalKind, number> => {
  const c: Record<CalKind, number> = { open: 0, close: 0, allot: 0, list: 0 };
  for (const e of events) c[e.k]++;
  return c;
};
