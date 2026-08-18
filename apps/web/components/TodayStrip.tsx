'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';

/**
 * Today strip — the market's pulse in one calm line: Open now · Closing today ·
 * Allotment today · Listing today. Display-font counters with a semantic dot
 * each; zero-states stay visible but dimmed (the strip reads as a steady
 * instrument, not an alert bar). Counts refresh client-side from the live
 * catalog; each segment links to where that number lives.
 */

const dayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function TodayStrip({ ipos: baked, langQuery = '' }: { ipos: IpoFull[]; langQuery?: string }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  const today = dayIso();
  const counts = useMemo(() => ({
    open: ipos.filter((i) => i.status === 'open').length,
    closing: ipos.filter((i) => i.status === 'open' && i.closeDate === today).length,
    allotment: ipos.filter((i) => i.allotmentDate === today).length,
    listing: ipos.filter((i) => i.listingDate === today).length,
  }), [ipos, today]);

  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const items: { n: number; label: string; dot: string; href: string }[] = [
    { n: counts.open, label: 'Open now', dot: 'pos', href: '#ipos' },
    { n: counts.closing, label: 'Closing today', dot: 'gold', href: '#ipos' },
    { n: counts.allotment, label: 'Allotment today', dot: 'brand', href: `/portfolio${langQuery}` },
    { n: counts.listing, label: 'Listing today', dot: 'faint', href: `/calendar${langQuery}` },
  ];

  return (
    <section className="today-strip fade-up" aria-label="Today in IPOs">
      <span className="ts-head">Today <b>{dateLabel}</b></span>
      {items.map((it) => (
        <a key={it.label} href={it.href} className={`ts-item${it.n === 0 ? ' dim' : ''}`}>
          <b className="mono">{it.n}</b>
          <span className="ts-lbl"><i className={`ts-dot ${it.dot}`} />{it.label}</span>
        </a>
      ))}
    </section>
  );
}
