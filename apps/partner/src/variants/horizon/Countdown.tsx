'use client';

import { useEffect, useState } from 'react';

/*
 * Client-only: a time baked into static HTML is wrong by the time anyone reads
 * it, and the difference would be a hydration mismatch. The server render is
 * an empty frame of the same size.
 */
export default function Countdown({ at }: { at: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = now == null ? null : Math.max(0, at - now);
  const cell = (n: number | null, unit: string) => (
    <div><strong className="num">{n == null ? ' ' : String(n).padStart(2, '0')}</strong><span>{unit}</span></div>
  );
  const s = left == null ? null : Math.floor(left / 1000);
  return (
    <div className="h-count" role="timer" aria-live="off">
      {cell(s == null ? null : Math.floor(s / 86400), 'days')}
      {cell(s == null ? null : Math.floor((s % 86400) / 3600), 'hrs')}
      {cell(s == null ? null : Math.floor((s % 3600) / 60), 'min')}
      {cell(s == null ? null : s % 60, 'sec')}
    </div>
  );
}

