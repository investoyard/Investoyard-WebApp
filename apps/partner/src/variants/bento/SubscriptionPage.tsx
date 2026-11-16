'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionModel } from '@/core/models';
import { logWidth, lowerFirst } from '@/core/format';
import { Chip, Logo, Meter } from './parts';

type Row = SubscriptionModel['closed'][number];

/* Bento shows each issue as its own tile with three category meters, not a table. */
export default function SubscriptionPage({ model }: { model: SubscriptionModel }) {
  const [board, setBoard] = useState('all');
  const keep = (c: { board: string }) => board === 'all' || c.board === board;
  const live = model.live.filter(keep);
  const closed = model.closed.filter(keep);

  return (
    <div className="b-page">
      <section className="b-ph">
        <h1 className="disp">Subscription</h1>
        <p>Demand for every issue by investor category, consolidated from NSE and BSE.</p>
      </section>

      {model.live.length === 0 ? (
        <div className="b-callout">
          <div>
            <strong className="disp" style={{ fontSize: 19 }}>Nothing is bidding right now</strong>
            <p style={{ marginTop: 4, color: 'var(--ink2)' }}>Live figures appear here once bidding opens.{model.next ? ` Next: ${model.next.name}, ${lowerFirst(model.next.status)}.` : ''}</p>
          </div>
          <Link href="/" className="b-btn b-btn-p">See upcoming</Link>
        </div>
      ) : null}

      <div className="b-controls" style={{ marginTop: 28 }}>
        <h2 className="b-h2 disp">{live.length ? 'Bidding now' : 'Final subscription'}</h2>
        <div className="b-pills" role="group" aria-label="Board">
          {['all', 'Mainboard', 'SME'].map((b) => <button key={b} type="button" className="b-pill" aria-pressed={board === b} onClick={() => setBoard(b)}>{b === 'all' ? 'All' : b}</button>)}
        </div>
      </div>

      {live.length ? <div className="b-subcards">{live.map((c) => <SubCard key={c.sym} c={c} />)}</div> : null}
      {live.length && closed.length ? <h2 className="b-h2 disp" style={{ marginTop: 36, fontSize: 24 }}>Final subscription</h2> : null}
      {closed.length ? <div className="b-subcards">{closed.map((c) => <SubCard key={c.sym} c={c} />)}</div> : (
        <div className="b-empty"><strong className="disp">Nothing to show</strong><p>Try another board.</p></div>
      )}
      <p className="b-fine" style={{ padding: '0 8px' }}>Times subscribed = shares bid for ÷ shares offered. QIB excludes the anchor portion where the issue had one. Final figures are as published after bidding closed.</p>
    </div>
  );
}

function num(s: string) { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; }

function SubCard({ c }: { c: Row }) {
  const cats: [string, string][] = [['QIB', c.qib], ['NII', c.nii], ['Retail', c.retail]];
  const max = Math.max(1, ...cats.map(([, v]) => num(v)));
  return (
    <Link href={c.href} className="b-subcard">
      <div className="b-card-top"><Logo ipo={c} size="sm" /><Chip tone={c.tone}>{c.status}</Chip></div>
      <div>
        <div className="b-card-name disp" style={{ fontSize: 17 }}>{c.name}</div>
        <div className="b-card-meta">{c.board}</div>
      </div>
      <div className="b-card-fig"><div><strong className="disp">{c.subs}</strong><small>subscribed overall</small></div></div>
      <div className="b-subcard-cats">
        {cats.map(([k, v]) => (
          <div key={k}><span>{k}</span><Meter width={logWidth(num(v), max)} /><b>{v}</b></div>
        ))}
      </div>
    </Link>
  );
}
