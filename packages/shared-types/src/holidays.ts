/**
 * NSE trading holidays — the CAPITAL MARKET (equity) segment.
 *
 * Source: https://www.nseindia.com/api/holiday-master?type=trading
 * Fetched: 2026-08-29. Regenerate each January —
 * NSE publishes the coming year's list in advance and the API only ever
 * returns the current one.
 *
 * Weekends are NOT in here; the working-day counter handles those itself. Only
 * the CM segment matters: an IPO's bidding window and its T+3 listing both run
 * on the equity market's calendar, not the derivatives or currency ones.
 *
 * COVERAGE MATTERS. The date rules only ever BLOCK inside `HOLIDAY_YEARS`.
 * Outside it we would be counting weekends alone, which is a guess, and a
 * blocking rule that is guessing stops an operator entering a valid issue.
 */

/** Years this list actually covers. Outside these, treat any count as a hint. */
export const HOLIDAY_YEARS: readonly string[] = ['2026'];

export const NSE_TRADING_HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-01-15', // Municipal Corporation Election - Maharashtra
  '2026-01-26', // Republic Day
  '2026-02-15', // Mahashivratri
  '2026-03-03', // Holi
  '2026-03-21', // Id-Ul-Fitr (Ramadan Eid)
  '2026-03-26', // Shri Ram Navami
  '2026-03-31', // Shri Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-28', // Bakri Id
  '2026-06-26', // Muharram
  '2026-08-15', // Independence Day
  '2026-09-14', // Ganesh Chaturthi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-08', // Diwali Laxmi Pujan*
  '2026-11-10', // Diwali-Balipratipada
  '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev
  '2026-12-25', // Christmas
]);

/** True when every date given falls inside a year the calendar covers. */
export const holidaysCover = (...dates: (string | undefined)[]): boolean =>
  dates.filter(Boolean).every((d) => HOLIDAY_YEARS.includes(String(d).slice(0, 4)));

/** A day the equity market is shut: weekend or listed holiday. */
export const isTradingHoliday = (iso: string): boolean => {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6 || NSE_TRADING_HOLIDAYS.has(iso);
};
