/**
 * Server-side bid rules that must not live only on a screen.
 *
 * WHY THIS EXISTS (2026-11-20). Until now the only check that an IPO was open
 * for bidding was the apply screen hiding its button. `ApplicationsService.create`
 * had no `startBid` check and no bidding-window check, so anything able to reach
 * the endpoint — a stale screen, a crafted request, and soon the partner bid API
 * — could place a bid for an issue the operator had not opened. The print channel
 * was already gated server-side; the one that reaches the exchange was not.
 *
 * Pure and over plain values, so it can be tested here (the API has no way to
 * test a method that needs a Prisma row) and read by any surface that wants to
 * explain the same rule.
 */
import { closeAt, openAt, IST_OFFSET_MIN, DEFAULT_OPEN_TIME, DEFAULT_CLOSE_TIME, istToday } from './ipoClock';
import { holidaysCover, isTradingHoliday } from './holidays';

export interface BidGateIpo {
  /** 'YYYY-MM-DD' (the date column) or an ISO string starting with it */
  openDate?: string | null;
  closeDate?: string | null;
  extra?: Record<string, unknown> | null;
}

export type BidGateResult = { ok: true } | { ok: false; reason: string };

const DAY_MS = 86_400_000;

/** Minutes past IST midnight for an instant. */
function istMinute(ms: number): number {
  return Math.floor((((ms + IST_OFFSET_MIN * 60_000) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);
}

const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * May a bid be accepted for this IPO right now?
 *
 * In order, and the order is the order a reader would want to be told:
 * 1. the operator has switched bidding on (`extra.startBid === true`);
 * 2. the issue has both dates;
 * 3. we are not before the opening instant, nor after the closing one — both
 *    honour the operator's own hour when it is entered (`openAt` / `closeAt`);
 * 4. today is not a weekend or an NSE holiday — checked only for a year the
 *    holiday calendar actually covers, so an unknown year never blocks a bid;
 * 5. the time of day is inside the daily bidding hours.
 *
 * THE DAILY HOURS ARE THE WIDEST REASONABLE WINDOW, NOT THE NARROWEST. The
 * standard day is 10:00–17:00, and an operator may enter a different opening
 * or closing hour for an issue (JPL closed at 19:00). The window is therefore
 * from the earlier of 10:00 and the issue's opening hour to the later of 17:00
 * and its closing hour. Refusing a bid the exchange would have taken is the
 * expensive mistake here; the exchange still refuses anything it does not want.
 */
export function mayAcceptBid(ipo: BidGateIpo, now: number = Date.now()): BidGateResult {
  if ((ipo.extra as any)?.startBid !== true) {
    return { ok: false, reason: 'Bidding has not been started for this IPO yet.' };
  }
  const open = openAt(ipo);
  const close = closeAt(ipo);
  if (open == null || close == null) {
    return { ok: false, reason: 'This IPO has no bidding dates set.' };
  }
  if (now < open) {
    return {
      ok: false,
      reason: `Bidding for this IPO opens on ${istToday(open)} at ${hhmm(istMinute(open))} IST.`,
    };
  }
  if (now > close) {
    return { ok: false, reason: 'Bidding for this IPO has closed.' };
  }
  const today = istToday(now);
  if (holidaysCover(today) && isTradingHoliday(today)) {
    return { ok: false, reason: 'Bids are not accepted today — the market is closed.' };
  }
  const start = Math.min(toMin(DEFAULT_OPEN_TIME), istMinute(open));
  const end = Math.max(toMin(DEFAULT_CLOSE_TIME), istMinute(close));
  const m = istMinute(now);
  if (m < start || m > end) {
    return { ok: false, reason: `Bids are accepted between ${hhmm(start)} and ${hhmm(end)} IST.` };
  }
  return { ok: true };
}

/** The IPO's active "Online Apply" series row — the member a bid goes under and
 *  the range its application number is taken from. */
export interface OnlineSeriesRow {
  member: string;
  exchange?: string;
  from?: string | number | null;
  to?: string | number | null;
  active?: boolean;
}

/**
 * The ACTIVE online series row, or null.
 *
 * Exactly one row should be active (the operator picks the bid member on the
 * Operations screen). Null when none is — and the caller must REFUSE rather
 * than pick a member itself: a bid placed under a member nobody chose hands
 * that trading member the regulatory ownership of a client it never agreed to.
 */
export function activeOnlineSeries(extra: unknown): OnlineSeriesRow | null {
  const rows = (extra as any)?.onlineSeries;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r: any) => r && r.active === true && String(r.member ?? '').trim());
  return row ? { ...row, member: String(row.member).trim() } : null;
}

const asNum = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
};

/**
 * The next application number from a series, given the numbers already used.
 *
 * Same rule as the ASBA form-number series: the next number is one above the
 * highest number already used INSIDE this range, or `from` when none is.
 * Numbers outside the range (another member's series, an exchange-assigned
 * number) are ignored. Returns null when `from` is not a number or the range
 * is used up — the caller refuses the bid rather than inventing a number.
 *
 * The caller must hold a lock while it reads the used numbers and writes the
 * new one, or two bids placed at the same moment get the same number. That is
 * the API's job (a transaction-scoped advisory lock), not this function's.
 */
export function nextSeriesNumber(
  used: Iterable<string | number | null | undefined>,
  from: string | number | null | undefined,
  to?: string | number | null,
): string | null {
  const lo = asNum(from);
  if (lo === null) return null;
  const hi = asNum(to);
  let next = lo;
  for (const u of used) {
    const n = asNum(u);
    if (n === null || n < lo || (hi !== null && n > hi)) continue;
    if (n + 1 > next) next = n + 1;
  }
  if (hi !== null && next > hi) return null;
  return String(next);
}
