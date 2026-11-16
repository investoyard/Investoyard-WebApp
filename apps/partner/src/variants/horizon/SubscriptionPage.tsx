'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { lowerFirst } from '@/core/format';
import { Arrow } from './parts';

type Row = SubscriptionModel['closed'][number];

/*
 * A ranked chart rather than a table: one long bar per issue, ordered by
 * overall demand, with the three category multiples written underneath. Bars
 * use the log width the model already computed across this whole set, so a
 * 2× issue still shows beside a 300× one.
 */
function Chart({ title, rows, live }: { title: string; rows: Row[]; live?: boolean }) {
  const sorted = [...rows].sort((a, b) => (b.subsN ?? 0) - (a.subsN ?? 0));
  return (
    <section className="h-sec" aria-labelledby={`${live ? 'lv' : 'cl'}-h`} style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="h-wrap">
        <div className="h-sec-h" style={{ marginBottom: 20 }}>
          <div><p className="h-kicker">{live ? 'Bidding now' : 'Final figures'}</p><h2 id={`${live ? 'lv' : 'cl'}-h`} className="dsp">{title}</h2></div>
          <span className="h-dim num">{sorted.length} issue{sorted.length === 1 ? '' : 's'}</span>
        </div>
        {sorted.length === 0 ? <div className="h-empty"><strong className="dsp">Nothing to show</strong><p>No issue on this board in this window.</p></div> : (
          <ol className="h-chart">
            {sorted.map((r) => (
              <li key={r.sym}>
                <Link href={r.href} className="h-chart-name">
                  {r.name}
                  <small>{r.board} · {r.status}{live && 'asOf' in r && (r as any).asOf ? ` · updated ${(r as any).asOf}` : ''}</small>
                </Link>
                <div className="h-rank-bar" aria-hidden="true"><span style={{ width: `${r.bar}%` }} /></div>
                <div className="h-chart-v dsp num">{r.subs || '—'}</div>
                <div className="h-chart-cats num">QIB {r.qib} · NII {r.nii} · Retail {r.retail}{r.employee !== '—' ? ` · Employee ${r.employee}` : ''}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const [board, setBoard] = useState('all');
  const keep = (c: Row) => board === 'all' || c.board === board;
  return (
    <>
      <section className="h-on h-phero" aria-labelledby="sp-h">
        <div className="h-wrap">
          <p className="h-eyebrow h-soft">Subscription</p>
          <h1 id="sp-h" className="dsp">Where the demand is.</h1>
          <p className="h-soft">How many times each issue has been bid for, consolidated from NSE and BSE.</p>
          {model.live.length === 0 ? (
            <p className="h-soft" style={{ marginTop: 26, fontSize: 17 }}>
              No issue is bidding right now.{model.next ? <> Next up: <Link href={model.next.href} style={{ fontWeight: 800, textDecoration: 'underline' }}>{model.next.name}</Link>, {lowerFirst(model.next.status)}.</> : null}
            </p>
          ) : null}
          <div className="h-ctrl h-ctrl-on" role="group" aria-label="Board" style={{ marginTop: 30 }}>
            {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" className="h-tab" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All boards' : b}</button>)}
          </div>
        </div>
      </section>
      {model.live.length ? <Chart title="Live" rows={model.live.filter(keep)} live /> : null}
      <div className={model.live.length ? 'h-sec-mist' : undefined}>
        <Chart title="Closed in the last five weeks" rows={model.closed.filter(keep)} />
      </div>
      <div className="h-wrap" style={{ paddingBottom: 72 }}>
        <p className="h-fine" style={{ maxWidth: 760 }}>Times = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Subscription is a measure of demand, not of returns or a recommendation.</p>
        <p style={{ marginTop: 20 }}><Link className="h-link" href="/">Back to current IPOs <Arrow /></Link></p>
      </div>
    </>
  );
}
