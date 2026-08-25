'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoListItem } from '@/lib/api';
import { IpoCard } from '@/components/IpoCard';
import { IpoCompareTable } from '@/components/IpoCompareTable';
import { GmpNotice } from '@/components/GmpNotice';
import { Icon } from '@/components/Icon';
import { makeT, Lang } from '@investoyard/i18n';
import { compareForList, isRecent } from '@investoyard/shared-types';

const VIEW_KEY = 'investoyard.ipoView';

type TypeFilter = 'all' | 'mainboard' | 'sme';
type StatusFilter = 'all' | 'open' | 'upcoming' | 'closed'; // 'closed' = post-close phase (closed + listed)

export function IpoExplorer({ ipos: initial, lang = 'en', initialStatus = 'all', initialType = 'all' }: {
  ipos: IpoListItem[]; lang?: Lang;
  /** SEO listing pages (/ipos/open, /sme, …) pre-set the filters */
  initialStatus?: StatusFilter; initialType?: TypeFilter;
}) {
  const tr = makeT(lang);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>(initialType);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);

  // LIVE catalog hydration: this page is a static export built on the server, where the
  // build-time API fetch can be blocked (Cloudflare bot protection) or simply stale —
  // IPOs added after the last build would be missing. The browser refetches on mount
  // and replaces the baked-in list whenever the live call returns data.
  const [live, setLive] = useState<IpoListItem[] | null>(null);
  // Cards are the default everywhere (operator decision — the brand layout leads);
  // the comparison table is one click away on desktop and the choice is remembered.
  const [view, setView] = useState<'cards' | 'table'>('cards');
  useEffect(() => {
    getIpos().then((r) => { if (Array.isArray(r) && r.length) setLive(r); }).catch(() => { /* keep the baked-in list */ });
    // deep-linkable filters (?f=open|upcoming|closed & ?board=mainboard|sme) — used by the nav's IPO panel
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

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'closed', label: 'Closed' },
  ];

  /**
   * The list shows what's CURRENT: everything still in play, plus issues that
   * finished within the last six months. Older history lives on /ipos/archive,
   * which is what keeps this page usable once the full catalog is published.
   * Ordering is the shared stage order — closing today first, listed last.
   */
  const { filtered, olderCount } = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const matches = (ipos as any[]).filter((i) => {
      if (type !== 'all' && i.type !== type) return false;
      if (status === 'closed' ? !(i.status === 'closed' || i.status === 'listed')
        : status !== 'all' && i.status !== status) return false;
      if (ql && !(`${i.name} ${i.symbol}`.toLowerCase().includes(ql))) return false;
      return true;
    });
    // a search should reach the whole catalog; browsing stays in the recent window
    const inWindow = ql ? matches : matches.filter((i) => isRecent(i));
    return {
      filtered: [...inWindow].sort(compareForList),
      olderCount: matches.length - inWindow.length,
    };
  }, [ipos, query, type, status]);

  return (
    <section id="ipos">
      {/* one-time GMP awareness consent (compliance) */}
      <GmpNotice />
      {/* status filter tabs */}
      <div className="tabs" role="tablist" aria-label="IPO status">
        {statusTabs.map((s) => (
          <button key={s.key} className={`tab ${status === s.key ? 'active' : ''}`} onClick={() => setStatus(s.key)}>{s.label}</button>
        ))}
      </div>

      {/* type pills + search */}
      <div className="pills" style={{ marginTop: 16 }}>
        {(['all', 'mainboard', 'sme'] as TypeFilter[]).map((t) => (
          <button key={t} className={`pill ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
            {t === 'all' ? 'All' : t === 'sme' ? 'SME' : 'Mainboard'}
          </button>
        ))}
        <div className="search" style={{ marginLeft: 'auto', flex: '1 1 220px' }}>
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or symbol…" aria-label="Search IPOs" />
        </div>
        {/* view switch — desktop only (cards are the only sensible phone layout) */}
        <div className="viewseg" role="group" aria-label="Layout">
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => pickView('table')} aria-pressed={view === 'table'}>
            <Icon name="list" size={15} /> Table
          </button>
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => pickView('cards')} aria-pressed={view === 'cards'}>
            <Icon name="layers" size={15} /> Cards
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="emoji">🔍</div>
          <h3>No IPOs match</h3>
          <p className="muted">Try clearing the search or switching filters.</p>
        </div>
      ) : view === 'table' ? (
        <IpoCompareTable ipos={filtered as any} lang={lang} />
      ) : (
        <div className="ipo-list">
          {filtered.map((i) => <IpoCard key={i.id} ipo={i} lang={lang} />)}
        </div>
      )}

      {olderCount > 0 && (
        <div className="archive-cta">
          <span><b>{olderCount.toLocaleString('en-IN')}</b> older {olderCount === 1 ? 'issue' : 'issues'} aren&apos;t shown here.</span>
          <a className="btn btn-secondary btn-sm" href="/ipos/archive">Browse IPO archive <Icon name="arrow-right" size={14} /></a>
        </div>
      )}
    </section>
  );
}
