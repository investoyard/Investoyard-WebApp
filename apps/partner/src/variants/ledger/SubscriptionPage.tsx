'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { lowerFirst } from '@/core/format';
import { Bar } from './parts';

type Row = SubscriptionModel['closed'][number];

function Table({ id, title, rows, live }: { id: string; title: string; rows: Row[]; live?: boolean }) {
  const sorted = [...rows].sort((a, b) => (b.subsN ?? 0) - (a.subsN ?? 0));
  return (
    <section className="l-sec" aria-labelledby={id}>
      <div className="l-sec-h"><h2 id={id}>{title}</h2><span className="l-muted num">{sorted.length} issue{sorted.length === 1 ? '' : 's'}</span></div>
      {sorted.length === 0 ? <div className="l-empty">No issue on this board in this window.</div> : (
        <div className="l-table-wrap">
          <table className="l-table">
            <thead><tr><th>Issue</th><th className="r hide-s">QIB</th><th className="r hide-s">NII</th><th className="r hide-s">Retail</th><th className="hide-s" style={{ width: '18%' }}><span className="sr">Demand</span></th><th className="r">Total</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.sym}>
                  <td><Link className="l-tname" href={r.href}>{r.name}</Link><small>{r.board} · {live && (r as any).asOf ? `updated ${(r as any).asOf}` : r.status}</small></td>
                  <td className="r hide-s">{r.qib}</td>
                  <td className="r hide-s">{r.nii}</td>
                  <td className="r hide-s">{r.retail}</td>
                  <td className="hide-s"><Bar width={r.bar} /></td>
                  <td className="r"><b>{r.subs || '—'}</b></td>
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
    <div className="l-page">
      <p className="l-label">Consolidated from NSE and BSE</p>
      <h1 className="l-h1" style={{ marginTop: 10 }}>Subscription</h1>
      <p className="l-lede">
        How many times each issue has been bid for, overall and by investor category.
        {model.live.length === 0 ? <> No issue is bidding right now{model.next ? <>; next is <Link className="l-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}</> : null}.</> : null}
      </p>
      <div className="l-tabs" role="group" aria-label="Board" style={{ marginTop: 22 }}>
        {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" className="l-tab" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All boards' : b}</button>)}
      </div>
      {model.live.length ? <Table id="lv-h" title="Bidding now" rows={model.live.filter(keep)} live /> : null}
      <Table id="cl-h" title="Closed in the last five weeks" rows={model.closed.filter(keep)} />
      <p className="l-note">Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Subscription measures demand, not returns, and is not a recommendation.</p>
    </div>
  );
}
