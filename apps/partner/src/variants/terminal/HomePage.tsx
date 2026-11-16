'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMon, lowerFirst, wdDayMon } from '@/core/format';
import { outcomeText, useAllotmentCheck } from '@/core/allotment';
import { Bar, Logo, St, X, logW } from './parts';

type Tab = 'all' | 'open' | 'upcoming' | 'closed';
type SortKey = 'default' | 'band' | 'min' | 'size' | 'subs';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'closed', label: 'Closed' },
];
const PAGE = 20;

const sortVal = (c: IpoCard, k: SortKey): number => (k === 'band' ? c.bandHi ?? -1 : k === 'min' ? c.minN ?? -1 : k === 'size' ? c.sizeN ?? -1 : k === 'subs' ? c.subsN ?? -1 : 0);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/*
 * The pinned detail pane: the selected issue's whole picture without leaving
 * the page. Selection starts on the first row on BOTH server and client, so
 * the first paint and hydration agree.
 */
function Pane({ c, asOf }: { c: IpoCard | undefined; asOf: string }) {
  if (!c) return <aside className="t-panel t-pane"><div className="t-empty"><strong>Nothing selected</strong>Pick an issue in the table to see it here.</div></aside>;
  const cats: [string, number | null][] = [['QIB', c.qibN], ['NII', c.niiN], ['Retail', c.retailN]];
  const max = Math.max(1, ...cats.map(([, v]) => v || 0), c.subsN || 0);
  const dates: [string, string][] = [['Bidding opens', c.open], ['Bidding closes', c.close], ['Allotment', c.allotment], ['Listing', c.listing]];
  return (
    <aside className="t-panel t-pane" aria-label={`${c.name} summary`}>
      <div className="t-pane-head">
        <div className="t-pane-id">
          <Logo ipo={c} />
          <div style={{ minWidth: 0 }}>
            <div className="t-pane-name">{c.name}</div>
            <div className="t-co-sub">{c.board} · {c.exchanges}</div>
          </div>
        </div>
        <St tone={c.tone}>{c.status}</St>
      </div>
      <dl className="t-pane-figs">
        <div><dt>Price band</dt><dd>{c.band}</dd></div>
        <div><dt>Min. investment</dt><dd>{c.min}</dd></div>
        <div><dt>Issue size</dt><dd>{c.size}</dd></div>
        <div><dt>Bidding</dt><dd>{c.dates}</dd></div>
      </dl>
      <div className="t-pane-sec">
        <h3><span>Subscription {c.tone === 'open' ? 'so far' : c.subs ? '(final)' : ''}</span><b>{c.subs || '—'}</b></h3>
        {c.subs ? cats.map(([k, v]) => (
          <div key={k} className="t-catrow"><span className="t-muted">{k}</span><Bar width={logW(v, max)} /><b><X v={v} /></b></div>
        )) : <p className="t-muted" style={{ fontSize: 13 }}>Subscription figures appear once bidding opens.</p>}
      </div>
      <div className="t-pane-sec">
        <h3><span>Key dates</span></h3>
        <ul className="t-dates">
          {dates.filter(([, d]) => d).map(([k, d]) => (
            <li key={k} className={d <= asOf ? 'done' : undefined}><span>{k}</span><b>{wdDayMon(d)}</b></li>
          ))}
        </ul>
      </div>
      <div className="t-pane-act">
        <Link className="t-btn t-btn-p" href={c.href}>View full details</Link>
        {c.tone === 'closed'
          ? <Link className="t-btn" href="/allotment/">Check allotment</Link>
          : <Link className="t-btn" href="/subscription/">Live subscription</Link>}
      </div>
    </aside>
  );
}

