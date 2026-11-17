'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMonYear } from '@/core/format';
import { BoardTag, Hero, Icon, Logo, State } from './parts';

type Tab = 'open' | 'upcoming' | 'closed' | 'listed';
type View = 'cards' | 'list';
const PAGE = 12;

/* "Closed" here is the actionable closed set (awaiting allotment or listing); "Listed" is the last 45 days. */
const inTab = (c: IpoCard, t: Tab) => (t === 'listed' ? c.stage === 'listed' : t === 'closed' ? c.tone === 'closed' && c.stage !== 'listed' : c.tone === t);

function Card({ c }: { c: IpoCard }) {
  return (
    <article className="p-card p-ipo">
      <div className="p-ipo-top">
        <Logo ipo={c} />
        <div style={{ minWidth: 0 }}>
          <Link className="p-ipo-name" href={c.href}>{c.name}</Link>
          <p className="p-ipo-ind">{c.industry || c.exchanges}</p>
        </div>
        <BoardTag board={c.board} />
      </div>
      <dl className="p-figs">
        <div className="p-fig"><Icon name="tag" size={15} /><dt>Price band</dt><dd title={c.band}>{c.band}</dd></div>
        <div className="p-fig"><Icon name="box" size={15} /><dt>Lot size</dt><dd title={c.lot}>{c.lot}</dd></div>
        <div className="p-fig"><Icon name="coins" size={15} /><dt>Issue size</dt><dd title={c.size}>{c.size}</dd></div>
      </dl>
      <div className="p-datebar num">
        <span><Icon name="calendar" size={16} />Open: {c.open ? dayMonYear(c.open) : '—'}</span>
        <span><Icon name="calendar" size={16} />Close: {c.close ? dayMonYear(c.close) : '—'}</span>
      </div>
      <div className="p-ipo-foot">
        <div className="p-docs-inline">
          {c.rhp || c.drhp ? (
            <>
              {c.rhp ? <a href={c.rhp} target="_blank" rel="noopener noreferrer"><Icon name="doc" size={16} />RHP</a> : null}
              {c.rhp && c.drhp ? <span className="sep" aria-hidden="true" /> : null}
              {c.drhp ? <a href={c.drhp} target="_blank" rel="noopener noreferrer"><Icon name="book" size={16} />DRHP</a> : null}
            </>
          ) : <State tone={c.tone}>{c.status}</State>}
        </div>
        <Link className="p-btn p-btn-sm" href={c.href}>View details <Icon name="arrow" size={16} stroke={2.2} /></Link>
      </div>
    </article>
  );
}

