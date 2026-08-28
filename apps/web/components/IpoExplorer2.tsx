'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoListItem } from '@/lib/api';
import { IpoCard } from '@/components/IpoCard';
import { IpoCompareTable } from '@/components/IpoCompareTable';
import { GmpNotice } from '@/components/GmpNotice';
import { Icon } from '@/components/Icon';
import { useTenant } from '@/components/TenantProvider';
import { Lang } from '@investoyard/i18n';
import { compareForList, isRecent } from '@investoyard/shared-types';

const VIEW_KEY = 'investoyard.ipoView';

type TypeFilter = 'all' | 'mainboard' | 'sme';
type StatusFilter = 'all' | 'open' | 'upcoming' | 'closed';

const dayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/**
 * IPO explorer — the /home2 candidate.
 *
 * Three stacked bands (today strip · status tabs · board pills + search + view)
 * collapse into TWO: a market bar carrying the date, today's counts and the
 * four hub links, then a single filter line.
 *
 * The hub links are the point of the exercise: Live Subscription, Exp. Premium,
 * Allotment and Calendar are the most-visited pages, and reaching them via the
 * top menu is a wasted hop from the one page everybody lands on. Ours carry a
 * LIVE signal each — hottest subscription, top premium, events today — which a
 * plain link row cannot. They stay in the top menu as well for now.
 */
