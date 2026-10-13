/**
 * `tradingDaysBetween` — the figure the subscription readiness card reports as
 * "days lost" and "days left", which is what tells an operator whether a row is
 * an emergency or a note. An off-by-one here misleads rather than informs, and
 * inclusive date ranges are where off-by-ones live.
 */
import { tradingDaysBetween, isTradingHoliday, HOLIDAY_YEARS } from './holidays';

describe('tradingDaysBetween — inclusive of both ends', () => {
  it('counts a single trading day as one', () => {
    // Tue 6 Oct 2026
    expect(tradingDaysBetween('2026-10-06', '2026-10-06')).toBe(1);
  });

  it('counts zero for a single non-trading day', () => {
    expect(tradingDaysBetween('2026-10-03', '2026-10-03')).toBe(0); // Saturday
  });

  it('reproduces PARASYNTEX: 30 Sep → 6 Oct is FOUR bidding days', () => {
    /* 30 Sep Wed · 1 Oct Thu · 2 Oct Fri = Gandhi Jayanti · 3-4 Oct weekend ·
       5 Oct Mon · 6 Oct Tue. Seven calendar days, five weekdays, four bidding
       days — which is why this cannot be a weekday count. */
    expect(tradingDaysBetween('2026-09-30', '2026-10-06')).toBe(4);
    expect(isTradingHoliday('2026-10-02')).toBe(true);
  });

  it('skips a weekend in the middle', () => {
    // Fri 2 Oct is a holiday too, so Thu 1 Oct → Mon 5 Oct is 1 Oct + 5 Oct
    expect(tradingDaysBetween('2026-10-01', '2026-10-05')).toBe(2);
  });

  it('returns 0 for an inverted range rather than counting backwards', () => {
    expect(tradingDaysBetween('2026-10-06', '2026-09-30')).toBe(0);
  });

  it('returns 0 for missing input', () => {
    expect(tradingDaysBetween('', '2026-10-06')).toBe(0);
    expect(tradingDaysBetween('2026-10-06', '')).toBe(0);
  });

  it('still counts weekends out in a year the holiday list does NOT cover', () => {
    /* HOLIDAY_YEARS is regenerated every January and only ever holds the current
       year, so a date outside it falls back to weekends only. Worth asserting:
       the readiness figure must stay usable rather than becoming a calendar-day
       count the moment the year rolls over. */
    expect(HOLIDAY_YEARS).not.toContain('2027');
    // Mon 4 Jan 2027 → Fri 8 Jan 2027: five weekdays, no listed holidays known
    expect(tradingDaysBetween('2027-01-04', '2027-01-08')).toBe(5);
    expect(tradingDaysBetween('2027-01-04', '2027-01-10')).toBe(5); // + a weekend
  });
});
