import { RailError } from './rail-adapter.types';

/**
 * DID THE EXCHANGE REJECT OUR LOGIN? (2026-11-23)
 *
 * When BSE answered "Change Password", the subscription poller logged a warning
 * and tried again on the next sweep — every minute, every 5 seconds near a
 * close — with nothing told to anyone, and MAHACOAL published NSE's half of its
 * book only. A password the exchange has rejected must not be retried: repeated
 * wrong-password logins are how a member account gets locked. This decides
 * whether an error is that case.
 *
 * DELIBERATELY NARROW. A network failure, a timeout or a 5xx is NOT a rejected
 * password, and pausing a login on one would stop subscriptions over a blip.
 * Only an explicit refusal counts: HTTP 401/403, or the exchange's own wording
 * for a bad, expired or locked credential.
 */
const AUTH_WORDING = [
  /invalid\s*(user\s*)?(id|login|user|credential)s?\s*(\/|or|and)?\s*(password)?/i,
  /(wrong|incorrect|invalid|bad)\s+(user\s*id\s*\/?\s*)?password/i,
  /change\s+(your\s+)?password/i,
  /password\s+(has\s+)?(expired|expire)/i,
  /(account|user|login)\s*(id\s*)?(is\s+)?(locked|disabled|blocked|suspended|deactivated)/i,
  /unauthori[sz]ed/i,
  /authentication\s+failed/i,
];

export function isAuthFailure(err: unknown): boolean {
  if (!err) return false;
  const e = err as Partial<RailError> & { message?: string };
  // Transport failures are never a rejected login.
  if (e.code === 'NETWORK' || e.code === 'TIMEOUT') return false;
  if (e.httpStatus === 401 || e.httpStatus === 403) return true;
  const raw: any = (e as any).raw;
  const text = [e.message, raw?.message, raw?.reason, raw?.error, raw?.errormessage]
    .filter((x) => typeof x === 'string')
    .join(' | ');
  return AUTH_WORDING.some((re) => re.test(text));
}

/** A short, human reason for an alert, from whatever the exchange said. */
export function authFailureReason(err: unknown): string {
  const e = err as any;
  const said = [e?.raw?.message, e?.raw?.reason, e?.message].find((x) => typeof x === 'string' && x.trim());
  return String(said ?? 'Login rejected').trim().slice(0, 200);
}
