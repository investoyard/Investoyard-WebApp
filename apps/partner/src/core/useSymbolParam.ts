'use client';

import { useEffect } from 'react';

/*
 * investoyard.com links a single issue's subscription as /subscription/v2?symbol=X.
 * A design with an IPO picker preselects that issue, so the old address still
 * opens on the IPO it named. Read after mount: the export is static, so the
 * query string does not exist when the page is built.
 */
export function useSymbolParam(known: readonly string[], select: (sym: string) => void) {
  useEffect(() => {
    let want = '';
    try { want = (new URLSearchParams(window.location.search).get('symbol') || '').trim().toUpperCase(); } catch { /* no query */ }
    if (!want) return;
    const hit = known.find((s) => s.toUpperCase() === want);
    if (hit) select(hit);
    // Once, on arrival; later picks are the reader's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
