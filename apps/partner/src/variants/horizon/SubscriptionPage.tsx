'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { SubFocus, SubscriptionModel } from '@/core/models';
import { dayMon, lowerFirst } from '@/core/format';
import { Arrow, Hero, Icon, shade, type IconName } from './parts';

type Row = SubscriptionModel['closed'][number] & { asOf?: string };
type Status = 'all' | 'live' | 'closed';
type Sort = 'overall' | 'close' | 'name';

const xs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);
const TILE: Record<string, IconName> = { qib: 'layers', nii: 'users', retail: 'users', employee: 'building', shareholder: 'coins' };

/* Day-wise overall subscription as a line. Two points make a trend; one is just a figure. */
function Trend({ f }: { f: SubFocus }) {
  const pts = f.days.filter((d) => d.total != null) as (SubFocus['days'][number] & { total: number })[];
  if (pts.length < 2) {
    return <p className="h-tbl-none">{pts.length ? `Day-wise figures start after the second bidding day. ${pts[0].label}: ${xs(pts[0].total)}.` : 'No day-wise figures recorded for this issue.'}</p>;
  }
  const W = 380, H = 220, L = 40, R = 12, T = 26, B = 26;
  const max = Math.max(...pts.map((p) => p.total)) * 1.12 || 1;
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - B} L${L} ${H - B} Z`;
  return (
    <svg className="h-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Overall subscription by day: ${pts.map((p) => `${p.label} ${xs(p.total)}`).join(', ')}`}>
      <defs><linearGradient id="hzArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--brand)" stopOpacity="0.02" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="h-trend-t">{t < 10 ? t.toFixed(1) : Math.round(t)}×</text></g>
      ))}
      <path d={area} fill="url(#hzArea)" />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.total)} r="4.5" fill="#fff" stroke="var(--brand)" strokeWidth="2" />
          <text x={x(i)} y={y(p.total) - 10} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="h-trend-v">{xs(p.total)}</text>
          <text x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="h-trend-t">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const all: Row[] = useMemo(() => [...model.live, ...model.closed], [model]);
  const liveSyms = useMemo(() => new Set(model.live.map((r) => r.sym)), [model.live]);
  const [sym, setSym] = useState(all[0]?.sym || '');
  const [status, setStatus] = useState<Status>(model.live.length ? 'live' : 'all');
  const [board, setBoard] = useState('all');
  const [sector, setSector] = useState('all');
  const [sort, setSort] = useState<Sort>('overall');

  const sel = all.find((r) => r.sym === sym) || all[0];
  const f = sel ? model.focus[sel.sym] : undefined;
  const dayOf = (r: Row) => {
    if (!liveSyms.has(r.sym)) return 'Final';
    const d = model.focus[r.sym]?.days;
    return d && d.length ? d[d.length - 1].label : 'Day 1';
  };
  const sectors = useMemo(() => Array.from(new Set(all.map((r) => r.industry).filter(Boolean) as string[])).sort(), [all]);
  const rows = useMemo(() => {
    const out = all.filter((r) => (status === 'all' || (status === 'live') === liveSyms.has(r.sym)) && (board === 'all' || r.board === board) && (sector === 'all' || r.industry === sector));
    return out.sort((a, b) => (sort === 'overall' ? (b.subsN ?? -1) - (a.subsN ?? -1) : sort === 'close' ? (a.close < b.close ? 1 : a.close > b.close ? -1 : 0) : a.name.localeCompare(b.name)));
  }, [all, status, board, sector, sort, liveSyms]);
  const top = [...all].filter((r) => r.subsN != null).sort((a, b) => b.subsN! - a.subsN!).slice(0, 5);

  const exportCsv = () => {
    const head = ['IPO', 'Status', 'Sector', 'Price band', 'Issue size', 'Overall', 'QIB', 'NII', 'Retail', 'Employee', 'Updated'];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = rows.map((r) => [r.legal, dayOf(r), r.industry || '', r.band, r.size, r.subs || '', r.qib, r.nii, r.retail, r.employee, r.asOf || (r.close ? `Closed ${dayMon(r.close)}` : '')].map((v) => esc(String(v))).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ipo-subscription.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const tiles = f ? f.rows.filter((r) => ['qib', 'nii', 'retail', 'employee', 'shareholder'].includes(r.key) && r.times != null).slice(0, 4) : [];
  let at = 0;
  const ring = f && f.share.length ? `conic-gradient(${f.share.map((s, i) => { const seg = `${shade(i)} ${at}% ${at + s.pct}%`; at += s.pct; return seg; }).join(', ')}${at < 100 ? `, var(--line2) ${at}% 100%` : ''})` : null;

  return (
    <>
      <Hero eyebrow="IPO subscription" title="IPO subscription demand" sub="Category-wise demand for current and recently closed IPOs, consolidated from NSE and BSE." art="exchange" />
      <div className="h-wrap h-main">
        {!sel || !f ? (
          <div className="h-card h-empty"><strong className="h-h3">No subscription figures right now</strong><p>{model.next ? <>Next to open: <Link className="h-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}.</> : 'Figures appear here once bidding starts.'}</p></div>
        ) : (
          <>
            <div className="h-pick">
              <label className="h-pick-l">Showing
                <select className="h-field" value={sel.sym} onChange={(e) => setSym(e.target.value)}>
                  {model.live.length ? <optgroup label="Bidding now">{model.live.map((r) => <option key={r.sym} value={r.sym}>{r.name}</option>)}</optgroup> : null}
                  {model.closed.length ? <optgroup label="Closed in the last five weeks">{model.closed.map((r) => <option key={r.sym} value={r.sym}>{r.name}</option>)}</optgroup> : null}
                </select>
              </label>
              <span className="h-muted">{liveSyms.has(sel.sym) ? `${dayOf(sel)} of bidding${sel.asOf ? ` · updated ${sel.asOf}` : ''}` : `Final figures · closed ${dayMon(sel.close)}`}</span>
              <Link className="h-link" href={sel.href}>Full IPO details <Arrow /></Link>
            </div>

            <div className="h-tiles" data-n={tiles.length}>
              <div className="h-tile h-tile-main">
                <span className="h-tile-k">Overall subscription</span>
                <strong className="num">{f.total.timesText}</strong>
                <span className="h-tile-s">{f.total.applications ? `${f.total.applications} applications` : `${f.total.bid} shares bid`}</span>
                <Icon name="trend" size={34} stroke={1.6} />
              </div>
              {tiles.map((r) => (
                <div key={r.key} className="h-tile">
                  <Icon name={TILE[r.key] || 'users'} size={22} />
                  <span className="h-tile-k">{r.label}</span>
                  <strong className="num">{r.timesText}</strong>
                </div>
              ))}
            </div>

            <div className="h-row h-row-3">
              <section className="h-card" aria-labelledby="tr-h">
                <h2 id="tr-h" className="h-h3">Subscription trend (overall)</h2>
                <Trend f={f} />
              </section>
              <section className="h-card" aria-labelledby="cw-h">
                <h2 id="cw-h" className="h-h3">Category-wise subscription</h2>
                <div className="h-cw">
                  {ring ? (
                    <div className="h-donut" style={{ background: ring }} aria-hidden="true"><span><b className="num">{f.total.timesText}</b>Overall</span></div>
                  ) : null}
                  <table className="h-cw-t">
                    <thead><tr><th>Category</th><th className="r">Times</th>{f.share.length ? <th className="r">Applications</th> : null}</tr></thead>
                    <tbody>
                      {f.rows.filter((r) => !r.nested).map((r) => {
                        const sh = f.share.find((s) => r.label.startsWith(s.label));
                        const idx = f.share.findIndex((s) => r.label.startsWith(s.label));
                        return (
                          <tr key={r.key}>
                            <td><i style={{ background: idx >= 0 ? shade(idx) : 'var(--line)' }} aria-hidden="true" />{r.label}</td>
                            <td className="r num"><b>{r.timesText}</b></td>
                            {f.share.length ? <td className="r num">{sh ? `${sh.pct}%` : '—'}</td> : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="h-note">{f.share.length ? 'The ring shows each category’s share of applications received.' : 'The exchange has not published application counts for this issue.'}</p>
              </section>
              <section className="h-card" aria-labelledby="hd-h">
                <h2 id="hd-h" className="h-h3"><Icon name="trophy" size={20} />Highest demand IPOs</h2>
                <ol className="h-hd">
                  {top.map((r, i) => (
                    <li key={r.sym}><span className="h-rank-n num">{i + 1}</span><button type="button" onClick={() => setSym(r.sym)}>{r.name}</button><b className="num">{r.subs}</b></li>
                  ))}
                </ol>
              </section>
            </div>

            <section className="h-card h-card-flush" aria-labelledby="sd-h">
              <div className="h-card-bar">
                <h2 id="sd-h" className="h-h2">IPO subscription details</h2>
                <div className="h-filters">
                  <label className="h-sel"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as Status)}><option value="live">Bidding now</option><option value="closed">Closed</option><option value="all">All</option></select></label>
                  <label className="h-sel"><span>Board</span><select value={board} onChange={(e) => setBoard(e.target.value)}><option value="all">All</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
                  {sectors.length ? <label className="h-sel"><span>Sector</span><select value={sector} onChange={(e) => setSector(e.target.value)}><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label> : null}
                  <label className="h-sel"><span>Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="overall">Subscription (high to low)</option><option value="close">Close date (newest)</option><option value="name">Name (A–Z)</option></select></label>
                  <button type="button" className="h-btn h-btn-p h-btn-sm" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={16} />Export</button>
                </div>
              </div>
              <div className="h-tbl-wrap">
                <table className="h-tbl h-tbl-sub">
                  <thead><tr><th className="num h-s2">#</th><th>IPO name</th><th className="h-s1">Sector</th><th className="r h-s3">Price band</th><th className="r h-s4">Issue size</th><th className="r h-hl">Overall</th><th className="r">QIB</th><th className="r h-s4">NII</th><th className="r">Retail</th><th className="r h-s2">Employee</th><th className="h-s3">Updated</th></tr></thead>
                  <tbody>
                    {rows.length ? rows.map((r, i) => (
                      <tr key={r.sym} className={r.sym === sel.sym ? 'is-sel' : undefined}>
                        <td className="num h-muted h-s2">{i + 1}</td>
                        <td><div className="h-subname"><Link href={r.href}>{r.name}</Link><span className={`h-day${liveSyms.has(r.sym) ? '' : ' fin'}`}>{dayOf(r)}</span></div></td>
                        <td className="h-muted h-s1">{r.industry || '—'}</td>
                        <td className="r num h-s3">{r.band}</td>
                        <td className="r num h-s4">{r.size}</td>
                        <td className="r num h-hl"><b>{r.subs || '—'}</b></td>
                        <td className="r num">{r.qib}</td>
                        <td className="r num h-s4">{r.nii}</td>
                        <td className="r num">{r.retail}</td>
                        <td className="r num h-s2">{r.employee}</td>
                        <td className="h-muted num h-s3">{r.asOf || (r.close ? `Closed ${dayMon(r.close)}` : '—')}</td>
                      </tr>
                    )) : <tr><td colSpan={11} className="h-tbl-none">No issue matches these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            {f.rows.some((r) => r.label.includes('Ex. Anchor')) ? <p className="h-fine">QIB (Ex. Anchor) excludes the anchor portion, so it is measured against the shares left for the public book.</p> : null}
            <p className="h-fine">Times = shares bid for ÷ shares offered in that category. Day-wise figures are recorded at the end of each bidding day. Subscription measures demand; it is not a forecast of returns or a recommendation.</p>
          </>
        )}
      </div>
    </>
  );
}
