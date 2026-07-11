import { mapDpStatus, mapUpiStatus, UpiPaymentStatus } from './rail-callback.dto';

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
