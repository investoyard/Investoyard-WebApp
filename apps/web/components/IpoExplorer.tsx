'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoListItem } from '@/lib/api';
import { IpoCard } from '@/components/IpoCard';
import { GmpNotice } from '@/components/GmpNotice';
import { Icon } from '@/components/Icon';
import { makeT, Lang } from '@investoyard/i18n';

type TypeFilter = 'all' | 'mainboard' | 'sme';
type StatusFilter = 'all' | 'open' | 'upcoming' | 'closed'; // 'closed' = post-close phase (closed + listed)

export function IpoExplorer({ ipos: initial, lang = 'en' }: { ipos: IpoListItem[]; lang?: Lang }) {
  const tr = makeT(lang);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  // LIVE catalog hydration: this page is a static export built on the server, where the
  // build-time API fetch can be blocked (Cloudflare bot protection) or simply stale —
  // IPOs added after the last build would be missing. The browser refetches on mount
  // and replaces the baked-in list whenever the live call returns data.
  const [live, setLive] = useState<IpoListItem[] | null>(null);
  useEffect(() => {
    getIpos().then((r) => { if (Array.isArray(r) && r.length) setLive(r); }).catch(() => { /* keep the baked-in list */ });
  }, []);
  const ipos = live ?? initial;

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'closed', label: 'Closed' },
  ];

  const filtered = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return (ipos as any[]).filter((i) => {
      if (type !== 'all' && i.type !== type) return false;
      if (status === 'closed' ? !(i.status === 'closed' || i.status === 'listed')
        : status !== 'all' && i.status !== status) return false;
      if (ql && !(`${i.name} ${i.symbol}`.toLowerCase().includes(ql))) return false;
      return true;
    });
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
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="emoji">🔍</div>
          <h3>No IPOs match</h3>
          <p className="muted">Try clearing the search or switching filters.</p>
        </div>
      ) : (
        <div className="ipo-list">
          {filtered.map((i) => <IpoCard key={i.id} ipo={i} lang={lang} />)}
        </div>
      )}
    </section>
  );
}
