'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import * as st from '@investoyard/shared-types';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMon, times } from '@/core/format';
import { outcomeText, useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';
import { St, X, heat } from './parts';

type Tab = 'all' | 'open' | 'upcoming' | 'recent';
type View = 'table' | 'tiles';
type SortKey = 'sym' | 'name' | 'bandHi' | 'minN' | 'sizeN' | 'qibN' | 'niiN' | 'retailN' | 'subsN';
const PAGE = 20;

const COLS: { key: SortKey | null; label: string; right?: boolean }[] = [
  { key: 'sym', label: 'Symbol' },
  { key: 'name', label: 'Company' },
  /* No separate dates column: the status already names the date that matters
     (opens / closes / listed), and the column pushed RII and Total, the two
     figures a desk reads first, off the panel at 1440px. */
  { key: null, label: 'Status' },
  { key: 'bandHi', label: 'Price band', right: true },
  { key: 'minN', label: 'Min ₹', right: true },
  { key: 'sizeN', label: 'Size ₹ Cr', right: true },
  { key: 'qibN', label: 'QIB', right: true },
  { key: 'niiN', label: 'NII', right: true },
  { key: 'retailN', label: 'RII', right: true },
  { key: 'subsN', label: 'Total', right: true },
];

export default function HomePage({ model }: { model: HomeModel }) {
  const [tab, setTab] = useState<Tab>('all');
  const [board, setBoard] = useState('all');
  const [view, setView] = useState<View>('table');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sets = useMemo(() => ({
    all: [...model.actionable, ...model.recent],
    open: model.actionable.filter((c) => c.tone === 'open'),
    upcoming: model.actionable.filter((c) => c.tone === 'upcoming'),
    recent: [...model.actionable.filter((c) => c.tone === 'closed'), ...model.recent],
  }), [model]);

  const keep = (c: IpoCard) => (board === 'all' || c.board === board) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.sym.toLowerCase().includes(q.trim().toLowerCase()));
  const list = useMemo(() => {
    const base = sets[tab].filter(keep);
    if (!sort) return base;
    return [...base].sort((a, b) => {
      const va = a[sort.key] as string | number | null;
      const vb = b[sort.key] as string | number | null;
      if (va == null || va === '') return 1;   // blanks always last, whichever way
      if (vb == null || vb === '') return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, tab, board, q, sort]);
  const rows = showAll ? list : list.slice(0, PAGE);
  const toggleSort = (key: SortKey) => setSort((s) => (s && s.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  const strip = [...model.actionable, ...model.recent].slice(0, 24);
  const TABS: [Tab, string][] = [['all', 'All'], ['open', 'Open'], ['upcoming', 'Upcoming'], ['recent', 'Closed']];

  return (
    <>
      <div className="t-strip" style={{ margin: '0 calc(var(--gut) * -1)' }}>
        <div className="t-strip-in" aria-label="Recent issues">
          {strip.map((c) => (
            <Link key={c.sym} href={c.href}>
              <b className="mono">{c.sym}</b>
              <span className="mono">{c.subs ? c.subs : c.status}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="t-home">
        <section className="t-panel" aria-labelledby="blotter-h">
          <div className="t-ph">
            <h1 id="blotter-h">IPO blotter</h1>
            <div className="t-tools">
              <div className="t-seg" role="tablist" aria-label="Status">
                {TABS.map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setShowAll(false); }}>
                    {label}<b className="mono">{sets[k].length}</b>
                  </button>
                ))}
              </div>
              <label><span className="sr">Board</span>
                <select className="t-input" value={board} onChange={(e) => setBoard(e.target.value)}>
                  <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
                </select>
              </label>
              <label><span className="sr">Filter</span><input className="t-input" type="search" placeholder="Filter symbol or name" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <div className="t-seg" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
                <button type="button" aria-pressed={view === 'tiles'} onClick={() => setView('tiles')}>Tiles</button>
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="t-empty"><strong>No issues match</strong>{tab === 'open' ? 'Nothing is bidding today.' : 'Change the filter or board.'}</div>
          ) : view === 'table' ? (
            <>
              <div className="t-table-wrap t-hide-m">
                <table className="t-table">
                  <thead>
                    <tr>
                      {COLS.map((c) => (
                        <th key={c.label} className={c.right ? 'r' : undefined} aria-sort={sort && c.key === sort.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                          {c.key ? (
                            <button type="button" onClick={() => toggleSort(c.key as SortKey)}>
                              {c.label}{sort && c.key === sort.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.sym}>
                        <td><Link href={c.href} className="t-sym mono">{c.sym}</Link>{c.board === 'SME' ? <span className="t-board" style={{ marginLeft: 8 }}>SME</span> : null}</td>
                        <td><Link href={c.href} className="t-co" title={c.legal}>{c.name}</Link></td>
                        <td><St tone={c.tone}>{c.status}</St></td>
                        <td className="r mono">{c.band}</td>
                        <td className="r mono">{c.minN ? c.minN.toLocaleString('en-IN') : '—'}</td>
                        <td className="r mono">{c.sizeN ? c.sizeN.toLocaleString('en-IN', { maximumFractionDigits: c.sizeN >= 100 ? 0 : 1 }) : '—'}</td>
                        <td className="r mono"><X v={c.qibN} /></td>
                        <td className="r mono"><X v={c.niiN} /></td>
                        <td className="r mono"><X v={c.retailN} /></td>
                        <td className="t-heat mono" style={heat(c.bar)}><X v={c.subsN} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="t-mrows">
                {rows.map((c) => (
                  <li key={c.sym}>
                    <Link href={c.href}>
                      <span><span className="t-sym mono">{c.sym}</span> <span className="t-muted" style={{ fontSize: 12 }}>{c.board}</span></span>
                      <span className="t-mr-v mono">{c.subs || c.band}</span>
                      <span className="t-mr-s">{c.name} · {c.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="t-tiles">
              {rows.map((c) => (
                <Link key={c.sym} href={c.href} className="t-tile">
                  <div className="t-tile-top"><span className="t-sym mono">{c.sym}</span><St tone={c.tone}>{c.status}</St></div>
                  <div className="t-tile-name">{c.name}</div>
                  <div>
                    <div className="t-tile-fig mono">{c.subs ? <X v={c.subsN} /> : c.band}</div>
                    <div className="t-tile-sub">{c.subs ? 'subscribed overall' : 'price band'}</div>
                  </div>
                  {c.subs ? <div className="t-gauge" aria-hidden="true"><span style={{ width: `${c.bar}%` }} /></div> : null}
                  <div className="t-tile-foot"><span>Min <span className="mono">{c.min}</span></span><span className="mono">{c.size}</span></div>
                </Link>
              ))}
            </div>
          )}

          <div className="t-more">
            <span className="mono">{rows.length} of {list.length}</span>
            <span style={{ display: 'flex', gap: 14 }}>
              {!showAll && list.length > PAGE ? <button type="button" className="t-btn t-btn-s" onClick={() => setShowAll(true)}>Show all {list.length}</button> : null}
              <Link href="/ipos/" className="t-link" style={{ alignSelf: 'center' }}>Full archive</Link>
            </span>
          </div>
        </section>

        <aside className="t-rail" aria-label="Market rail">
          <Events cards={[...model.actionable, ...model.recent]} />
          <Breadth model={model} />
          <QuickAllot choices={model.allotmentChoices} />
          <p className="t-note" style={{ padding: '0 2px' }}>Bidding runs 10:00–17:00 IST on exchange days. Heat shows the strength of demand; it is not a gain or a recommendation.</p>
        </aside>
      </div>
    </>
  );
}

type EvType = 'OPEN' | 'CLOSE' | 'ALLOT' | 'LIST';

function Events({ cards }: { cards: IpoCard[] }) {
  const today = st.istToday();
  const until = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); })();
  const order: EvType[] = ['OPEN', 'CLOSE', 'ALLOT', 'LIST'];
  const events: { d: string; t: EvType; c: IpoCard }[] = [];
  for (const c of cards) {
    const add = (d: string, t: EvType) => { if (d && d >= today && d <= until) events.push({ d, t, c }); };
    add(c.open, 'OPEN'); add(c.close, 'CLOSE'); add(c.allotment, 'ALLOT'); add(c.listing, 'LIST');
  }
  events.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : order.indexOf(a.t) - order.indexOf(b.t)));
  return (
    <section className="t-panel" aria-labelledby="ev-h">
      <div className="t-ph"><h2 id="ev-h">Next 7 days</h2><span className="t-label mono">{dayMon(today)} → {dayMon(until)}</span></div>
      {events.length ? (
        <ul className="t-events">
          {events.slice(0, 12).map((e, i) => (
            <li key={i}>
              <span className="mono" style={{ color: e.d === today ? 'var(--ink)' : 'var(--muted)' }}>{e.d === today ? 'Today' : dayMon(e.d)}</span>
              <span className={`t-ev ${e.t.toLowerCase()}`}>{e.t}</span>
              <Link href={e.c.href}><span className="mono" style={{ color: 'var(--brand-lite)' }}>{e.c.sym}</span> <span className="t-muted">{e.c.name}</span></Link>
            </li>
          ))}
        </ul>
      ) : <p className="t-pb t-muted">No openings, closings, allotments or listings in the next seven days.</p>}
    </section>
  );
}

function Breadth({ model }: { model: HomeModel }) {
  const subs = model.recent.map((c) => c.subsN).filter((v): v is number => v != null).sort((a, b) => a - b);
  const median = subs.length ? (subs.length % 2 ? subs[(subs.length - 1) / 2] : (subs[subs.length / 2 - 1] + subs[subs.length / 2]) / 2) : null;
  return (
    <section className="t-panel" aria-labelledby="br-h">
      <div className="t-ph"><h2 id="br-h">Breadth</h2></div>
      <dl className="t-breadth">
        <div><dt className="t-label">Open now</dt><dd className="mono">{model.counts.open}</dd></div>
        <div><dt className="t-label">Upcoming</dt><dd className="mono">{model.counts.upcoming}</dd></div>
        <div><dt className="t-label">Listed, 45 days</dt><dd className="mono">{model.counts.recent}</dd></div>
        <div><dt className="t-label" title={`Median of ${subs.length} issues listed in the last 45 days`}>Median subscribed</dt><dd className="mono">{median != null ? times(median) : '—'}</dd></div>
      </dl>
    </section>
  );
}

function QuickAllot({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  return (
    <section className="t-panel" aria-labelledby="al-h">
      <div className="t-ph"><h2 id="al-h">Allotment lookup</h2><Link href="/allotment/" className="t-link" style={{ fontSize: 12 }}>Open</Link></div>
      <form className="t-pb t-form" onSubmit={onSubmit}>
        <label><span className="sr">IPO</span>
          <select className="t-input" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label><span className="sr">PAN</span><input className="t-input mono" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="PAN  ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} /></label>
        <button type="submit" className="t-btn t-btn-p" disabled={a.busy}>{a.busy ? 'Querying…' : 'Query registrar'}</button>
        {a.error ? <p role="alert" className="t-err">{a.error}</p> : null}
        {a.result ? (
          <div className="t-log" role="status">
            {outcomeText(a.result).map((o, i) => <p key={i}><strong><span className={`t-st ${o.tone}`}><i aria-hidden="true" /></span>{o.title}</strong><span className="t-muted">{o.body}</span></p>)}
          </div>
        ) : null}
      </form>
    </section>
  );
}
