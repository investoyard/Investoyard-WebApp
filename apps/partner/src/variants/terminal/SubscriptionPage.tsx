'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { lowerFirst } from '@/core/format';
import { Bar, Logo, St } from './parts';

type Row = SubscriptionModel['closed'][number];
const CATS: [keyof Row, string][] = [['qib', 'QIB'], ['nii', 'NII'], ['hni', 'bHNI'], ['hni2', 'sHNI'], ['retail', 'Retail'], ['employee', 'Employee']];
/* Columns leave in a planned order as the table narrows, so it never scrolls sideways. */
const HIDE: Partial<Record<keyof Row, string>> = { hni: ' t-s1', hni2: ' t-s1', employee: ' t-s2', nii: ' t-s3' };

/* Demand by investor category in one table per window; the total carries a bar so the eye finds the outliers. */
function Table({ id, title, rows, live }: { id: string; title: string; rows: Row[]; live?: boolean }) {
  const sorted = [...rows].sort((a, b) => (b.subsN ?? 0) - (a.subsN ?? 0));
  return (
    <section className="t-panel" aria-labelledby={id} style={{ marginBottom: 18 }}>
      <div className="t-ph"><h2 id={id}>{title}</h2><span className="t-muted num" style={{ fontSize: 13 }}>{sorted.length} issue{sorted.length === 1 ? '' : 's'}</span></div>
      {sorted.length === 0 ? <div className="t-empty" style={{ padding: 28 }}>No issue on this board in this window.</div> : (
        <div className="t-table-wrap">
          <table className="t-table t-subt">
            <thead>
              <tr>
                <th>Company</th>
                {CATS.map(([k, l]) => <th key={String(k)} className={'r' + (HIDE[k] || '')}>{l}</th>)}
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.sym}>
                  <td>
                    <div className="t-co">
                      <Logo ipo={r} />
                      <div style={{ minWidth: 0 }}>
                        <Link className="t-co-name" href={r.href}>{r.name}</Link>
                        <span className="t-co-sub">{r.board} · {live && (r as any).asOf ? `updated ${(r as any).asOf}` : r.status}</span>
                      </div>
                    </div>
                  </td>
                  {CATS.map(([k]) => <td key={String(k)} className={'r' + (HIDE[k] || '')}>{String(r[k]) === '—' ? <span className="t-dash">—</span> : String(r[k])}</td>)}
                  <td className="r"><span className="t-demand"><Bar width={r.bar} /><b>{r.subs || '—'}</b></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const [board, setBoard] = useState('all');
  const keep = (c: Row) => board === 'all' || c.board === board;
  return (
    <div className="t-page">
      <div className="t-intro">
        <div><h1>Subscription</h1><p>Demand by investor category, consolidated from NSE and BSE.</p></div>
        <div className="t-seg" role="group" aria-label="Board">
          {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All boards' : b}</button>)}
        </div>
      </div>
      {model.live.length === 0 ? (
        <div className="t-panel t-pb" style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>No issue is bidding right now.{model.next ? <> Next: <Link className="t-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}.</> : null}</span>
          {model.next ? <St tone="upcoming">{model.next.status}</St> : null}
        </div>
      ) : <Table id="lv-h" title="Bidding now" rows={model.live.filter(keep)} live />}
      <Table id="cl-h" title="Final — closed in the last five weeks" rows={model.closed.filter(keep)} />
      <p className="t-note">Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Subscription measures demand; it is not a gain or a recommendation.</p>
    </div>
  );
}
