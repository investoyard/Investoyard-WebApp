import { activeOnlineSeries, mayAcceptBid, nextSeriesNumber } from './bidGate';

/* Every instant below is ABSOLUTE (UTC), so these hold whatever timezone the
   machine runs in — TZ has no effect on Node on this box, and a test that
   depends on it proves nothing. 10:00 IST is 04:30Z, 17:00 IST is 11:30Z. */
const at = (iso: string) => new Date(iso).getTime();

/* Fri 20 Nov 2026 → Wed 25 Nov 2026. Sat 21 / Sun 22 are a weekend and
   Tue 24 Nov is an NSE holiday (Prakash Gurpurb), so this window exercises
   both kinds of closed day. */
const IPO = { openDate: '2026-11-20', closeDate: '2026-11-25', extra: { startBid: true } };

describe('mayAcceptBid', () => {
  it('refuses when the operator has not started bidding', () => {
    const r = mayAcceptBid({ ...IPO, extra: { startBid: false } }, at('2026-11-20T06:00:00Z'));
    expect(r).toEqual({ ok: false, reason: 'Bidding has not been started for this IPO yet.' });
    expect(mayAcceptBid({ ...IPO, extra: {} }, at('2026-11-20T06:00:00Z')).ok).toBe(false);
    expect(mayAcceptBid({ ...IPO, extra: null }, at('2026-11-20T06:00:00Z')).ok).toBe(false);
  });

  it('refuses an issue with no dates', () => {
    const r = mayAcceptBid({ closeDate: '2026-11-25', extra: { startBid: true } }, at('2026-11-20T06:00:00Z'));
    expect(r).toEqual({ ok: false, reason: 'This IPO has no bidding dates set.' });
  });

  it('refuses before the opening instant and says when it opens', () => {
    const r = mayAcceptBid(IPO, at('2026-11-20T04:00:00Z')); // 09:30 IST
    expect(r).toEqual({ ok: false, reason: 'Bidding for this IPO opens on 2026-11-20 at 10:00 IST.' });
  });

  it('accepts inside the window on a trading day', () => {
    expect(mayAcceptBid(IPO, at('2026-11-20T06:00:00Z'))).toEqual({ ok: true }); // Fri 11:30 IST
    expect(mayAcceptBid(IPO, at('2026-11-23T11:29:00Z'))).toEqual({ ok: true }); // Mon 16:59 IST
  });

  it('refuses on a weekend and on an NSE holiday inside the window', () => {
    const closed = { ok: false, reason: 'Bids are not accepted today — the market is closed.' };
    expect(mayAcceptBid(IPO, at('2026-11-21T06:00:00Z'))).toEqual(closed); // Sat
    expect(mayAcceptBid(IPO, at('2026-11-24T06:00:00Z'))).toEqual(closed); // Tue, Prakash Gurpurb
  });

  it('refuses outside the daily hours on a middle day', () => {
    const r = mayAcceptBid(IPO, at('2026-11-23T12:00:00Z')); // Mon 17:30 IST
    expect(r).toEqual({ ok: false, reason: 'Bids are accepted between 10:00 and 17:00 IST.' });
  });

  it('refuses after the closing instant', () => {
    const r = mayAcceptBid(IPO, at('2026-11-25T11:31:00Z')); // Wed 17:01 IST, close day
    expect(r).toEqual({ ok: false, reason: 'Bidding for this IPO has closed.' });
  });

  it("honours the operator's own closing hour, and widens the daily window with it", () => {
    const late = { ...IPO, extra: { startBid: true, closeDate: '2026-11-25T19:00' } };
    expect(mayAcceptBid(late, at('2026-11-25T13:00:00Z'))).toEqual({ ok: true }); // close day 18:30 IST
    expect(mayAcceptBid(late, at('2026-11-23T13:00:00Z'))).toEqual({ ok: true }); // middle day 18:30 IST
    expect(mayAcceptBid(late, at('2026-11-25T13:31:00Z'))).toEqual({ ok: false, reason: 'Bidding for this IPO has closed.' });
  });

  it('never blocks on a weekend in a year the holiday calendar does not cover', () => {
    const next = { openDate: '2027-01-08', closeDate: '2027-01-12', extra: { startBid: true } };
    expect(mayAcceptBid(next, at('2027-01-09T06:00:00Z'))).toEqual({ ok: true }); // Sat 9 Jan 2027
  });
});

describe('activeOnlineSeries', () => {
  // JPL as stored
  const JPL = {
    onlineSeries: [{ to: '48343000', from: '48313001', active: true, member: 'Dam Capital Advisors Limited (Formerly Idfc Securities Limited)', exchange: 'NSE' }],
  };

  it('returns the active row', () => {
    expect(activeOnlineSeries(JPL)?.member).toBe('Dam Capital Advisors Limited (Formerly Idfc Securities Limited)');
    expect(activeOnlineSeries(JPL)?.from).toBe('48313001');
  });

  it('returns null when no row is active or there is no member', () => {
    expect(activeOnlineSeries({ onlineSeries: [{ ...JPL.onlineSeries[0], active: false }] })).toBeNull();
    expect(activeOnlineSeries({ onlineSeries: [{ ...JPL.onlineSeries[0], member: '  ' }] })).toBeNull();
    expect(activeOnlineSeries({})).toBeNull();
    expect(activeOnlineSeries(null)).toBeNull();
  });
});

describe('nextSeriesNumber', () => {
  it('starts at `from` when nothing is used', () => {
    expect(nextSeriesNumber([], '48313001', '48343000')).toBe('48313001');
  });

  it('takes one above the highest number used inside the range', () => {
    expect(nextSeriesNumber(['48313001', '48313005', null, '48313002'], '48313001', '48343000')).toBe('48313006');
  });

  it('ignores numbers outside the range and non-numbers', () => {
    expect(nextSeriesNumber(['131816999', 'ABC', '48312000', '48313001'], '48313001', '48343000')).toBe('48313002');
  });

  it('returns null when the range is used up', () => {
    expect(nextSeriesNumber(['48343000'], '48313001', '48343000')).toBeNull();
  });

  it('returns null when `from` is missing or not a number', () => {
    expect(nextSeriesNumber([], null, '10')).toBeNull();
    expect(nextSeriesNumber([], '', '10')).toBeNull();
    expect(nextSeriesNumber([], 'X1', '10')).toBeNull();
  });

  it('has no ceiling when `to` is blank', () => {
    expect(nextSeriesNumber(['999999'], '100', '')).toBe('1000000');
  });
});