export function IpoExplorer2({ ipos: initial, lang = 'en' }: { ipos: IpoListItem[]; lang?: Lang }) {
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const tenant = useTenant();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [live, setLive] = useState<IpoListItem[] | null>(null);
  const [view, setView] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    getIpos().then((r) => { if (Array.isArray(r) && r.length) setLive(r); }).catch(() => {});
    const p = new URLSearchParams(window.location.search);
    const f = p.get('f'); const b = p.get('board');
    if (f === 'open' || f === 'upcoming' || f === 'closed') setStatus(f);
    if (b === 'mainboard' || b === 'sme') setType(b);
    const saved = (() => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } })();
    if (saved === 'cards' || saved === 'table') setView(saved);
  }, []);

  const pickView = (v: 'cards' | 'table') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode — session-only */ }
  };
  const ipos = live ?? initial;
  const today = dayIso();

  const counts = useMemo(() => ({
    open: (ipos as any[]).filter((i) => i.status === 'open').length,
    closing: (ipos as any[]).filter((i) => i.status === 'open' && i.closeDate === today).length,
    allotment: (ipos as any[]).filter((i) => i.allotmentDate === today).length,
    listing: (ipos as any[]).filter((i) => i.listingDate === today).length,
  }), [ipos, today]);

  /** Live signals for the hub chips — the same derivation the nav uses, taken
   *  from the catalog already in hand rather than a second request. */
  const sig = useMemo(() => {
    const all = ipos as any[];
    const open = all.filter((i) => i.status === 'open');
    const gmps = all.filter((i) => i.status === 'open' || i.status === 'upcoming')
      .map((i) => i.gmpPct ?? i.gmp).filter((n: any): n is number => n != null);
    const xs = open.map((i) => i.subscriptionTimes).filter((n: any): n is number => n != null);
    return {
      topGmp: gmps.length ? Math.max(...gmps) : null,
      hotX: xs.length ? Math.max(...xs) : null,
      todayEvents: all.reduce((n, i) =>
        n + [i.openDate, i.closeDate, i.allotmentDate, i.listingDate].filter((d) => d === today).length, 0),
    };
  }, [ipos, today]);

  /**
   * Everything matching the CURRENT status and search, before the board filter
   * is applied — the board control's counts are faceted off this, so "SME 4"
   * means four SME issues in what you are looking at right now, not four in the
   * whole catalog. Filtering by board then narrows this same set.
   */
  const { filtered, olderCount, boardCounts } = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const matches = (ipos as any[]).filter((i) => {
      if (status === 'closed' ? !(i.status === 'closed' || i.status === 'listed')
        : status !== 'all' && i.status !== status) return false;
      if (ql && !(`${i.name} ${i.symbol}`.toLowerCase().includes(ql))) return false;
      return true;
    });
    // a search reaches the whole catalog; browsing stays in the recent window
    const inWindow = ql ? matches : matches.filter((i) => isRecent(i));
    const ofType = inWindow.filter((i) => type === 'all' || i.type === type);
    return {
      filtered: [...ofType].sort(compareForList),
      olderCount: matches.filter((i) => type === 'all' || i.type === type).length - ofType.length,
      boardCounts: {
        all: inWindow.length,
        mainboard: inWindow.filter((i) => i.type === 'mainboard').length,
        sme: inWindow.filter((i) => i.type === 'sme').length,
      },
    };
  }, [ipos, query, type, status]);

  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  // Counting a status is also a way to filter by it — clicking a count applies
  // the matching filter rather than being decoration.
  // `short` is the rail label — four columns in ~300px cannot carry
  // "Allotment today", and the full phrase stays in the title attribute.
  const pulses: { n: number; label: string; short: string; dot: string; onClick?: () => void; href?: string }[] = [
    { n: counts.open, label: 'Open now', short: 'Open', dot: 'pos', onClick: () => { setStatus('open'); setQuery(''); } },
    { n: counts.closing, label: 'Closing today', short: 'Closing', dot: 'gold', onClick: () => { setStatus('open'); setQuery(''); } },
    { n: counts.allotment, label: 'Allotment today', short: 'Allotment', dot: 'brand', href: `/allotment${q}` },
    { n: counts.listing, label: 'Listing today', short: 'Listing', dot: 'faint', href: `/calendar${q}` },
  ];

  /**
   * The two chips carrying LIVE numbers get a pastel skin and one small motion
   * each, so they read as instruments rather than links: subscription pulses
   * like a heartbeat, the premium ticks upward. Allotment and Calendar are
   * plain destinations and stay quiet — if everything animates, nothing does.
   */
  const hubs: {
    href: string; label: string; icon: 'chart' | 'trending';
    sig?: string; skin: string; pulse?: boolean; note: string; empty: string; cta: string;
  }[] = [
    {
      href: `/subscription${q}`, label: 'Live Subscription', icon: 'chart',
      sig: sig?.hotX != null ? `${sig.hotX}×` : undefined, skin: 'live', pulse: true,
      note: 'Most subscribed, live', empty: 'No live demand yet',
      cta: 'See every issue',
    },
    ...(tenant.flags.gmpEnabled
      ? [{
          href: `/gmp${q}`, label: 'Exp. Premium', icon: 'trending' as const,
          sig: sig?.topGmp != null && sig.topGmp > 0 ? `+${sig.topGmp}%` : undefined,
          skin: 'prem', note: 'Highest on an open issue', empty: 'None on an open issue',
          cta: 'See all premiums',
        }]
      : []),
  ];

  return (
    <section id="ipos">
      <GmpNotice />

      {/* ── the hub strip, lifted out of the rail to sit under the banner ──
          Same two groups, same skins, same markup — only the axis changes, so
          the two live instruments stay loud and the two destinations stay
          quiet. Full width they get ~4x the room they had at 304px. */}
      <div className="h2-strip">
        <div className="sd-group">
          {hubs.filter((h) => h.skin).map((h) => (
            <a key={h.href} className={`sd-btn ${h.skin}`} href={h.href} title={h.sig ? h.note : h.empty}>
              {h.pulse ? <span className="mkt-live" aria-hidden /> : <Icon name={h.icon} size={15} />}
              <span className="t">{h.label}</span>
              {h.sig && <em className="v">{h.sig}</em>}
              <Icon name="chevron-right" size={15} />
            </a>
          ))}
        </div>
        <div className="sd-links">
          <a href={`/calendar${q}`}><Icon name="calendar" size={15} /> IPO Calendar <Icon name="arrow-right" size={13} /></a>
          <a href={`/allotment${q}`}><Icon name="receipt" size={15} /> Allotment <Icon name="arrow-right" size={13} /></a>
        </div>
      </div>

      {/* ── every filter on one line, full width above the split ── */}
      <div className="flt-bar">
        {/* Status is a pill TRACK carrying the same semantic dots as the cards'
            status chips. The board control below is a bordered meter — two
            different objects, so neither can be mistaken for the other. */}
        <div className="flt-status" role="tablist" aria-label="IPO status">
          {([
            { k: 'all', label: 'All', dot: '' },
            { k: 'open', label: 'Open', dot: 'pos' },
            { k: 'upcoming', label: 'Upcoming', dot: 'gold' },
            { k: 'closed', label: 'Closed', dot: 'faint' },
          ] as { k: StatusFilter; label: string; dot: string }[]).map((s) => (
            <button key={s.k} type="button" className={status === s.k ? 'on' : ''} onClick={() => setStatus(s.k)}>
              {s.dot && <i className={`d-${s.dot}`} aria-hidden />}{s.label}
            </button>
          ))}
        </div>
        {/* Board is a SEGMENTED METER, not another row of pills: one bordered
            bar, hard dividers, a count per segment and a coloured cap over the
            active one. Different object, and the counts tell you whether a
            board is worth opening before you open it. */}
        <div className="brd-bar" role="group" aria-label="Board">
          {([
            { k: 'all', label: 'All', n: boardCounts.all },
            { k: 'mainboard', label: 'Mainboard', n: boardCounts.mainboard },
            { k: 'sme', label: 'SME', n: boardCounts.sme },
          ] as { k: TypeFilter; label: string; n: number }[]).map((b) => (
            <button
              key={b.k}
              type="button"
              className={`brd-seg b-${b.k}${type === b.k ? ' on' : ''}${b.n === 0 ? ' empty' : ''}`}
              onClick={() => setType(b.k)}
              aria-pressed={type === b.k}
            >
              <span className="l">{b.label}</span>
              <span className="n">{b.n}</span>
            </button>
          ))}
        </div>
        <div className="search flt-search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or symbol…" aria-label="Search IPOs" />
        </div>
        <div className="viewseg flt-view" role="group" aria-label="Layout">
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => pickView('table')} aria-pressed={view === 'table'}>
            <Icon name="list" size={15} /> Table
          </button>
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => pickView('cards')} aria-pressed={view === 'cards'}>
            <Icon name="layers" size={15} /> Cards
          </button>
        </div>
      </div>

      {/* Cards sit beside a rail; the comparison table takes the full width —
          it is the dense view, and squeezing it only forces more sideways
          scrolling through columns the reader came to compare. */}
      <div className={`h2-grid${view === 'table' ? ' full' : ''}`}>
        <div className="h2-main">
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="emoji">🔍</div>
              <h3>No IPOs match</h3>
              <p className="muted">Try clearing the search or switching filters.</p>
            </div>
          ) : view === 'table' ? (
            <IpoCompareTable ipos={filtered as any} lang={lang} shortNames />
          ) : (
            <div className="ipo-list two-up">
              {filtered.map((i) => <IpoCard key={i.id} ipo={i as any} lang={lang} v2 />)}
            </div>
          )}
        </div>

        {view !== 'table' && (
          <aside className="h2-side" aria-label="Today at a glance">
            {/* The hub group and the destination links now live in the strip
                under the banner; repeating them here would be the same four
                links twice on one screen. */}

            {/* today, as an instrument panel rather than a sentence */}
            <div className="sd-today">
              <span className="sd-th"><i>Today</i><b>{dateLabel}</b></span>
              <div className="sd-counts">
                {pulses.map((p) => {
                  const inner = <><b className={`sd-n d-${p.dot}`}>{p.n}</b><span>{p.short}</span></>;
                  return p.href
                    ? <a key={p.label} className={`sd-count${p.n === 0 ? ' dim' : ''}`} href={p.href} title={p.label}>{inner}</a>
                    : <button key={p.label} type="button" className={`sd-count${p.n === 0 ? ' dim' : ''}`} onClick={p.onClick} title={p.label}>{inner}</button>;
                })}
              </div>
            </div>

            <AppTeaser />
          </aside>
        )}
      </div>

      {olderCount > 0 && (
        <div className="archive-cta">
          <span><b>{olderCount.toLocaleString('en-IN')}</b> older {olderCount === 1 ? 'issue' : 'issues'} aren&apos;t shown here.</span>
          <a className="btn btn-secondary btn-sm" href="/ipos/archive">Browse IPO archive <Icon name="arrow-right" size={14} /></a>
        </div>
      )}
    </section>
  );
}

