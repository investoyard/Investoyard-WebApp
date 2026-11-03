'use client';
import { useEffect, useMemo, useState } from 'react';
import { istDateLabel, istToday } from '@investoyard/shared-types';
import { getIpos, type IpoFull } from '@/lib/api';

/**
 * Today strip — the market's pulse in one calm line: Open now · Closing today ·
 * Allotment today · Listing today. Display-font counters with a semantic dot
 * each; zero-states stay visible but dimmed (the strip reads as a steady
 * instrument, not an alert bar). Counts refresh client-side from the live
 * catalog; each segment links to where that number lives.
 */

/* TODAY IN IST. Was the reader calendar — see `istToday` in shared-types. */
const dayIso = () => istToday();

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

  /* CLIENT-ONLY, and in IST. Evaluated during render this baked the BUILD
     day's label into the static export and disagreed with the client on every
     later day - React #418, then #423 and a full client re-render of the whole
     page. Null on the first render so server and client agree; the date
     appears a tick later. Same shape as IpoCard's OpensIn. */
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  useEffect(() => { setDateLabel(istDateLabel()); }, []);
  const items: { n: number; label: string; dot: string; href: string }[] = [
    { n: counts.open, label: 'Open now', dot: 'live', href: '#ipos' },
    { n: counts.closing, label: 'Closing today', dot: 'closing', href: '#ipos' },
    { n: counts.allotment, label: 'Allotment today', dot: 'allotment', href: `/portfolio${langQuery}` },
    { n: counts.listing, label: 'Listing today', dot: 'listed', href: `/calendar${langQuery}` },
  ];

  return (
    <section className="today-strip fade-up" aria-label="Today in IPOs">
      <span className="ts-head">Today <b>{dateLabel}</b></span>
      {items.map((it) => (
        <a key={it.label} href={it.href} className={`ts-item${it.n === 0 ? ' dim' : ''}`}>
          <b className="mono">{it.n}</b>
          <span className="ts-lbl"><i className={`ts-dot t-${it.dot}`} />{it.label}</span>
        </a>
      ))}
    </section>
  );
}
