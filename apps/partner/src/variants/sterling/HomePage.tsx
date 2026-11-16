'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { usePartner } from '@/core/tenant';
import { lowerFirst } from '@/core/format';
import { Bar, Check, Chevron, Logo, Status } from './parts';
import { AllotmentForm } from './AllotmentPage';

type Tab = 'all' | 'open' | 'upcoming' | 'recent';
type Board = 'all' | 'Mainboard' | 'SME';
type View = 'cards' | 'list';

const PAGE = { cards: 9, list: 10 };

export default function HomePage({ model }: { model: HomeModel }) {
  const partner = usePartner();
  const [tab, setTab] = useState<Tab>('all');
  const [board, setBoard] = useState<Board>('all');
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
  const tabs: [Tab, string][] = [['all', 'All'], ['open', 'Open now'], ['upcoming', 'Upcoming'], ['recent', 'Recently closed']];
  const pick = (t: Tab) => { setTab(t); setShowAll(false); };
  const nextUp = model.actionable.find((c) => c.tone === 'upcoming');

  return (
    <>
      <section className="s-hero">
        <div className="s-hero-in">
          <div style={{ minWidth: 0 }}>
            <p className="s-eyebrow">{partner ? `IPOs at ${partner.name}` : 'IPOs'}</p>
            <h1 className="s-h1">Every IPO, applied in minutes.</h1>
            <p className="s-lede">Bid through UPI from your own demat, follow demand as it builds and check allotment the day it is out.</p>
            <div className="s-hero-ctas">
              <a className="s-btn s-btn-p" href="#ipos">View IPOs</a>
              <Link className="s-btn s-btn-s" href="/allotment/">Check allotment</Link>
            </div>
            <ul className="s-points">
              <li><Check />Money blocked, not debited</li>
              <li><Check />Apply for your family</li>
              <li><Check />Mainboard and SME</li>
            </ul>
          </div>
          <aside className="s-week" aria-label="Open now and opening this week">
            <div className="s-week-h">{model.counts.open ? 'Open now and this week' : 'Opening this week'}<span className="num">Next 7 days</span></div>
            {model.thisWeek.length ? model.thisWeek.map((c) => (
              <Link key={c.sym} href={c.href} className="s-week-row">
                <Logo ipo={c} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="s-card-name" style={{ fontSize: 15 }}>{c.name}</span>
                  <Status tone={c.tone} className="">{c.status}</Status>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <b className="num" style={{ display: 'block', fontSize: 15 }}>{c.band}</b>
                  <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>Min {c.min}</span>
                </span>
              </Link>
            )) : (
              <p className="s-week-empty">No IPO opens in the next seven days.{nextUp ? ` Next: ${nextUp.name}, ${lowerFirst(nextUp.status)}.` : ''}</p>
            )}
            <div className="s-week-f">
              <span>Bidding 10:00 AM – 5:00 PM on exchange days</span>
              <Link href="/subscription/" className="s-link" style={{ fontSize: 14 }}>Live subscription</Link>
            </div>
          </aside>
        </div>
      </section>

      <section id="ipos" className="s-sec">
        <div className="s-wrap">
          <div className="s-sec-h">
            <div>
              <h2 className="s-h2">IPOs</h2>
              <p className="s-sub">Mainboard and SME issues, from announcement to listing.</p>
            </div>
            <div className="s-tools">
              <label>
                <span className="sr">Board</span>
                <select className="s-field" value={board} onChange={(e) => { setBoard(e.target.value as Board); setShowAll(false); }} style={{ minWidth: 160 }}>
                  <option value="all">All boards</option>
                  <option value="Mainboard">Mainboard</option>
                  <option value="SME">SME</option>
                </select>
              </label>
              <div className="s-vt" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === 'cards'} onClick={() => { setView('cards'); setShowAll(false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>Cards
                </button>
                <button type="button" aria-pressed={view === 'list'} onClick={() => { setView('list'); setShowAll(false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>List
                </button>
              </div>
            </div>
          </div>
          <div className="s-tabs" role="tablist" aria-label="IPO status">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" className="s-tab" aria-selected={tab === k} onClick={() => pick(k)}>
                {label}<span className="s-cnt">{sets[k].filter(byBoard).length}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="s-empty">
              <p>{tab === 'open' ? 'No IPO is open for bidding today' : 'Nothing here right now'}</p>
              <p>{nextUp ? `${nextUp.name} — ${lowerFirst(nextUp.status)}.` : 'Check back soon, or browse all IPOs.'}</p>
            </div>
          ) : view === 'cards' ? (
            <div className="s-cards">
              {rows.map((c) => <Card key={c.sym} c={c} />)}
            </div>
          ) : (
            <ListView rows={rows} />
          )}

          <div className="s-list-f">
            {!showAll && list.length > limit ? (
              <button type="button" className="s-btn s-btn-s" onClick={() => setShowAll(true)}>Show all {list.length} IPOs</button>
            ) : <span />}
            <Link href="/ipos/" className="s-link">Browse all IPOs</Link>
          </div>
        </div>
      </section>

      <section className="s-band" style={{ marginTop: 40 }}>
        <div className="s-wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <h2 className="s-h2" style={{ fontSize: 30, maxWidth: 560 }}>Applying takes three steps</h2>
          <p className="s-sub" style={{ maxWidth: 560, marginTop: 8 }}>Bids go to the exchange from your own demat and bank account, through UPI.</p>
          <ol className="s-steps">
            <li><div className="s-step-n">Step 1</div><h3>Choose the IPO and amount</h3><p>Pick your category and number of lots. The exact amount is shown before you bid.</p></li>
            <li><div className="s-step-n">Step 2</div><h3>Approve the UPI mandate</h3><p>Your UPI app asks you to approve a block on the amount. Nothing is debited yet.</p></li>
            <li><div className="s-step-n">Step 3</div><h3>Shares, or the block released</h3><p>If you are allotted, shares reach your demat before listing. If not, the block is released.</p></li>
          </ol>
        </div>
      </section>

      <section>
        <div className="s-wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <div className="s-allot">
            <div style={{ flex: '1 1 320px' }}>
              <h2 className="s-h3">Check your allotment</h2>
              <p className="s-sub" style={{ marginTop: 8, lineHeight: 1.6, maxWidth: 440 }}>Enter the PAN on the application. It works for any applicant, wherever they applied.</p>
            </div>
            <AllotmentForm choices={model.allotmentChoices} compact />
          </div>
        </div>
      </section>
    </>
  );
}

function Card({ c }: { c: IpoCard }) {
  const upcoming = c.tone === 'upcoming';
  return (
    <Link href={c.href} className="s-card">
      <div className="s-card-h">
        <Logo ipo={c} size="lg" />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="s-card-name">{c.name}</span>
          <span className="s-meta">{c.board} · {c.exchanges}</span>
        </span>
      </div>
      <dl className="s-card-dl">
        <div><dt>Price band</dt><dd>{c.band}</dd></div>
        <div><dt>Min. investment</dt><dd>{c.min}</dd></div>
        <div><dt>Issue size</dt><dd>{c.size}</dd></div>
        <div><dt>{upcoming || !c.subs ? 'Bidding' : 'Subscribed'}</dt><dd>{upcoming || !c.subs ? c.dates : c.subs}</dd></div>
      </dl>
      <Bar width={c.bar} empty={!c.subs} />
      <div className="s-card-f">
        <Status tone={c.tone}>{c.status}</Status>
        <span className="s-more">Details<Chevron /></span>
      </div>
    </Link>
  );
}

function ListView({ rows }: { rows: IpoCard[] }) {
  return (
    <>
      <div className="s-table-wrap">
        <table className="s-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Company</th>
              <th>Status</th>
              <th>Bidding</th>
              <th className="r">Price band</th>
              <th className="r">Min. investment</th>
              <th className="r">Issue size</th>
              <th style={{ width: '17%', paddingLeft: 32 }}>Subscribed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.sym}>
                <td>
                  <Link href={c.href} className="s-co">
                    <Logo ipo={c} />
                    <span><span className="s-co-name">{c.name}</span><span className="s-meta">{c.board} · {c.exchanges}</span></span>
                  </Link>
                </td>
                <td><Status tone={c.tone}>{c.status}</Status></td>
                <td className="num" style={{ color: 'var(--ink2)', fontSize: 14 }}>{c.dates}</td>
                <td className="r num">{c.band}</td>
                <td className="r num">{c.min}</td>
                <td className="r num" style={{ color: 'var(--ink2)' }}>{c.size}</td>
                <td style={{ paddingLeft: 32 }}>
                  {c.subs ? <span className="s-subs"><Bar width={c.bar} /><b>{c.subs}</b></span> : <span style={{ color: 'var(--muted)', fontSize: 14 }}>Not yet open</span>}
                </td>
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
                <Status tone={c.tone} className="">{c.status}</Status>
              </span>
              <span className="s-rows-r"><b>{c.subs || c.band}</b><span>{c.subs ? 'Subscribed' : 'Price band'}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