/**
 * Android app teaser — the rail's only promotional block, so it sits last and
 * stays quiet.
 *
 * Deliberately NOT a link and NOT hoverable: the app isn't published yet, and a
 * card that looks clickable but goes nowhere is worse than no card. When the
 * listing goes live this becomes an <a> to Play and the affordance arrives with
 * it.
 *
 * The phone and the app icon are drawn inline rather than shipped as mockup
 * images — they stay sharp at any density, cost no request, and show OUR
 * interface instead of a generic device shot.
 *
 * No third-party artwork by design: the squircle IS the universal "this is an
 * app" signal, so we do not need Google's robot or the Play badge — and
 * therefore carry none of their attribution or brand-usage conditions. Swap in
 * the real Play badge on the day there is a listing behind it.
 */
function AppTeaser() {
  return (
    <div className="sd-app" role="note" aria-label="Investoyard Android app — coming soon">
      <div className="sd-app-copy">
        <span className="sd-app-eyebrow">Android app</span>
        <b>Investoyard on mobile</b>
        <span className="sd-app-sub">Apply and track allotment on the move.</span>
        <span className="sd-app-chip">Coming soon</span>
      </div>

      <span className="sd-app-art" aria-hidden>
        {/* the app icon, sitting on the phone the way an installed icon does.
            Ascending candles are the banner's own motif, so the tile reads as
            Investoyard rather than as a generic app square. */}
        <svg className="sd-app-icon" viewBox="0 0 56 56" focusable="false">
          <defs>
            <linearGradient id="iy-ai" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5343ad" />
              <stop offset="1" stopColor="#2b2160" />
            </linearGradient>
          </defs>
          <rect width="56" height="56" rx="15" fill="url(#iy-ai)" />
          <rect x="13" y="31" width="7" height="12" rx="2.4" fill="#fff" opacity=".5" />
          <rect x="24.5" y="24" width="7" height="19" rx="2.4" fill="#fff" opacity=".78" />
          <rect x="36" y="14" width="7" height="29" rx="2.4" fill="#FFCB32" />
        </svg>
        {/* a miniature of the app's Home tab, bled off the bottom-right corner */}
        <svg className="sd-app-phone" viewBox="0 0 78 150" focusable="false">
        <defs>
          <clipPath id="scr"><rect x="4" y="4" width="70" height="142" rx="9" /></clipPath>
        </defs>
        <rect x="1" y="1" width="76" height="148" rx="12.5" fill="#241c4e" />
        <rect x="4" y="4" width="70" height="142" rx="9" fill="#F7F5FD" />
        <g clipPath="url(#scr)">
          <rect x="29" y="6.5" width="20" height="3.2" rx="1.6" fill="#241c4e" />
          {/* header: wordmark + the Live Subscription pill */}
          <rect x="10" y="16" width="22" height="4" rx="2" fill="#3c2e7e" />
          <rect x="48" y="14.5" width="20" height="7" rx="3.5" fill="#E4F6EC" />
          <circle cx="52.5" cy="18" r="1.6" fill="#2fbd7e" />
          {/* search pill */}
          <rect x="10" y="26" width="58" height="8" rx="4" fill="#fff" stroke="#E4E0F2" strokeWidth=".8" />
          {/* two IPO cards, with the board tint and a gold CTA */}
          {[42, 88].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="58" height="40" rx="5" fill="#fff" stroke="#E7E0FF" strokeWidth=".8" />
              <rect x="14" y={y + 5} width="9" height="9" rx="2.5" fill="#CBBFFF" />
              <rect x="26" y={y + 6} width="24" height="3.2" rx="1.6" fill="#3b3370" />
              <rect x="26" y={y + 11} width="14" height="2.6" rx="1.3" fill="#c3bdd8" />
              <rect x="14" y={y + 19} width="18" height="2.6" rx="1.3" fill="#d8d3e8" />
              <rect x="14" y={y + 24} width="26" height="2.6" rx="1.3" fill="#d8d3e8" />
              <rect x="46" y={y + 19} width="18" height="12" rx="3" fill="#FFCB32" />
            </g>
          ))}
        </g>
        </svg>
      </span>
    </div>
  );
}
