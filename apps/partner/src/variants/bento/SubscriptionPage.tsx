'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSymbolParam } from '@/core/useSymbolParam';
import type { SubscriptionModel } from '@/core/models';
import { dayMon, lowerFirst } from '@/core/format';
import { Board, DayBars, Hero, Icon, Logo, Status, Ttl, ring, shade, type IconName } from './parts';

type Row = SubscriptionModel['closed'][number] & { asOf?: string };
type Tab = 'details' | 'days' | 'cats';
const xs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const all: Row[] = useMemo(() => [...model.live, ...model.closed], [model]);
  const live = useMemo(() => new Set(model.live.map((r) => r.sym)), [model.live]);
  const [sym, setSym] = useState(all[0]?.sym || '');
  useSymbolParam(all.map((r) => r.sym), setSym);
  const [tab, setTab] = useState<Tab>('details');
  const [status, setStatus] = useState(model.live.length ? 'live' : 'all');
  const [board, setBoard] = useState('all');
  const [q, setQ] = useState('');
  const sel = all.find((r) => r.sym === sym) || all[0];
  const f = sel ? model.focus[sel.sym] : undefined;
  const dayOf = (r: Row) => { const d = model.focus[r.sym]?.days; return d && d.length ? d[d.length - 1].label : live.has(r.sym) ? 'Day 1' : ''; };
  const top = [...all].filter((r) => r.subsN != null).sort((a, b) => b.subsN! - a.subsN!);
  const apps = (r: Row) => { const t = model.focus[r.sym]?.total.applications; return t ? Number(t.replace(/[^\d]/g, '')) : 0; };
  const mostApps = [...all].sort((a, b) => apps(b) - apps(a))[0];
  const stats: [IconName, string, string, string?][] = [
    ['layers', String(model.live.length), 'Bidding now'],
    ['clock', String(model.closed.length), 'Closed in 5 weeks'],
    ['users', top[0] ? top[0].subs || '—' : '—', 'Highest demand', top[0]?.name],
    ['chart', mostApps && apps(mostApps) ? apps(mostApps).toLocaleString('en-IN') : '—', 'Most applications', mostApps && apps(mostApps) ? mostApps.name : undefined],
  ];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((r) => (status === 'all' || (status === 'live') === live.has(r.sym)) && (board === 'all' || r.board === board) && (!s || r.name.toLowerCase().includes(s)))
      .sort((a, b) => (b.subsN ?? -1) - (a.subsN ?? -1));
  }, [all, status, board, q, live]);
  const cats = f ? f.catRows.filter((r) => !r.nested && r.bidN) : [];
  const bidSum = cats.reduce((a, r) => a + (r.bidN || 0), 0);
  const pcts = cats.map((r) => (bidSum ? ((r.bidN || 0) / bidSum) * 100 : 0));
  const show = (s: string, t: Tab) => { setSym(s); setTab(t); document.getElementById('snap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <>
      <Hero crumb="Subscription" title="IPO" accent="Subscription" sub="Track IPO demand, category-wise subscription and investor interest across current and recently closed issues." art="chart">
        <dl className="b-hstats">
          {stats.map(([ic, v, l, sub]) => (
            <div key={l}><span className="b-strip-ic"><Icon name={ic} size={22} /></span><span><dt>{l}</dt><dd className="num">{v}{sub ? <small>{sub}</small> : null}</dd></span></div>
          ))}
        </dl>
      </Hero>
      <div className="b-wrap b-main">
        {!sel || !f ? (
          <div className="b-card b-empty"><strong className="b-h3">No subscription figures right now</strong><p>{model.next ? <>Next to open: <Link className="b-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}.</> : 'Figures appear here once bidding starts.'}</p></div>
        ) : (
          <>
            <div className="b-row b-row-snap">
              <section className="b-card" id="snap" aria-labelledby="sn-h">
                <div className="b-card-h">
                  <div className="b-snap-t"><span className={`b-live${live.has(sel.sym) ? '' : ' fin'}`}>{live.has(sel.sym) ? 'Live' : 'Final'}</span><Ttl id="sn-h">Subscription snapshot</Ttl></div>
                  <label className="b-pick"><span className="sr">IPO</span>
                    <select className="b-field" value={sel.sym} onChange={(e) => setSym(e.target.value)}>
                      {model.live.length ? <optgroup label="Bidding now">{model.live.map((r) => <option key={r.sym} value={r.sym}>{r.name}</option>)}</optgroup> : null}
                      {model.closed.length ? <optgroup label="Closed in the last five weeks">{model.closed.map((r) => <option key={r.sym} value={r.sym}>{r.name}</option>)}</optgroup> : null}
                    </select>
                  </label>
                </div>
                <div className="b-snap">
                  <div className="b-snap-l">
                    <div className="b-snap-id">
                      <Logo ipo={sel} size="md" />
                      <div style={{ minWidth: 0 }}>
                        <Link className="b-snap-name" href={sel.href}>{sel.legal}</Link>
                        <div className="b-chips"><Board board={sel.board} />{sel.industry ? <span className="b-chip">{sel.industry}</span> : null}</div>
                      </div>
                    </div>
                    <dl className="b-snap-figs">
                      <div><dt>Issue size</dt><dd className="num">{sel.size}</dd></div>
                      <div><dt>Price band</dt><dd className="num">{sel.band}</dd></div>
                      <div><dt>Lot size</dt><dd className="num">{sel.lot}</dd></div>
                    </dl>
                    <div className="b-overall">
                      <span>Overall subscription</span>
                      <strong className="num">{f.total.timesText}</strong>
                      <small>{dayOf(sel) ? `${dayOf(sel)} · ` : ''}{live.has(sel.sym) ? `bidding${sel.asOf ? `, updated ${sel.asOf}` : ''}` : `closed ${dayMon(sel.close)}`}</small>
                    </div>
                  </div>
                  {cats.length ? <div className="b-snap-r"><div className="b-donut" style={{ background: ring(pcts) }} aria-hidden="true"><span><b className="num">{f.total.timesText}</b>Overall</span></div></div> : null}
                </div>
                <div className="b-snap-cats">
                    <table className="b-mini">
                      <thead><tr><th>Category</th><th className="r">Subscribed</th><th className="r">Shares bid (Cr)</th></tr></thead>
                      <tbody>
                        {f.catRows.filter((r) => !r.nested).map((r) => {
                          const i = cats.indexOf(r);
                          return <tr key={r.key}><td><i style={{ background: i >= 0 ? shade(i) : 'var(--line)' }} aria-hidden="true" />{r.label}</td><td className="r num"><b>{r.timesText}</b></td><td className="r num">{r.bidN ? (r.bidN / 1e7).toFixed(2) : '—'}</td></tr>;
                        })}
                      </tbody>
                    </table>
                </div>
                {cats.length ? <p className="b-note">The ring shows each category’s share of the shares bid for.</p> : null}
              </section>
              <section className="b-card" aria-labelledby="hd-h">
                <div className="b-card-h"><Ttl id="hd-h"><Icon name="trophy" size={20} />Highest demand</Ttl></div>
                <table className="b-mini b-mini-rank">
                  <thead><tr><th>#</th><th>IPO</th><th className="r">Subscribed</th></tr></thead>
                  <tbody>
                    {top.slice(0, 6).map((r, i) => <tr key={r.sym}><td className="num">{i + 1}</td><td><button type="button" title={r.name} onClick={() => setSym(r.sym)}>{r.name}</button></td><td className="r num"><b className="b-x">{r.subs}</b></td></tr>)}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="b-card b-card-flush" aria-label="Subscription detail">
              <div className="b-tabs" role="tablist" aria-label="View">
                {([['details', 'Subscription details'], ['days', 'Day-wise trend'], ['cats', 'Category analysis']] as [Tab, string][]).map(([t, l]) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} className="b-tab" onClick={() => setTab(t)}>{l}</button>
                ))}
              </div>
              {tab === 'details' ? (
                <>
                  <div className="b-card-bar">
                    <div className="b-bar-t"><Icon name="chart" size={26} /><span><h2 className="b-h3">IPO subscription status</h2><p className="b-note">Live and final subscription for current and recently closed issues.</p></span></div>
                    <div className="b-filters">
                      <select className="b-field" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="live">Bidding now</option><option value="closed">Closed</option><option value="all">All IPOs</option></select>
                      <select className="b-field" aria-label="Board" value={board} onChange={(e) => setBoard(e.target.value)}><option value="all">All segments</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select>
                      <label className="b-qbox"><Icon name="search" size={16} /><span className="sr">Search</span><input type="search" placeholder="Search IPO" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                    </div>
                  </div>
                  <div className="b-tbl-wrap">
                    <table className="b-tbl b-tbl-sub">
                      <thead>
                        <tr><th rowSpan={2} className="num b-c2">#</th><th rowSpan={2}>IPO name</th><th rowSpan={2} className="b-c2">Segment</th><th rowSpan={2} className="r b-c1">Size (₹ Cr)</th><th rowSpan={2} className="r b-c1">Price (₹)</th><th colSpan={5} className="b-grp">Subscription (×)</th><th rowSpan={2}>Status</th><th rowSpan={2} className="r">Action</th></tr>
                        <tr><th className="r">QIB</th><th className="r">NII</th><th className="r">Retail</th><th className="r">Emp.</th><th className="r b-hl">Overall</th></tr>
                      </thead>
                      <tbody>
                        {rows.length ? rows.map((r, i) => (
                          <tr key={r.sym} className={r.sym === sel.sym ? 'is-sel' : undefined}>
                            <td className="num b-muted b-c2">{i + 1}</td>
                            <td><Link className="b-subname" href={r.href}><Icon name="doc" size={16} />{r.name}</Link></td>
                            <td className="b-c2"><Board board={r.board} /></td>
                            <td className="r num b-c1">{r.sizeN != null ? r.sizeN.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
                            <td className="r num b-c1">{r.band.replace(/₹/g, '')}</td>
                            <td className="r num">{r.qib}</td>
                            <td className="r num">{r.nii}</td>
                            <td className="r num">{r.retail}</td>
                            <td className="r num">{r.employee}</td>
                            <td className="r num b-hl"><b>{r.subs || '—'}</b></td>
                            <td><Status tone={live.has(r.sym) ? 'open' : 'closed'}>{live.has(r.sym) ? dayOf(r) || 'Live' : 'Closed'}</Status></td>
                            <td className="r"><span className="b-acts"><button type="button" aria-label={`Day-wise trend for ${r.name}`} onClick={() => show(r.sym, 'days')}><Icon name="chart" size={17} /></button><Link aria-label={`${r.name} IPO details`} href={r.href}><Icon name="doc" size={17} /></Link></span></td>
                          </tr>
                        )) : <tr><td colSpan={12} className="b-none">No issue matches these filters.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <ul className="b-mrows">
                    {rows.length ? rows.map((r) => (
                      <li key={r.sym}>
                        <Link href={r.href} className="b-mrow">
                          <span className="b-mrow-h"><Logo ipo={r} size="sm" /><span><b>{r.name}</b><small>{r.board} · {live.has(r.sym) ? dayOf(r) || 'Live' : 'Closed'}</small></span><b className="num b-x">{r.subs || '—'}</b></span>
                          <span className="b-mrow-d"><span><small>QIB</small><b className="num">{r.qib}</b></span><span><small>NII</small><b className="num">{r.nii}</b></span><span><small>Retail</small><b className="num">{r.retail}</b></span></span>
                        </Link>
                      </li>
                    )) : <li className="b-none">No issue matches these filters.</li>}
                  </ul>
                </>
              ) : tab === 'days' ? (
                <div className="b-tabbody">
                  <div className="b-card-h"><h2 className="b-h3">Day-wise trend · {sel.name}</h2><span className="b-note">Times as recorded at the end of each bidding day</span></div>
                  <DayBars days={f.days} />
                </div>
              ) : (
                <div className="b-tabbody">
                  <div className="b-card-h"><h2 className="b-h3">Category analysis · {sel.name}</h2><span className="b-note">Shares offered and bid for, by category</span></div>
                  <div className="b-tbl-wrap">
                    <table className="b-tbl">
                      <thead><tr><th>Category</th><th className="r">Shares offered</th><th className="r">Shares bid</th><th>Demand</th><th className="r">Subscribed</th></tr></thead>
                      <tbody>
                        {f.rows.map((r) => { const cr = f.catRows.find((c) => c.key === r.key); return (
                          <tr key={r.key} className={r.nested ? 'nested' : undefined}>
                            <td>{r.label}</td>
                            <td className="r num">{cr?.book ?? '—'}</td>
                            <td className="r num">{cr?.bid ?? '—'}</td>
                            <td><span className="b-rank-bar b-cat-bar" aria-hidden="true"><span style={{ width: `${Math.max(r.width, r.times ? 3 : 0)}%` }} /></span></td>
                            <td className="r num"><b>{r.timesText}</b></td>
                          </tr>
                        ); })}
                        <tr className="tot"><td>Total</td><td className="r num">{f.total.book}</td><td className="r num">{f.total.bid}</td><td /><td className="r num">{f.total.timesText}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
            <p className="b-fine">Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Subscription measures demand; it is not a forecast of returns or a recommendation.</p>
          </>
        )}
      </div>
    </>
  );
}
