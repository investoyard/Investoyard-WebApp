'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { SubFocus, SubscriptionModel } from '@/core/models';
import { dayMonYear, lowerFirst } from '@/core/format';
import { Bar, BoardTag, Hero, Icon, Logo, State, ring, shade, xs } from './parts';

type Row = SubscriptionModel['closed'][number];

/* The cumulative trend: one point per bidding day, total multiple as recorded that day. */
function Trend({ f }: { f: SubFocus }) {
  const pts = f.days.filter((d) => d.total != null) as (SubFocus['days'][number] & { total: number })[];
  if (pts.length === 0) return <p className="p-muted">Day-wise figures are recorded while an issue is bidding; none were kept for this one.</p>;
  const W = 380, H = 230, L = 40, R = 22, T = 28, B = 34;
  const max = Math.max(1, ...pts.map((p) => p.total)) * 1.15;
  const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = pts.map((p, i) => `${x(i)},${y(p.total)}`).join(' ');
  const area = `${x(0)},${H - B} ${line} ${x(pts.length - 1)},${H - B}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  return (
    <svg className="p-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Subscription by day: ${pts.map((p) => `${p.label} ${p.total.toFixed(2)} times`).join(', ')}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line2)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t >= 10 ? Math.round(t) : t.toFixed(1)}×</text>
        </g>
      ))}
      <polygon points={area} fill="var(--brand)" opacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.total)} r="5.5" fill="#fff" stroke="var(--brand)" strokeWidth="3" />
          <text x={x(i)} y={y(p.total) - 12} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)">{p.total.toFixed(2)}×</text>
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--muted)">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* Overall / QIB / NII / Retail for the chosen issue beside two others on the same board. */
function Compare({ items }: { items: { name: string; f: SubFocus }[] }) {
  const series: [string, (f: SubFocus) => number | null][] = [
    ['Overall', (f) => f.total.times],
    ['QIB', (f) => f.rows.find((r) => r.key === 'qib')?.times ?? null],
    ['NII', (f) => f.rows.find((r) => r.key === 'nii')?.times ?? null],
    ['Retail', (f) => f.rows.find((r) => r.key === 'retail')?.times ?? null],
  ];
  const max = Math.max(1, ...items.flatMap((it) => series.map(([, g]) => g(it.f) || 0)));
  const W = 380, H = 240, B = 34, T = 30, gw = (W - 20) / items.length, bw = Math.min(20, (gw - 24) / 4);
  return (
    <>
      <ul className="p-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 6 }}>
        {series.map(([l], i) => <li key={l} style={{ padding: 0, fontSize: 13 }}><i style={{ background: shade(i), borderRadius: 3 }} />{l}</li>)}
      </ul>
      <svg className="p-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Subscription comparison with similar IPOs">
        <line x1="10" x2={W - 10} y1={H - B} y2={H - B} stroke="var(--line)" />
        {items.map((it, gi) => {
          const gx = 10 + gi * gw + (gw - bw * 4 - 9) / 2;
          return (
            <g key={it.name}>
              {series.map(([l, g], si) => {
                const v = g(it.f) || 0;
                const h = Math.max(v > 0 ? 3 : 0, (H - B - T) * (v / max));
                return <rect key={l} x={gx + si * (bw + 3)} y={H - B - h} width={bw} height={h} rx="3" fill={shade(si)} />;
              })}
              <text x={gx + (bw * 4 + 9) / 2} y={H - B - Math.max(3, (H - B - T) * ((it.f.total.times || 0) / max)) - 8} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)">{xs(it.f.total.times)}</text>
              <text x={gx + (bw * 4 + 9) / 2} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--muted)">{it.name.length > 14 ? it.name.slice(0, 13) + '…' : it.name}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const rowsAll: (Row & { live: boolean })[] = useMemo(
    () => [...model.live.map((r) => ({ ...r, live: true })), ...model.closed.map((r) => ({ ...r, live: false }))].filter((r) => model.focus[r.sym]),
    [model],
  );
  const [board, setBoard] = useState('all');
  const [status, setStatus] = useState('all');
  const list = rowsAll.filter((r) => (board === 'all' || r.board === board) && (status === 'all' || (status === 'live') === r.live));
  const [sel, setSel] = useState(rowsAll[0]?.sym || '');
  const [mode, setMode] = useState<'day' | 'cat'>('day');
  const cur = list.find((r) => r.sym === sel) || list[0];
  const f = cur ? model.focus[cur.sym] : undefined;

  /* Stat strip: computed over every issue on the page, live and closed. */
  const totals = rowsAll.map((r) => model.focus[r.sym].total.times).filter((v): v is number => v != null);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
  const top = [...rowsAll].sort((a, b) => (model.focus[b.sym].total.times || 0) - (model.focus[a.sym].total.times || 0))[0];
  const catMean = (k: string) => {
    const v = rowsAll.map((r) => model.focus[r.sym].rows.find((x) => x.key === k)?.times).filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const cats: [string, string][] = [['qib', 'QIB'], ['nii', 'NII'], ['retail', 'Retail'], ['employee', 'Employee']];
  const active = cats.map(([k, l]) => ({ l, v: catMean(k) })).filter((c) => c.v != null).sort((a, b) => b.v! - a.v!)[0];

  const similar = cur
    ? rowsAll.filter((r) => r.sym !== cur.sym && r.board === cur.board).sort((a, b) => Math.abs(Date.parse(a.close || '') - Date.parse(cur.close || '')) - Math.abs(Date.parse(b.close || '') - Date.parse(cur.close || ''))).slice(0, 2)
    : [];

  return (
    <>
      <Hero icon="chart" title="IPO subscription" sub="Live subscription, category-wise break-up and comparison, consolidated from NSE and BSE." />
      <div className="p-wrap p-main">
        <dl className="p-stats">
          <div className="p-stat"><span className="p-tile"><Icon name="layers" size={24} /></span><div className="p-stat-t"><dt>IPOs on this page</dt><dd>{rowsAll.length}</dd></div></div>
          <div className="p-stat"><span className="p-tile pos"><Icon name="trend" size={24} /></span><div className="p-stat-t"><dt>Average subscription</dt><dd>{xs(avg)}</dd></div></div>
          <div className="p-stat"><span className="p-tile amber"><Icon name="trophy" size={24} /></span><div className="p-stat-t"><dt>Highest subscription</dt>{top ? <small>{top.name}</small> : null}<dd>{top ? xs(model.focus[top.sym].total.times) : '—'}</dd></div></div>
          <div className="p-stat"><span className="p-tile"><Icon name="users" size={24} /></span><div className="p-stat-t"><dt>Highest category on average</dt><dd style={{ fontSize: 22 }}>{active ? `${active.l} · ${xs(active.v)}` : '—'}</dd></div></div>
        </dl>

        {model.live.length === 0 ? (
          <p className="p-muted" style={{ marginTop: 20 }}>No issue is bidding right now{model.next ? <>; next is <Link className="p-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}</> : null}. Final figures for issues closed in the last five weeks are below.</p>
        ) : null}

        <div className="p-card p-filterbar" style={{ marginTop: 20 }}>
          <label>Select IPO
            <select className="p-select" value={cur?.sym || ''} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 240, maxWidth: 320 }}>
              {list.map((r) => <option key={r.sym} value={r.sym}>{r.name}{r.live ? ' (live)' : ''}</option>)}
            </select>
          </label>
          <label>Board
            <select className="p-select" value={board} onChange={(e) => setBoard(e.target.value)}><option value="all">All</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select>
          </label>
          <label>Status
            <select className="p-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option><option value="live">Bidding now</option><option value="closed">Closed</option></select>
          </label>
          {cur && (cur as any).asOf ? <span className="p-asof"><Icon name="refresh" size={16} />Last updated {(cur as any).asOf}<span className="p-dot-live" aria-hidden="true" /></span> : null}
        </div>

        {!cur || !f ? (
          <div className="p-card p-empty" style={{ marginTop: 22 }}><strong>No issue matches</strong>Change the board or status filter.</div>
        ) : (
          <>
            <div className="p-row2" style={{ marginTop: 22 }}>
              <section className="p-card p-card-pad" aria-label={`${cur.name} summary`}>
                <div className="p-ipo-top" style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}>
                  <Logo ipo={cur} />
                  <div style={{ minWidth: 0 }}>
                    <Link className="p-ipo-name" href={cur.href}>{cur.name}</Link>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}><BoardTag board={cur.board} /><State tone={cur.tone}>{cur.status}</State></div>
                  </div>
                </div>
                <dl className="p-figs" style={{ marginTop: 18 }}>
                  <div className="p-fig"><Icon name="coins" size={15} /><dt>Issue size</dt><dd>{cur.size}</dd></div>
                  <div className="p-fig"><Icon name="tag" size={15} /><dt>Price band</dt><dd>{cur.band}</dd></div>
                  <div className="p-fig"><Icon name="box" size={15} /><dt>Lot size</dt><dd>{cur.lot}</dd></div>
                </dl>
                <div className="p-datebar num" style={{ marginTop: 16 }}>
                  <span><Icon name="calendar" size={16} />Open: {cur.open ? dayMonYear(cur.open) : '—'}</span>
                  <span>Close: {cur.close ? dayMonYear(cur.close) : '—'}</span>
                </div>
              </section>
              <section className="p-card p-card-pad" aria-label="Overall and category-wise subscription">
                <div className="p-row2" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.2fr)', gap: 26 }}>
                  <div>
                    <h3 className="dsp" style={{ fontSize: 17, fontWeight: 700 }}>Overall subscription</h3>
                    <p className="p-big" style={{ marginTop: 10 }}>{f.total.timesText}</p>
                    <dl className="p-kv">
                      <div><dt>Applications</dt><dd>{f.total.applications || '—'}</dd></div>
                      <div><dt>Shares bid for</dt><dd>{f.total.bid}</dd></div>
                    </dl>
                  </div>
                  <div>
                    <h3 className="dsp" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Category-wise (×)</h3>
                    <ul className="p-catrows">
                      {f.rows.filter((r) => !r.nested).map((r) => <li key={r.key}><span>{r.label}</span><Bar width={r.width} /><b>{r.timesText}</b></li>)}
                    </ul>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-row3" style={{ marginTop: 22 }}>
              <section className="p-card p-card-pad" aria-labelledby="tr-h">
                <div className="p-card-h"><h3 id="tr-h">Subscription trend</h3></div>
                <Trend f={f} />
              </section>
              <section className="p-card p-card-pad" aria-labelledby="sh-h">
                <div className="p-card-h"><h3 id="sh-h">Who applied</h3><span className="p-muted" style={{ fontSize: 13 }}>Share of applications</span></div>
                {f.share.length ? (
                  <div className="p-donut-wrap">
                    <div className="p-donut" style={{ background: ring(f.share.map((s) => s.pct)) }}>
                      <div className="p-donut-c"><strong>{f.total.applications || '—'}</strong><span>applications</span></div>
                    </div>
                    <ul className="p-legend">{f.share.map((s, i) => <li key={s.label}><i style={{ background: shade(i) }} />{s.label}<b>{s.pct}%</b></li>)}</ul>
                  </div>
                ) : <p className="p-muted">The exchanges have not published application counts for this issue.</p>}
              </section>
              <section className="p-card p-card-pad" aria-labelledby="cmp-h">
                <div className="p-card-h"><h3 id="cmp-h">Compared with similar IPOs</h3></div>
                {similar.length ? <Compare items={[cur, ...similar].map((r) => ({ name: r.name, f: model.focus[r.sym] }))} /> : <p className="p-muted">No other {cur.board.toLowerCase()} issue on this page to compare with.</p>}
              </section>
            </div>

            <section className="p-card" style={{ marginTop: 22 }} aria-labelledby="dw-h">
              <div className="p-card-h p-card-pad" style={{ marginBottom: 0, paddingBottom: 14 }}>
                <h3 id="dw-h"><Icon name="list" size={20} />{mode === 'day' ? 'Day-wise subscription' : 'Category-wise subscription'}</h3>
                <div className="p-view" role="group" aria-label="Table">
                  <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Day-wise</button>
                  <button type="button" aria-pressed={mode === 'cat'} onClick={() => setMode('cat')}>Category-wise</button>
                </div>
              </div>
              <div className="p-table-wrap">
                {mode === 'day' ? (
                  f.days.length ? (
                    <table className="p-table">
                      <thead><tr><th>Day</th><th className="r">QIB</th><th className="r">NII</th><th className="r">Retail</th><th className="r hide-s">Employee</th><th className="r">Overall</th></tr></thead>
                      <tbody>
                        {f.days.map((d, i) => (
                          <tr key={d.label} className={i === f.days.length - 1 ? 'hl' : undefined}>
                            <td>{d.label} <span className="p-muted hide-s">({d.date})</span></td>
                            <td className="r">{xs(d.qib)}</td><td className="r">{xs(d.nii)}</td><td className="r">{xs(d.retail)}</td><td className="r hide-s">{xs(d.employee)}</td>
                            <td className="r"><span className={`p-badge${i === f.days.length - 1 ? ' brand' : ' mute'}`}>{xs(d.total)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="p-muted" style={{ padding: '0 24px 22px' }}>No day-wise record was kept for this issue.</p>
                ) : (
                  <table className="p-table">
                    <thead><tr><th>Category</th><th className="r hide-s">Shares offered</th><th className="r">Shares bid for</th><th className="r">Times</th></tr></thead>
                    <tbody>
                      {f.catRows.map((r) => <tr key={r.key} className={r.nested ? 'nested' : undefined}><td>{r.label}</td><td className="r hide-s">{r.book}</td><td className="r">{r.bid}</td><td className="r"><span className="p-badge">{r.timesText}</span></td></tr>)}
                      <tr className="hl"><td>Total</td><td className="r hide-s">{f.total.book}</td><td className="r">{f.total.bid}</td><td className="r"><span className="p-badge brand">{f.total.timesText}</span></td></tr>
                    </tbody>
                  </table>
                )}
              </div>
              <p className="p-muted" style={{ padding: '14px 24px 20px', fontSize: 13 }}>
                Times = shares bid for ÷ shares offered. Day-wise figures are as recorded each day, with QIB measured on the whole QIB offer; the category table excludes the anchor portion from QIB. Subscription measures demand, not returns, and is not a recommendation.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}
