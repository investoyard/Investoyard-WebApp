'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { lowerFirst, wdDayMon } from '@/core/format';
import { Bar, Logo, Status } from './parts';

type Board = 'all' | 'Mainboard' | 'SME';

export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const [board, setBoard] = useState<Board>('all');
  const keep = (c: { board: string }) => board === 'all' || c.board === board;
  const live = model.live.filter(keep);
  const closed = model.closed.filter(keep);

  return (
    <div className="s-wrap s-page">
      <h1 className="s-ph1">Subscription</h1>
      <p className="s-plede">Demand for every issue by investor category, consolidated from NSE and BSE.</p>

      {model.live.length === 0 ? (
        <section className="s-callout" aria-label="Bidding now">
          <div>
            <p style={{ fontSize: 17, fontWeight: 600 }}>No IPO is bidding right now</p>
            <p className="s-note" style={{ marginTop: 4, fontSize: 15 }}>
              Live figures appear here once bidding opens.{model.next ? <> Next: <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>{model.next.name}, {lowerFirst(model.next.status)}</span>.</> : null}
            </p>
          </div>
          <Link className="s-btn s-btn-p" href="/">See upcoming IPOs</Link>
        </section>
      ) : null}

      <div className="s-sec-h" style={{ marginTop: 48 }}>
        <div>
          <h2 className="s-h2" style={{ fontSize: 26 }}>{live.length ? 'Bidding now' : 'Final subscription'}</h2>
          <p className="s-sub">{live.length ? 'Live figures, refreshed through the bidding day.' : 'Issues that closed in the last five weeks.'}</p>
        </div>
        <div className="s-seg" role="group" aria-label="Board">
          {(['all', 'Mainboard', 'SME'] as Board[]).map((b) => (
            <button key={b} type="button" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All' : b}</button>
          ))}
        </div>
      </div>

      {live.length ? <SubTable rows={live} first="Status" /> : null}
      {live.length && closed.length ? <h2 className="s-h2" style={{ fontSize: 22, marginTop: 48 }}>Final subscription</h2> : null}
      <SubTable rows={closed} first="Closed" />

      <p className="s-fine" style={{ maxWidth: 760, marginTop: 18 }}>Times subscribed = shares bid for ÷ shares offered in that category. QIB excludes the anchor portion where the issue had one. Final figures are as published by NSE and BSE after bidding closed.</p>
    </div>
  );
}

function SubTable({ rows, first }: { rows: SubscriptionModel['closed']; first: 'Closed' | 'Status' }) {
  if (!rows.length) return <div className="s-empty"><p>Nothing to show</p><p>Try another board.</p></div>;
  return (
    <>
      <div className="s-table-wrap" style={{ marginTop: 20 }}>
        <table className="s-table" style={{ minWidth: 940 }}>
          <thead>
            <tr>
              <th style={{ width: '32%' }}>Company</th>
              <th>{first}</th>
              <th className="r">QIB</th>
              <th className="r">NII</th>
              <th className="r">Retail</th>
              <th style={{ width: '24%', paddingLeft: 32 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.sym}>
                <td><Link href={c.href} className="s-co"><Logo ipo={c} /><span><span className="s-co-name">{c.name}</span><span className="s-meta">{c.board}</span></span></Link></td>
                <td>{first === 'Status' ? <Status tone={c.tone}>{c.status}</Status> : <span className="num" style={{ color: 'var(--ink2)', fontSize: 14 }}>{c.close ? wdDayMon(c.close) : '—'}</span>}</td>
                <td className="r num" style={{ color: 'var(--ink2)' }}>{c.qib}</td>
                <td className="r num" style={{ color: 'var(--ink2)' }}>{c.nii}</td>
                <td className="r num" style={{ color: 'var(--ink2)' }}>{c.retail}</td>
                <td style={{ paddingLeft: 32 }}><span className="s-subs"><Bar width={c.bar} /><b style={{ fontWeight: 700 }}>{c.subs}</b></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="s-rows">
        {rows.map((c) => (
          <li key={c.sym}>
            <Link href={c.href}>
              <Logo ipo={c} />
              <span style={{ minWidth: 0 }}>
                <span className="s-card-name" style={{ fontSize: 15 }}>{c.name}</span>
                <span className="s-meta num">QIB {c.qib} · NII {c.nii} · Retail {c.retail}</span>
              </span>
              <span className="s-rows-r"><b>{c.subs}</b><span>Total</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