function Events({ m }: { m: HomeModel }) {
  const asOf = m.asOf;
  const end = new Date(Date.parse(`${asOf}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const ev: { d: string; kind: string; cls: string; c: IpoCard }[] = [];
  for (const c of m.actionable) {
    const add = (d: string, kind: string, cls: string) => { if (d && d >= asOf && d <= end) ev.push({ d, kind, cls, c }); };
    add(c.open, 'Opens', 'open'); add(c.close, 'Closes', 'close'); add(c.allotment, 'Allotment', ''); add(c.listing, 'Lists', '');
  }
  ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.c.name.localeCompare(b.c.name)));
  return (
    <section className="t-panel" aria-labelledby="ev-h">
      <div className="t-ph"><h2 id="ev-h">Next 7 days</h2><span className="t-muted num" style={{ fontSize: 13 }}>{dayMon(asOf)} – {dayMon(end)}</span></div>
      {ev.length ? (
        <ul className="t-events">
          {ev.slice(0, 8).map((e, i) => (
            <li key={i}><span className="num t-muted">{wdDayMon(e.d)}</span><span className={`t-tag ${e.cls}`}>{e.kind}</span><Link href={e.c.href}>{e.c.name}</Link></li>
          ))}
        </ul>
      ) : <div className="t-empty" style={{ padding: 28 }}>No IPO dates in the next seven days.</div>}
    </section>
  );
}

function Allot({ choices }: { choices: HomeModel['allotmentChoices'] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  return (
    <section className="t-panel" aria-labelledby="al-h">
      <div className="t-ph"><h2 id="al-h">Allotment status</h2><Link className="t-link" href="/allotment/" style={{ fontSize: 13 }}>Open full page</Link></div>
      {choices.length ? (
        <form className="t-pb t-form" onSubmit={onSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 10 }}>
            <label className="t-label">IPO
              <select className="t-input" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.date ? ` — ${c.date}` : ''}</option>)}
              </select>
            </label>
            <label className="t-label">PAN
              <input className="t-input num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.06em', textTransform: 'uppercase' }} />
            </label>
          </div>
          <button type="submit" className="t-btn t-btn-p" disabled={a.busy} style={{ height: 42 }}>{a.busy ? 'Checking…' : 'Check allotment'}</button>
          <div role="status" aria-live="polite" style={{ display: 'grid', gap: 8 }}>
            {a.error ? <p className="t-err" role="alert">{a.error}</p> : null}
            {a.result ? outcomeText(a.result).map((o, i) => <div key={i} className={`t-out ${o.tone}`}><strong>{o.title}</strong><p>{o.body}</p></div>) : null}
          </div>
        </form>
      ) : <div className="t-empty" style={{ padding: 28 }}>No IPO has closed in the last 90 days.</div>}
    </section>
  );
}

export default function HomePage({ model }: { model: HomeModel }) {
  const all = useMemo(() => [...model.actionable, ...model.recent], [model]);
  const [tab, setTab] = useState<Tab>('all');
  const [board, setBoard] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<string>(all[0]?.sym || '');

  const count = (t: Tab) => (t === 'all' ? all.length : all.filter((c) => c.tone === t).length);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let r = all.filter((c) => (tab === 'all' || c.tone === tab) && (board === 'all' || c.board === board) && (!s || c.name.toLowerCase().includes(s) || c.sym.toLowerCase().includes(s)));
    if (sort !== 'default') r = [...r].sort((a, b) => sortVal(b, sort) - sortVal(a, sort));
    return r;
  }, [all, tab, board, q, sort]);
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const selected = rows.find((c) => c.sym === sel) || rows[0];

  const med = median(model.recent.map((c) => c.subsN).filter((v): v is number => v != null));
  const nextUp = model.actionable.find((c) => c.tone === 'upcoming');
  const th = (k: SortKey, label: string) => (
    <th className="r" aria-sort={sort === k ? 'descending' : undefined}>
      <button type="button" onClick={() => setSort(sort === k ? 'default' : k)}>{label}{sort === k ? ' ↓' : ''}</button>
    </th>
  );

  return (
    <div className="t-page">
      <dl className="t-kpis">
        <div className="t-kpi"><dt>Open for bidding</dt><dd>{model.counts.open}</dd><small>{model.counts.open ? 'Bidding now' : 'Nothing bidding today'}</small></div>
        <div className="t-kpi"><dt>Upcoming</dt><dd>{model.counts.upcoming}</dd><small>{nextUp ? `Next: ${nextUp.name}, ${lowerFirst(nextUp.status)}` : 'None announced'}</small></div>
        <div className="t-kpi"><dt>Listed, last 45 days</dt><dd>{model.counts.recent}</dd><small>Mainboard and SME</small></div>
        <div className="t-kpi"><dt>Median subscription</dt><dd><X v={med} /></dd><small>Across recent listings</small></div>
      </dl>

      <div className="t-split">
        <section className="t-panel" aria-labelledby="mk-h">
          <div className="t-ph">
            <h1 id="mk-h">IPO market</h1>
            <div className="t-tools">
              <div className="t-seg" role="tablist" aria-label="Status">
                {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setShowAll(false); }}>{t.label}<b className="num">{count(t.key)}</b></button>)}
              </div>
              <select className="t-input" aria-label="Board" value={board} onChange={(e) => setBoard(e.target.value)}>
                <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
              </select>
              <input className="t-input t-search" type="search" aria-label="Search" placeholder="Search company or symbol" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {rows.length === 0 ? <div className="t-empty"><strong>No match</strong>Clear the filters or search for another name.</div> : (
            <>
              <div className="t-table-wrap home">
                <table className="t-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Status</th>
                      {th('band', 'Price band')}
                      {th('min', 'Min. ₹')}
                      {th('size', 'Size ₹ Cr')}
                      {th('subs', 'Subscribed')}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.sym} data-sel={selected?.sym === c.sym ? '' : undefined} onClick={() => setSel(c.sym)}>
                        <td>
                          <div className="t-co">
                            <Logo ipo={c} />
                            <div style={{ minWidth: 0 }}>
                              <Link className="t-co-name" href={c.href} onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                              <span className="t-co-sub">{c.sym} · {c.board}</span>
                            </div>
                          </div>
                        </td>
                        <td><St tone={c.tone}>{c.status}</St></td>
                        <td className="r">{c.band}</td>
                        <td className="r">{c.minN != null ? c.minN.toLocaleString('en-IN') : '—'}</td>
                        <td className="r">{c.sizeN != null ? Math.round(c.sizeN).toLocaleString('en-IN') : '—'}</td>
                        <td className="r"><span className="t-demand">{c.subsN != null ? <Bar width={c.bar} /> : null}<b><X v={c.subsN} /></b></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="t-mrows">
                {shown.map((c) => (
                  <li key={c.sym}>
                    <Link href={c.href}>
                      <Logo ipo={c} />
                      <div style={{ minWidth: 0 }}><span className="t-co-name">{c.name}</span><St tone={c.tone}>{c.status}</St></div>
                      <div><b><X v={c.subsN} /></b><small>{c.band}</small></div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="t-foot-row">
            <span className="num">{shown.length} of {rows.length}</span>
            <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {rows.length > PAGE ? <button type="button" className="t-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button> : null}
              <Link className="t-link" href="/ipos/">Full archive</Link>
            </span>
          </div>
        </section>
        <Pane c={selected} asOf={model.asOf} />
      </div>

      <div className="t-lower">
        <Events m={model} />
        <Allot choices={model.allotmentChoices} />
      </div>
      <p className="t-note">Bidding runs 10:00–17:00 IST on exchange days. Subscription is shares bid for ÷ shares offered, consolidated from NSE and BSE; bars use a log scale. Figures inform — they are not a recommendation.</p>
    </div>
  );
}
