'use client';
import { useEffect, useState } from 'react';
import type { IpoFull } from '@/lib/api';
import { Icon } from '@/components/Icon';

/** Animated countdown dial (client-only). Shared by the listing card and the detail hero. */
export function CountdownDial({ ipo }: { ipo: IpoFull }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const C = 2 * Math.PI * 23;
  const ring = (frac: number, color: string, big: string, small: string) => (
    <div className="ic-ring">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="23" fill="none" stroke="var(--bg-2)" strokeWidth="5" />
        <circle cx="28" cy="28" r="23" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.04, Math.min(1, frac)))} transform="rotate(-90 28 28)" className="arc" />
      </svg>
      <div className="rc"><b style={{ color }}>{big}</b><span>{small}</span></div>
    </div>
  );

  if (ipo.status === 'listed') {
    return (
      <div className="ic-ring listed">
        <svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" fill="none" stroke="var(--pos-soft)" strokeWidth="5" /></svg>
        <div className="rc"><b style={{ color: 'var(--pos)' }}><Icon name="check" size={16} strokeWidth={3} /></b><span>LISTED</span></div>
      </div>
    );
  }
  const target = ipo.status === 'open' ? ipo.closeDate : ipo.openDate;
  if (!target) return null;
  const end = new Date(target + 'T17:00:00').getTime();
  if (now === null) return ring(1, 'var(--brand)', '—', ipo.status === 'open' ? 'LEFT' : 'TO OPEN');

  const diff = end - now;
  if (diff <= 0) return ring(1, 'var(--brand)', ipo.status === 'open' ? 'LIVE' : 'SOON', ipo.status === 'open' ? 'BIDDING' : 'OPENS');

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const days = ipo.status === 'open' ? diff / 86400000 : 99;
  const color = days < 1 ? 'var(--neg)' : days < 2 ? 'var(--gold-600)' : 'var(--brand)';
  const win = 7 * 86400000;
  const frac = diff / win;
  const [big, small] = d > 0 ? [`${d}d`, `${h}h ${ipo.status === 'open' ? 'left' : 'to open'}`]
    : h > 0 ? [`${h}h`, `${String(m).padStart(2, '0')}m`]
      : [`${m}m`, `${String(s).padStart(2, '0')}s`];
  return ring(frac, color, big, small);
}
