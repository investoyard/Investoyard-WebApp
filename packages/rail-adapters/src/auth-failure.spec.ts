import { RailError } from './rail-adapter.types';
import { authFailureReason, isAuthFailure } from './auth-failure';

describe('isAuthFailure — a rejected login, and nothing else', () => {
  it('BSE asking for a password change (the 2026-11-23 MAHACOAL case)', () => {
    expect(isAuthFailure(new RailError('Change Password', 'BSE_IBBS', '101', undefined, { message: 'Change Password', errorcode: '101' }))).toBe(true);
  });

  it('NSE login refused', () => {
    expect(isAuthFailure(new RailError('Invalid Id/Password', 'NSE_EIPO', undefined, undefined, { status: 'failed', reason: 'Invalid Id/Password' }))).toBe(true);
  });

  it('HTTP 401 / 403 from a Basic-auth endpoint', () => {
    expect(isAuthFailure(new RailError('HTTP 401 from https://x/catwise', 'NSE_EIPO', undefined, 401, {}))).toBe(true);
    expect(isAuthFailure(new RailError('HTTP 403 from https://x', 'NSE_EIPO', undefined, 403, {}))).toBe(true);
  });

  it('expired or locked accounts', () => {
    expect(isAuthFailure(new RailError('Your password has expired', 'BSE_IBBS'))).toBe(true);
    expect(isAuthFailure(new RailError('User ID is locked', 'NSE_EIPO'))).toBe(true);
  });

  it('never a network failure, a timeout or a server error', () => {
    expect(isAuthFailure(new RailError('Request timed out after 15000ms', 'NSE_EIPO', 'TIMEOUT'))).toBe(false);
    expect(isAuthFailure(new RailError('getaddrinfo ENOTFOUND', 'BSE_IBBS', 'NETWORK'))).toBe(false);
    expect(isAuthFailure(new RailError('HTTP 502 from https://x', 'NSE_EIPO', undefined, 502, {}))).toBe(false);
    expect(isAuthFailure(new RailError('Non-JSON response (500)', 'NSE_EIPO', undefined, 500, '<html>'))).toBe(false);
  });

  it('not a business refusal about a bid', () => {
    expect(isAuthFailure(new RailError('Symbol not open for bidding', 'NSE_EIPO', 'E12'))).toBe(false);
    expect(isAuthFailure(new Error('Unsupported state or unable to authenticate data'))).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
  });

  it('gives the exchange’s own words as the reason', () => {
    expect(authFailureReason(new RailError('BSE message login failed', 'BSE_IBBS', '101', undefined, { message: 'Change Password' }))).toBe('Change Password');
  });
});
