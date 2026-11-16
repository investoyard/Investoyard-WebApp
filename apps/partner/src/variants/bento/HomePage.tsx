'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { usePartner } from '@/core/tenant';
import { outcomeText, useAllotmentCheck, type AllotmentChoice } from '@/core/allotment';
import { dayMon, lowerFirst } from '@/core/format';
import { Arrow, Chip, Logo, Meter } from './parts';

type Tab = 'all' | 'open' | 'upcoming' | 'recent';
type View = 'cards' | 'list';
const PAGE = { cards: 9, list: 10 };

export default function HomePage({ model }: { model: HomeModel }) {
  const partner = usePartner();
  const [tab, setTab] = useState<Tab>('all');
  const [board, setBoard] = useState('all');
  const [view, setView] = useState<View>('cards');
  const [showAll, setShowAll] = useState(false);

  const sets = useMemo(() => ({
    all: [...model.actionable, ...model.recent],
    open: model.actionable.filter((c) => c.tone === 'open'),
    upcoming: model.actionable.filter((c) => c.tone === 'upcoming'),
    recent: [...model.actionable.filter((c) => c.tone === 'closed'), ...model.recent],
  }), [model]);
  const byBoard = (c: IpoCard) => board === 'all' || c.board === board;
  const list = sets[tab].filter(byBoard);
  const limit = showAll ? list.length : PAGE[view];
  const rows = list.slice(0, limit);
  const nextUp = model.actionable.find((c) => c.tone === 'upcoming');
  const TABS: [Tab, string][] = [['all', 'All'], ['open', 'Open now'], ['upcoming', 'Upcoming'], ['recent', 'Recently closed']];

  return (
    <>
      <section className="b-bento" aria-label="Overview">
        <div className="b-hero">
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="b-hero-eyebrow">{partner ? `IPOs at ${partner.name}` : 'IPOs'}</p>
            <h1 className="disp">Every IPO, applied in minutes.</h1>
            <p>Bid through UPI from your own demat, apply for the whole family and know your allotment the day it is out.</p>
          </div>
          <div className="b-hero-ctas">
            <a href="#ipos" className="b-btn b-btn-inv">View IPOs</a>
            <Link href="/allotment/" className="b-btn b-btn-ghost-inv">Check allotment</Link>
          </div>
        </div>

        <div className="b-stats-row">
          <div className="b-tile b-stat">
            <div className="b-stat-n disp">{model.counts.open}</div>
            <div>
              <div className="b-stat-l">Open now</div>
              <div className="b-stat-s">{model.counts.open ? 'Bidding until 5:00 PM' : 'Nothing bidding today'}</div>
            </div>
          </div>
          <div className="b-tile b-stat">
            <div className="b-stat-n disp">{model.counts.upcoming}</div>
            <div>
              <div className="b-stat-l">Upcoming</div>
              <div className="b-stat-s">{nextUp ? nextUp.status : 'None announced'}</div>
            </div>
          </div>
        </div>

        <div className="b-tile b-week">
          <div className="b-tile-h"><h2 className="b-h3 disp">{model.counts.open ? 'Open now and this week' : 'Opening this week'}</h2><Link href="/subscription/" className="b-link" style={{ fontSize: 14 }}>Live subscription</Link></div>
          {model.thisWeek.length ? (
            <div className="b-week-list">
              {model.thisWeek.map((c) => (
                <Link key={c.sym} href={c.href} className="b-week-row">
                  <Logo ipo={c} size="sm" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</strong>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{c.status}</span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong className="num" style={{ display: 'block', fontSize: 15 }}>{c.band}</strong>
                    <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>Min {c.min}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : <p style={{ marginTop: 14, color: 'var(--muted)' }}>No IPO opens in the next seven days.</p>}
        </div>

        <div className="b-tile b-allot">
          <h2 className="b-h3 disp">Check your allotment</h2>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--muted)' }}>Works for any applicant, wherever they applied.</p>
          <QuickAllot choices={model.allotmentChoices} />
        </div>

        <div className="b-tile b-how">
          <h2 className="b-h3 disp">Applying takes three steps</h2>
          <ol>
            <li><span className="b-how-n disp">1</span><div><strong>Choose the IPO and amount</strong><span>The exact amount is shown before you bid.</span></div></li>
            <li><span className="b-how-n disp">2</span><div><strong>Approve the UPI mandate</strong><span>The amount is blocked in your bank, not debited.</span></div></li>
            <li><span className="b-how-n disp">3</span><div><strong>Shares, or the block released</strong><span>Shares reach your demat before listing day.</span></div></li>
          </ol>
        </div>
      </section>

      <section id="ipos" className="b-sec">
        <div className="b-sec-h">
          <div>
            <h2 className="b-h2 disp">IPOs</h2>
            <p style={{ marginTop: 6, color: 'var(--muted)' }}>Mainboard and SME, from announcement to listing.</p>
          </div>
          <div className="b-pills" role="group" aria-label="Layout">
            <button type="button" className="b-pill" aria-pressed={view === 'cards'} onClick={() => { setView('cards'); setShowAll(false); }}>Cards</button>
            <button type="button" className="b-pill" aria-pressed={view === 'list'} onClick={() => { setView('list'); setShowAll(false); }}>List</button>
          </div>
        </div>
        <div className="b-controls">
          <div className="b-pills" role="tablist" aria-label="IPO status">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" className="b-pill" aria-selected={tab === k} onClick={() => { setTab(k); setShowAll(false); }}>
                {label}<b>{sets[k].filter(byBoard).length}</b>
              </button>
            ))}
          </div>
          <label><span className="sr">Board</span>
            <select className="b-select" value={board} onChange={(e) => { setBoard(e.target.value); setShowAll(false); }}>
              <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <div className="b-empty">
            <strong className="disp">{tab === 'open' ? 'Nothing is bidding today' : 'Nothing here right now'}</strong>
            <p>{nextUp ? `${nextUp.name} — ${lowerFirst(nextUp.status)}.` : 'Check back soon, or browse all IPOs.'}</p>
          </div>
        ) : view === 'cards' ? (
          <div className="b-cards">{rows.map((c) => <Card key={c.sym} c={c} />)}</div>
        ) : (
          <div>
            <div className="b-row-head" style={{ marginTop: 20 }} aria-hidden="true"><span>Company</span><span style={{ textAlign: 'left' }}>Status</span><span>Price band</span><span>Min. investment</span><span>Issue size</span><span>Subscribed</span></div>
            <div className="b-rows" style={{ marginTop: 8 }}>
              {rows.map((c) => (
                <Link key={c.sym} href={c.href} className="b-row">
                  <span className="b-row-co"><Logo ipo={c} size="sm" /><span style={{ minWidth: 0 }}><strong>{c.name}</strong><span style={{ fontSize: 13, color: 'var(--muted)' }}>{c.board} · {c.status}</span></span></span>
                  <span><Chip tone={c.tone}>{c.status}</Chip></span>
                  <span className="b-row-v">{c.band}</span>
                  <span className="b-row-v">{c.min}</span>
                  <span className="b-row-v">{c.size}</span>
                  <span className="b-row-v b-row-key">{c.subs ? c.subs : c.band}<small>{c.subs ? 'subscribed' : 'price band'}</small></span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="b-foot-row">
          {!showAll && list.length > limit ? <button type="button" className="b-btn b-btn-s" onClick={() => setShowAll(true)}>Show all {list.length} IPOs</button> : <span />}
          <Link href="/ipos/" className="b-link">Browse every IPO</Link>
        </div>
      </section>
    </>
  );
}

function Card({ c }: { c: IpoCard }) {
  const live = !!c.subs && c.tone !== 'upcoming';
  return (
    <Link href={c.href} className="b-card">
      <div className="b-card-top">
        <Logo ipo={c} />
        <Chip tone={c.tone}>{c.status}</Chip>
      </div>
      <div>
        <div className="b-card-name disp">{c.name}</div>
        <div className="b-card-meta">{c.board} · {c.exchanges}</div>
      </div>
      <div className="b-card-fig">
        <div>
          <strong className="disp">{live ? c.subs : c.band}</strong>
          <small>{live ? 'subscribed' : 'price band'}</small>
        </div>
        <span style={{ color: 'var(--brand-ink)' }}><Arrow /></span>
      </div>
      {live ? <Meter width={c.bar} /> : null}
      <dl className="b-minis">
        <div className="b-mini"><dt>Min. invest</dt><dd>{c.min}</dd></div>
        <div className="b-mini"><dt>Issue size</dt><dd>{c.size}</dd></div>
        <div className="b-mini"><dt>{live ? 'Price band' : 'Closes'}</dt><dd>{live ? c.band : dayMon(c.close) || '—'}</dd></div>
      </dl>
    </Link>
  );
}

function QuickAllot({ choices }: { choices: AllotmentChoice[] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  return (
    <>
      <form className="b-form" onSubmit={onSubmit}>
        <label className="b-lbl">IPO
          <select className="b-field" value={a.ipoId} onChange={(e) => a.setIpoId(e.target.value)}>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="b-lbl">PAN
          <input className="b-field num" value={a.pan} onChange={(e) => a.setPan(e.target.value)} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" spellCheck={false} style={{ letterSpacing: '.06em' }} />
        </label>
        <button type="submit" className="b-btn b-btn-p" disabled={a.busy}>{a.busy ? 'Checking…' : 'Check'}</button>
      </form>
      {a.error ? <p role="alert" className="b-err">{a.error}</p> : null}
      {a.result ? outcomeText(a.result).map((o, i) => (
        <div key={i} className="b-out" role="status"><strong><Chip tone={o.tone}>{o.title}</Chip></strong><p>{o.body}</p></div>
      )) : null}
    </>
  );
}
