'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { statusChip } from '@/components/IpoCard';
import { useTenant } from '@/components/TenantProvider';
import { titleCase } from '@investoyard/shared-types';

/**
 * Live navigation — the menu carries a little real-time data, and IPOs opens
 * ONE command panel (quick filters left, live issues with instant Apply/Print
 * right) instead of a dropdown link list. Phone: the same items in a bottom
 * sheet. Signals stay muted unless something is genuinely live.
 *
 * The only figures here are COUNTS — live issues, events today — because a
 * count describes the whole set behind the link. GMP and Subscription used to
 * carry the highest premium and the hottest × , which is one company's number
 * wearing a site-wide label; those live on the cards, beside the issue they
 * belong to and beside the GMP disclaimer.
 */

const dayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

interface Signals {
  liveCount: number;
  todayEvents: number;
  featured: IpoFull[];
  counts: { open: number; upcoming: number; postClose: number; sme: number };
}

function computeSignals(ipos: IpoFull[]): Signals {
  const today = dayIso();
  const open = ipos.filter((i) => i.status === 'open');
  const upcoming = ipos.filter((i) => i.status === 'upcoming');
  const todayEvents = ipos.reduce((n, i) =>
    n + [i.openDate, i.closeDate, i.allotmentDate, i.listingDate].filter((d) => d === today).length, 0);
  const featured = [
    ...open,
    ...upcoming.filter((i) => { const d = i.openDate; return d != null && d <= today; }),
    ...upcoming,
  ].slice(0, 4);
  return {
    liveCount: open.length,
    todayEvents,
    featured,
    counts: {
      open: open.length,
      upcoming: upcoming.length,
      postClose: ipos.filter((i) => i.status === 'closed' || i.status === 'listed').length,
      sme: ipos.filter((i) => i.type === 'sme').length,
    },
  };
}