function List({ rows }: { rows: IpoCard[] }) {
  return (
    <div className="p-card p-table-wrap">
      <table className="p-table">
        <thead>
          <tr><th>Company</th><th>Board</th><th className="hide-s">Status</th><th className="r hide-s">Price band</th><th className="r hide-s">Lot size</th><th className="r hide-s">Issue size</th><th className="r">Subscribed</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.sym}>
              <td><div className="p-co"><Logo ipo={c} /><div style={{ minWidth: 0 }}><Link href={c.href}>{c.name}</Link><small>{c.dates}</small></div></div></td>
              <td><BoardTag board={c.board} /></td>
              <td className="hide-s"><State tone={c.tone}>{c.status}</State></td>
              <td className="r hide-s">{c.band}</td>
              <td className="r hide-s">{c.lot}</td>
              <td className="r hide-s">{c.size}</td>
              <td className="r"><b>{c.subs || '—'}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HomePage({ model }: { model: HomeModel }) {
  const all = useMemo(() => [...model.actionable, ...model.recent], [model]);
  const counts: Record<Tab, number> = {
    open: all.filter((c) => inTab(c, 'open')).length,
    upcoming: all.filter((c) => inTab(c, 'upcoming')).length,
    closed: all.filter((c) => inTab(c, 'closed')).length,
    listed: all.filter((c) => inTab(c, 'listed')).length,
  };
  /* Opens on the first tab that has something in it, so the page never lands on an empty grid. */
  const first = (['open', 'upcoming', 'closed', 'listed'] as Tab[]).find((t) => counts[t] > 0) || 'open';
  const [tab, setTab] = useState<Tab>(first);
  const [board, setBoard] = useState('all');
  const [sector, setSector] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('cards');
  const [n, setN] = useState(PAGE);

  const sectors = useMemo(() => Array.from(new Set(all.map((c) => c.industry).filter(Boolean) as string[])).sort(), [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => inTab(c, tab) && (board === 'all' || c.board === board) && (sector === 'all' || c.industry === sector) && (!s || c.name.toLowerCase().includes(s) || c.sym.toLowerCase().includes(s)));
  }, [all, tab, board, sector, q]);
  const shown = rows.slice(0, n);
  const TABS: [Tab, string][] = [['open', 'Open'], ['upcoming', 'Upcoming'], ['closed', 'Closed'], ['listed', 'Listed']];

  return (
    <>
      <Hero eyebrow="IPO calendar" title="Track all upcoming & current" accent="IPOs" sub="Opening, closing and listing dates, price bands and key issue details for every mainboard and SME IPO — all in one place." />
      <div className="p-wrap p-main">
        <dl className="p-stats">
          <div className="p-stat"><span className="p-tile"><Icon name="calendar" size={24} /></span><div className="p-stat-t"><dd>{counts.open}</dd><dt>Open IPOs</dt></div></div>
          <div className="p-stat"><span className="p-tile"><Icon name="calendar" size={24} /></span><div className="p-stat-t"><dd>{counts.upcoming}</dd><dt>Upcoming IPOs</dt></div></div>
          <div className="p-stat"><span className="p-tile amber"><Icon name="hourglass" size={24} /></span><div className="p-stat-t"><dd>{counts.closed}</dd><dt>Awaiting allotment or listing</dt></div></div>
          <div className="p-stat"><span className="p-tile sky"><Icon name="rocket" size={24} /></span><div className="p-stat-t"><dd>{counts.listed}</dd><dt>Listed in 45 days</dt></div></div>
        </dl>

        <section className="p-sec" aria-labelledby="cal-h">
          <div className="p-sec-h">
            <div className="p-sec-title"><Icon name="calendar" size={30} /><h2 id="cal-h">IPO calendar</h2></div>
            <div className="p-tabs" role="tablist" aria-label="Status">
              {TABS.map(([t, l]) => <button key={t} type="button" role="tab" className="p-tab" aria-selected={tab === t} onClick={() => { setTab(t); setN(PAGE); }}>{l} ({counts[t]})</button>)}
            </div>
            <div className="p-tools">
              <select className="p-select" aria-label="Board" value={board} onChange={(e) => setBoard(e.target.value)}>
                <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
              </select>
              <select className="p-select" aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} style={{ maxWidth: 200 }}>
                <option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="p-input-wrap"><Icon name="search" size={17} /><input className="p-input" type="search" aria-label="Search by company" placeholder="Search by company" value={q} onChange={(e) => setQ(e.target.value)} /></span>
              <div className="p-view" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><Icon name="grid" size={16} />Cards</button>
                <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={16} />List</button>
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="p-card p-empty"><strong>Nothing here right now</strong>No IPO matches these filters. The <Link className="p-link" href="/ipos/">archive</Link> holds every past issue.</div>
          ) : view === 'cards' ? (
            <div className="p-grid">{shown.map((c) => <Card key={c.sym} c={c} />)}</div>
          ) : <List rows={shown} />}

          <div className="p-more">
            <span className="p-muted num">Showing {shown.length} of {rows.length}</span>
            <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              {rows.length > n ? <button type="button" className="p-btn p-btn-q" onClick={() => setN(n + PAGE)}>Show more</button> : null}
              <Link className="p-link" href="/ipos/">Browse every past IPO <Icon name="arrow" size={16} /></Link>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
