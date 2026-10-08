import { mapDpStatus, mapUpiStatus, UPI_STATUS_LABEL, upiStatusLabel, UpiPaymentStatus } from './rail-callback.dto';

describe('mapDpStatus', () => {
  it('maps DP flags', () => {
    expect(mapDpStatus('S')).toBe('dp_verified');
    expect(mapDpStatus('F')).toBe('dp_failed');
    expect(mapDpStatus('P')).toBe('submitted');
  });
});

describe('mapUpiStatus', () => {
  it('treats Accepted-by-Investor (100) as funds blocked / confirmed', () => {
    expect(mapUpiStatus(UpiPaymentStatus.ACCEPTED_BY_INVESTOR)).toEqual({
      status: 'upi_blocked',
      failed: false,
    });
  });

  it('treats sent / sponsor-accepted as still pending', () => {
    expect(mapUpiStatus(0).status).toBe('mandate_pending');
    expect(mapUpiStatus(10).status).toBe('mandate_pending');
  });

  it('treats block-released (110) as released, not failed', () => {
    expect(mapUpiStatus(110)).toEqual({ status: 'released', failed: false });
  });

  it.each([1, 11, 12, 13, 21, 22, 31])('treats %i as a terminal rejection', (code) => {
    expect(mapUpiStatus(code)).toEqual({ status: 'rejected', failed: true });
  });

  it('defaults unknown codes to pending (non-terminal)', () => {
    expect(mapUpiStatus(999)).toEqual({ status: 'mandate_pending', failed: false });
  });
});

describe('upiStatusLabel', () => {
  it('has the exchange wording for every code in the enum', () => {
    const codes = Object.values(UpiPaymentStatus).filter((v) => typeof v === 'number') as number[];
    expect(codes.length).toBe(11);
    for (const c of codes) expect(upiStatusLabel(c)).toBeTruthy();
    expect(Object.keys(UPI_STATUS_LABEL)).toHaveLength(codes.length);
  });

  it('is verbatim from NSE WEB API v1.20.5, including its capitalisation', () => {
    expect(upiStatusLabel(0)).toBe('Request Sent');
    expect(upiStatusLabel(10)).toBe('Request Accepted By Sponsor Bank');
    expect(upiStatusLabel(11)).toBe('Rejected due to invalid UPI');
    expect(upiStatusLabel(100)).toBe('Accepted by Investor');
    expect(upiStatusLabel(110)).toBe('Block Released (Due to cancellation of order)');
  });

  it('separates the three rejections our own status cannot tell apart', () => {
    // All three map to `rejected`, and the investor's next step differs in each:
    // re-apply, fix the UPI ID, or take it up with the bank.
    for (const c of [31, 11, 12]) expect(mapUpiStatus(c).status).toBe('rejected');
    expect(upiStatusLabel(31)).toBe('Rejected by Investor');
    expect(upiStatusLabel(11)).toBe('Rejected due to invalid UPI');
    expect(upiStatusLabel(12)).toBe('Rejected by Sponsor Bank');
  });

  it('returns null for an unknown code rather than inventing wording', () => {
    // `mapUpiStatus` keeps an unknown code non-terminal, so the bid is fine and
    // the UI falls back to our own status line.
    expect(upiStatusLabel(47)).toBeNull();
    expect(mapUpiStatus(47).status).toBe('mandate_pending');
  });
});