export function NavLive({ langQuery = '' }: { langQuery?: string }) {
  const q = langQuery;
  const pathname = usePathname();
  const tenant = useTenant();
  const [sig, setSig] = useState<Signals | null>(null);
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getIpos().then((ipos) => setSig(computeSignals(ipos as IpoFull[]))).catch(() => {});
  }, []);

  // close the panel on outside click / Escape / route change
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPanel(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(false); setSheet(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { setPanel(false); setSheet(false); }, [pathname]);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const items: { href: string; label: string; sig?: React.ReactNode }[] = [
    { href: '/news', label: 'News' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/account', label: 'Account' },
  ];

  /**
   * The four research hubs. They left the top bar and live in the IPOs panel
   * now — pinned to the BOTTOM of its right column, so their position does not
   * drift with however many issues are live that day.
   *
   * No per-issue figure rides along; a count of today's events does, because a
   * count describes the whole set behind the link.
   */
  const hubs: {
    href: string; label: string;
    icon: 'trending' | 'chart' | 'receipt' | 'calendar';
    sig?: React.ReactNode;
  }[] = [
    { href: '/gmp', label: 'GMP', icon: 'trending' },
    { href: '/subscription', label: 'Subscription', icon: 'chart' },
    { href: '/allotment', label: 'Allotment', icon: 'receipt' },
    {
      href: '/calendar', label: 'Calendar', icon: 'calendar',
      sig: sig && sig.todayEvents > 0 ? <span className="nv-sig ev">{sig.todayEvents}</span> : undefined,
    },
  ];

  const quick = [
    { href: `/?f=open${q ? `&${q.slice(1)}` : ''}#ipos`, label: 'Open now', n: sig?.counts.open },
    { href: `/?f=upcoming${q ? `&${q.slice(1)}` : ''}#ipos`, label: 'Upcoming', n: sig?.counts.upcoming },
    { href: `/?f=closed${q ? `&${q.slice(1)}` : ''}#ipos`, label: 'Closed & listed', n: sig?.counts.postClose },
    { href: `/?board=sme${q ? `&${q.slice(1)}` : ''}#ipos`, label: 'SME board', n: sig?.counts.sme },
  ];

  const ipoPanel = sig && (
    <div className="nv-panel" role="menu">
      <div className="nv-quick">
        <span className="nv-qh">Browse</span>
        {quick.map((f) => (
          <a key={f.label} href={f.href} className="nv-qlink" role="menuitem">
            {f.label}{f.n != null && <b className="mono">{f.n}</b>}
          </a>
        ))}
      </div>
      <div className="nv-live">
        <span className="nv-qh">{sig.liveCount ? 'Happening now' : 'Coming up'}</span>
        {sig.featured.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>The yard is quiet — nothing scheduled yet.</p>
        ) : sig.featured.map((ipo) => {
          const c = statusChip(ipo);
          const canApply = (ipo as any).extra?.startBid === true && (ipo.status === 'open' || ipo.status === 'upcoming');
          const canPrint = (ipo as any).extra?.startPrint === true && (ipo.status === 'open' || ipo.status === 'upcoming');
          return (
            <div className="nv-ipo" key={ipo.id}>
              <a className="nv-ipomain" href={`/ipos/${ipo.symbol}`}>
                <IpoLogo logo={(ipo as any).logo} name={ipo.name} size={28} />
                <span className="nv-iponame" title={titleCase(ipo.name)}>{titleCase(ipo.name)}</span>
                <span className={`ic-status ${c.cls}`}>{c.pulse && <span className="pd" />}{c.label}</span>
              </a>
              {canApply && <a className="nv-mini" href={`/apply/${ipo.symbol}${q}`}>Apply</a>}
              {canPrint && <a className="nv-mini print" href={`/print/${ipo.symbol}${q}`}>Print</a>}
            </div>
          );
        })}
        {/* Pinned to the BOTTOM of this column (margin-top:auto), so the row
            sits in the same place whether four issues are live or none. */}
        <div className="nv-foot">
          <a className="nv-all" href={`/${q}#ipos`}>All IPOs <Icon name="arrow-right" size={13} /></a>
          <div className="nv-hubs">
            {hubs.map((hb) => (
              <a key={hb.href} className="nv-hub" href={`${hb.href}${q}`}>
                <Icon name={hb.icon} size={14} />{hb.label}{hb.sig}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="nv" ref={wrapRef}>
      {/* desktop */}
      <nav className="nav nv-desktop" aria-label="Primary">
        <button
          type="button"
          className={`nav-link nv-ipos ${active('/') || panel ? 'active' : ''}`}
          aria-expanded={panel}
          onClick={() => setPanel((p) => !p)}
        >
          IPOs
          {sig && sig.liveCount > 0 && <span className="nv-sig live"><span className="nv-dot" />{sig.liveCount}</span>}
          <Icon name="chevron-down" size={13} style={{ opacity: .6, transform: panel ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        </button>
        {items.map((it) => (
          <a key={it.href} href={`${it.href}${q}`} className={`nav-link ${active(it.href) ? 'active' : ''}`}>
            {it.label}{it.sig}
          </a>
        ))}
      </nav>
      {panel && ipoPanel}

      {/* phone: trigger + bottom sheet */}
      <button type="button" className="nv-mtrigger mobile-only" aria-label="Menu" onClick={() => setSheet(true)}>
        <Icon name="menu" size={19} />
        {sig && sig.liveCount > 0 && <span className="nv-sig live"><span className="nv-dot" />{sig.liveCount}</span>}
      </button>
      {sheet && (
        <div className="nv-sheetwrap" onClick={() => setSheet(false)}>
          <div className="nv-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="nv-grab" />
            <a href={`/${q}`} className="nv-sheetlink">
              IPOs {sig && sig.liveCount > 0 && <span className="nv-sig live"><span className="nv-dot" />{sig.liveCount} live</span>}
            </a>
            {/* The hubs left the desktop bar but STAY here: a phone has no
                dropdown to find them in, and a sheet can afford the rows. */}
            {hubs.map((hb) => (
              <a key={hb.href} href={`${hb.href}${q}`} className="nv-sheetlink">{hb.label}{hb.sig}</a>
            ))}
            {items.map((it) => (
              <a key={it.href} href={`${it.href}${q}`} className="nv-sheetlink">{it.label}{it.sig}</a>
            ))}
            <div className="nv-sheetquick">
              {quick.map((f) => (
                <a key={f.label} href={f.href} className="nv-qlink">{f.label}{f.n != null && <b className="mono">{f.n}</b>}</a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
