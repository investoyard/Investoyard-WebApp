'use client';

import { useEffect, useState } from 'react';

/*
 * Client-only: a time baked into static HTML is wrong by the time anyone reads
 * it, and the difference would be a hydration mismatch. The server render is
 * an empty frame of the same size.
 */
export default function Countdown({ at, label }: { at: number; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = now == null ? null : Math.floor(Math.max(0, at - now) / 1000);
  const cells: [number | null, string][] = [
    [s == null ? null : Math.floor(s / 86400), 'Days'],
    [s == null ? null : Math.floor((s % 86400) / 3600), 'Hours'],
    [s == null ? null : Math.floor((s % 3600) / 60), 'Mins'],
    [s == null ? null : s % 60, 'Secs'],
  ];
  return (
    <div className="h-cd">
      <p className="h-cd-l">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" /></svg>
        {label}
      </p>
      <div className="h-cd-row" role="timer" aria-live="off">
        {cells.map(([n, u]) => (
          <div key={u}><strong className="num">{n == null ? ' ' : String(n).padStart(2, '0')}</strong><span>{u}</span></div>
        ))}
      </div>
    </div>
  );
}
