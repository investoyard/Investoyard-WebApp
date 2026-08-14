'use client';
import { useEffect, useState } from 'react';
import { getIpoDetail, type IpoFull } from '@/lib/api';
import { PrintFlow } from '@/components/PrintFlow';

/**
 * Client-side print fallback. IIS rewrites /print/<SYMBOL>/ here when no pre-built
 * static page exists (IPOs added after the last web build).
 */
export default function PrintLiveFallback() {
  const [ipo, setIpo] = useState<IpoFull | null>(null);
  const [state, setState] = useState<'loading' | 'notfound' | 'ok'>('loading');

  useEffect(() => {
    const m = window.location.pathname.match(/\/print\/([^/]+)/i);
    const symbol = m ? decodeURIComponent(m[1]) : '';
    if (!symbol || symbol.toLowerCase() === 'live') { setState('notfound'); return; }
    getIpoDetail(symbol)
      .then((d) => { if (d) { setIpo(d); setState('ok'); } else setState('notfound'); })
      .catch(() => setState('notfound'));
  }, []);

  if (state === 'loading') return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>Loading…</p>;
  if (state === 'notfound' || !ipo) return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>IPO not found. <a className="linklike" href="/">← All IPOs</a></p>;
  return <PrintFlow ipo={ipo} />;
}
