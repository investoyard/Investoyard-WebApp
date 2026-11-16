'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { logWidth, lowerFirst, wdDayMon } from '@/core/format';
import { St, heat } from './parts';

type Row = SubscriptionModel['closed'][number];
const CATS: [keyof Row, string][] = [['qib', 'QIB'], ['nii', 'NII'], ['hni', 'bHNI'], ['hni2', 'sHNI'], ['retail', 'RII'], ['employee', 'EMP']];
const n = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(v) ? v : 0; };

/* A heat matrix: one row per issue, one cell per category, coloured by demand. */
export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const [board, setBoard] = useState('all');
  const keep = (c: Row) => board === 'all' || c.board === board;
  const live = model.live.filter(keep);
  const closed = model.closed.filter(keep);
  const max = Math.max(1, ...[...model.live, ...model.closed].flatMap((r) => CATS.map(([k]) => n(String(r[k])))));

  return (
    <div className="t-page">
      <div className="t-intro" style={{ marginBottom: 0 }}>
        <div><h1>Subscription matrix</h1><p>Demand by investor category, consolidated from NSE and BSE.</p></div>
        <div className="t-seg" role="group" aria-label="Board">
          {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All' : b}</button>)}
        </div>
      </div>

      {model.live.length === 0 ? (
        <div className="t-callout">
          <span>No issue is bidding right now.{model.next ? <> Next: <span className="mono" style={{ color: 'var(--brand-lite)' }}>{model.next.sym}</span> {lowerFirst(model.next.status)}.</> : null}</span>
          <Link href="/" className="t-btn t-btn-s">Open blotter</Link>
        </div>
      ) : null}

      {live.length ? <Matrix title="Bidding now" rows={live} max={max} live /> : null}
      <Matrix title="Final — closed in the last five weeks" rows={closed} max={max} />
      <p className="t-note">Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Heat shows relative demand across this table; it is not a gain or a recommendation.</p>
    </div>
  );
}

function Matrix({ title, rows, max, live = false }: { title: string; rows: Row[]; max: number; live?: boolean }) {
  return (
    <section className="t-panel" aria-label={title}>
      <div className="t-ph"><h2>{title}</h2><span className="t-label mono">{rows.length} issues</span></div>
      {rows.length === 0 ? <div className="t-empty"><strong>Nothing to show</strong>Try another board.</div> : (
        <>
          <div className="t-table-wrap t-hide-m">
            <table className="t-table">
              <thead><tr><th>Symbol</th><th>Company</th><th>{live ? 'Status' : 'Closed'}</th>{CATS.map(([, l]) => <th key={l} className="r">{l}</th>)}<th className="r">Total</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sym}>
                    <td><Link href={r.href} className="t-sym mono">{r.sym}</Link></td>
                    <td><Link href={r.href} className="t-co">{r.name}</Link></td>
                    <td>{live ? <St tone={r.tone}>{r.status}</St> : <span className="mono t-muted">{r.close ? wdDayMon(r.close) : '—'}</span>}</td>
                    {CATS.map(([k, l]) => {
                      const v = String(r[k]);
                      return <td key={l} className="t-heat mono" style={v === '—' ? undefined : heat(logWidth(n(v), max))}>{v === '—' ? <span className="t-dash">—</span> : v}</td>;
                    })}
                    <td className="t-heat mono" style={{ ...heat(r.bar), fontWeight: 700 }}>{r.subs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="t-mrows">
            {rows.map((r) => (
              <li key={r.sym}>
                <Link href={r.href}>
                  <span className="t-sym mono">{r.sym}</span>
                  <span className="t-mr-v mono">{r.subs}</span>
                  <span className="t-mr-s mono">QIB {r.qib} · NII {r.nii} · RII {r.retail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
