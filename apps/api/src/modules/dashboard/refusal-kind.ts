/**
 * What a refused partner API call means, and so which fix the dashboard offers.
 * Its own file with no imports so a test can reach it — the service pulls in
 * AdminService, which the test compiler cannot load.
 */
export type RefusalKind = 'print-off' | 'not-in-catalogue' | 'api-off' | 'scope' | 'limit' | 'other';

/** What a refused partner call means, and so what fixes it. */
export function refusalKind(error: string | null | undefined, httpStatus: number): { kind: RefusalKind; symbol: string | null } {
  const e = String(error ?? '');
  let m = e.match(/printing is not enabled for ([A-Z0-9&.-]+)/i);
  if (m) return { kind: 'print-off', symbol: m[1].toUpperCase() };
  m = e.match(/IPO '([^']+)' not found/i);
  if (m) return { kind: 'not-in-catalogue', symbol: m[1].toUpperCase() };
  if (/API access is not enabled/i.test(e)) return { kind: 'api-off', symbol: null };
  if (/scope/i.test(e) && httpStatus === 403) return { kind: 'scope', symbol: null };
  if (/limit|too many/i.test(e) || httpStatus === 429) return { kind: 'limit', symbol: null };
  return { kind: 'other', symbol: null };
}
