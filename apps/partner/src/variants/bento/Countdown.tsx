'use client';

import { useEffect, useState } from 'react';

/* Client-only: a time baked into static HTML is wrong by the time anyone reads it. The server renders an empty frame. */
export default function Countdown({ at, label, secs = false }: { at: number; label: string; secs?: boolean }) {
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
  ];
  if (secs) cells.push([s == null ? null : s % 60, 'Secs']);
  return (
    <div className="b-cd">
      <p className="b-cd-l">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" /></svg>
        {label}
      </p>
      <div className={`b-cd-row n${cells.length}`} role="timer" aria-live="off">
        {cells.map(([n, u]) => <div key={u}><strong className="num">{n == null ? ' ' : String(n).padStart(2, '0')}</strong><span>{u}</span></div>)}
      </div>
    </div>
  );
}
