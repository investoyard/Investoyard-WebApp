'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { lowerFirst } from '@/core/format';
import { Mini } from './parts';

type Row = SubscriptionModel['closed'][number];

/* One table per window. The overall multiple leads; the categories follow on the same line. */
function Table({ id, title, rows, live }: { id: string; title: string; rows: Row[]; live?: boolean }) {
  return (
    <section className="l-sec" aria-labelledby={id}>
      <div className="l-sec-h"><h2 id={id}>{title}</h2><span className="l-label">{rows.length} issue{rows.length === 1 ? '' : 's'}</span></div>
      {rows.length === 0 ? <p className="l-empty">No issue on this board in this window.</p> : (
        <div className="l-table-wrap">
          <table className="l-table">
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col" className="r hide-s">QIB</th>
                <th scope="col" className="r hide-s">NII</th>
                <th scope="col" className="r hide-s">Retail</th>
                <th scope="col" className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sym}>
                  <td>
                    <Link href={r.href}>{r.name}</Link>
                    <small>{r.board} · {r.status}{live && (r as any).asOf ? ` · updated ${(r as any).asOf}` : ''}</small>
                    <Mini width={r.bar} />
                  </td>
                  <td className="r hide-s">{r.qib}</td>
                  <td className="r hide-s">{r.nii}</td>
                  <td className="r hide-s">{r.retail}</td>
                  <td className="r">{r.subs || '—'}</td>
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
  const byDemand = (rows: Row[]) => [...rows].filter(keep).sort((a, b) => (b.subsN ?? 0) - (a.subsN ?? 0));
  return (
    <div className="l-page">
      <h1>Subscription</h1>
      <p className="l-dateline l-label">Consolidated from NSE and BSE</p>
      <p className="l-lede">
        How many times each issue has been bid for, overall and by investor category.
        {model.live.length === 0 ? <> No issue is bidding right now{model.next ? <>; next is <Link className="l-link" href={model.next.href}>{model.next.name}</Link>, {lowerFirst(model.next.status)}</> : null}.</> : null}
      </p>
      <div className="l-bar-ctrl">
        <div className="l-ctrl" role="group" aria-label="Board">
          {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" className="l-opt" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All boards' : b}</button>)}
        </div>
      </div>
      {model.live.length ? <Table id="lv-h" title="Bidding now" rows={byDemand(model.live)} live /> : null}
      <Table id="cl-h" title="Closed in the last five weeks" rows={byDemand(model.closed)} />
      <p className="l-note">Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. The bar beside each name is relative demand on a log scale; subscription measures demand, not returns, and is not a recommendation.</p>
    </div>
  );
}
