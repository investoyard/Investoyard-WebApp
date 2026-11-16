'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { useAllotmentCheck } from '@/core/allotment';
import AllotForm from './AllotForm';
import { usePartner } from '@/core/tenant';
import { Arrow, Chip, RLogo, targetOf } from './parts';
import Countdown from './Countdown';

type Tab = 'all' | 'open' | 'upcoming' | 'closed';
type View = 'cards' | 'list';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' },
];

/*
 * The featured issue: the first open one, else the next to open, else the
 * most actionable of the rest. That is the house ordering (compareForList)
 * read once, not a second opinion about what matters today.
 */
const featuredOf = (m: HomeModel): IpoCard | null =>
  m.actionable.find((c) => c.tone === 'open') || m.actionable.find((c) => c.tone === 'upcoming') || m.actionable[0] || m.recent[0] || null;

const topDemand = (m: HomeModel) =>
  [...m.actionable, ...m.recent].filter((c) => c.subsN != null).sort((a, b) => b.subsN! - a.subsN!);

function Hero({ m, f }: { m: HomeModel; f: IpoCard | null }) {
  const p = usePartner();
  const target = f ? targetOf(f) : null;
  const top = topDemand(m)[0] || null;
  return (
    <section className="h-on h-hero" aria-labelledby="h-hero-h">
      <div className="h-wrap">
        <div className="h-hero-grid">
          <div className="h-hero-copy">
            <p className="h-eyebrow h-soft">{p ? `${p.name} · IPO desk` : ' '}</p>
            <h1 id="h-hero-h" className="dsp">Every public issue, ahead of the bell.</h1>
            <p className="h-hero-lede h-soft">Dates, price bands, live subscription and allotment status for every mainboard and SME IPO, as the exchanges publish them.</p>
            <div className="h-hero-ctas">
              <a className="h-btn h-btn-on" href="#issues">See current IPOs <Arrow /></a>
              <Link className="h-btn h-btn-line-on" href="/allotment/">Check allotment</Link>
            </div>
          </div>
          {f ? (
            <div className="h-feature">
              <div className="h-feature-top">
                <span className="h-eyebrow" style={{ color: 'var(--brand-ink)' }}>{f.tone === 'open' ? 'Open now' : f.tone === 'upcoming' ? 'Next up' : 'In focus'}</span>
                <Chip tone={f.tone}>{f.status}</Chip>
              </div>
              <h2 className="h-feature-name dsp">{f.name}</h2>
              <p className="h-feature-meta">{f.board} · {f.exchanges} · {f.dates}</p>
              {target ? (
                <>
                  <p className="h-feature-lbl">{target.label}</p>
                  <Countdown at={target.at} />
                </>
              ) : f.subs ? (
                <p className="h-feature-sub"><strong className="dsp num">{f.subs}</strong> <span>subscribed, final</span></p>
              ) : null}
              <dl className="h-feature-figs">
                <div><dt>Price band</dt><dd className="num">{f.band}</dd></div>
                <div><dt>Min. investment</dt><dd className="num">{f.min}</dd></div>
                <div><dt>Issue size</dt><dd className="num">{f.size}</dd></div>
              </dl>
              <Link className="h-btn h-btn-p" href={f.href}>View details <Arrow /></Link>
            </div>
          ) : <div />}
        </div>
        <ul className="h-hero-stats">
          <li><strong className="dsp num">{m.counts.open}</strong><span className="h-soft">open for bidding</span></li>
          <li><strong className="dsp num">{m.counts.upcoming}</strong><span className="h-soft">opening soon</span></li>
          <li><strong className="dsp num">{m.counts.recent}</strong><span className="h-soft">listed in the last 45 days</span></li>
          <li><strong className="dsp num">{top ? top.subs : '—'}</strong><span className="h-soft">{top ? `highest demand · ${top.name}` : 'highest demand'}</span></li>
        </ul>
      </div>
    </section>
  );
}

function BigCard({ c }: { c: IpoCard }) {
  return (
    <Link className="h-big" href={c.href}>
      <RLogo ipo={c} />
      <div style={{ minWidth: 0 }}>
        <div className="h-big-top">
          <Chip tone={c.tone}>{c.status}</Chip>
          <span className="h-dim">{c.board}</span>
        </div>
        <h3 className="h-big-name dsp">{c.name}</h3>
        <dl className="h-big-row">
          <div><dt>Dates</dt><dd className="num">{c.dates}</dd></div>
          <div><dt>Price band</dt><dd className="num">{c.band}</dd></div>
          <div><dt>Min. investment</dt><dd className="num">{c.min}</dd></div>
        </dl>
        <div className="h-big-fig">
          {c.subs
            ? <><strong className="dsp num">{c.subs}</strong><span className="h-dim">{c.tone === 'open' ? 'subscribed so far' : 'subscribed, final'}</span></>
            : <><strong className="dsp num">{c.size}</strong><span className="h-dim">issue size</span></>}
        </div>
      </div>
    </Link>
  );
}

function LineRow({ c }: { c: IpoCard }) {
  return (
    <Link className="h-line" href={c.href}>
      <div style={{ minWidth: 0 }}>
        <div className="h-line-name dsp">{c.name}</div>
        <div className="h-dim" style={{ marginTop: 4 }}>{c.board} · {c.status}</div>
      </div>
      <div className="h-line-v num">{c.dates}<small>Bidding</small></div>
      <div className="h-line-v num">{c.band}<small>Price band</small></div>
      <div className="h-line-v num">{c.min}<small>Min. investment</small></div>
      <div className="h-line-v h-line-key num">{c.subs || c.size}<small>{c.subs ? 'Subscribed' : 'Issue size'}</small></div>
    </Link>
  );
}

function Issues({ m }: { m: HomeModel }) {
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('cards');
  const counts: Record<Tab, number> = {
    all: m.actionable.length,
    open: m.actionable.filter((c) => c.tone === 'open').length,
    upcoming: m.actionable.filter((c) => c.tone === 'upcoming').length,
    closed: m.actionable.filter((c) => c.tone === 'closed').length,
  };
  const rows = useMemo(() => (tab === 'all' ? m.actionable : m.actionable.filter((c) => c.tone === tab)), [m.actionable, tab]);
  return (
    <section className="h-sec" id="issues" aria-labelledby="iss-h">
      <div className="h-wrap">
        <div className="h-sec-h">
          <div>
            <p className="h-kicker">Current issues</p>
            <h2 id="iss-h" className="dsp">On the board</h2>
            <p>Open, upcoming, and issues waiting on allotment or listing, in the order they need your attention.</p>
          </div>
          <div className="h-ctrl" role="group" aria-label="Layout">
            <button type="button" className="h-tab" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards</button>
            <button type="button" className="h-tab" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
        </div>
        <div className="h-ctrl" role="tablist" aria-label="Filter issues">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" className="h-tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}<b className="num">{counts[t.key]}</b>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="h-empty"><strong className="dsp">Nothing here today</strong><p>No issue is in this state right now. The archive holds every past IPO.</p></div>
        ) : view === 'cards' ? (
          <div className="h-grid2">{rows.map((c) => <BigCard key={c.sym} c={c} />)}</div>
        ) : (
          <div className="h-lines">{rows.map((c) => <LineRow key={c.sym} c={c} />)}</div>
        )}
        <div className="h-more">
          <span className="h-dim">Figures as the exchanges publish them. A dash means the issue has not published that figure.</span>
          <Link className="h-link" href="/ipos/">Browse every past IPO <Arrow /></Link>
        </div>
      </div>
    </section>
  );
}

/* A ranking, stated as what it is: the highest subscription multiples among current and recently listed issues. */
function Demand({ m }: { m: HomeModel }) {
  const list = topDemand(m).slice(0, 5);
  if (!list.length) return null;
  return (
    <section className="h-sec h-sec-mist" aria-labelledby="dem-h">
      <div className="h-wrap">
        <div className="h-sec-h">
          <div>
            <p className="h-kicker">Subscription</p>
            <h2 id="dem-h" className="dsp">Highest demand</h2>
            <p>Overall subscription across current and recently listed issues. Bars use a log scale, so a 2× issue still shows.</p>
          </div>
          <Link className="h-link" href="/subscription/">Full subscription table <Arrow /></Link>
        </div>
        <ol className="h-rank">
          {list.map((c, i) => (
            <li key={c.sym}>
              <span className="h-rank-n dsp num">{String(i + 1).padStart(2, '0')}</span>
              <Link href={c.href} style={{ minWidth: 0 }}>
                <div className="h-rank-name">{c.name}</div>
                <div className="h-dim">{c.board} · {c.status}</div>
              </Link>
              <div className="h-rank-bar" aria-hidden="true"><span style={{ width: `${c.bar}%` }} /></div>
              <span className="h-rank-v dsp num">{c.subs}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Listed({ m }: { m: HomeModel }) {
  if (!m.recent.length) return null;
  return (
    <section className="h-sec" aria-labelledby="lst-h">
      <div className="h-wrap">
        <div className="h-sec-h">
          <div>
            <p className="h-kicker">Recently listed</p>
            <h2 id="lst-h" className="dsp">Just hit the market</h2>
            <p>Issues listed in the last 45 days, newest first. Scroll sideways for more.</p>
          </div>
        </div>
        <div className="h-rail" tabIndex={0} role="region" aria-label="Recently listed issues">
          {m.recent.map((c) => (
            <Link key={c.sym} className="h-rcard" href={c.href}>
              <div className="h-rcard-top">
                <RLogo ipo={c} />
                <span className="h-chip closed"><i aria-hidden="true" />{c.status}</span>
              </div>
              <div>
                <div className="h-rcard-name dsp">{c.name}</div>
                <div className="h-dim" style={{ marginTop: 6 }}>{c.board} · {c.band}</div>
              </div>
              <div>
                <div className="h-rcard-big dsp num">{c.subs || c.size}</div>
                <div className="h-dim" style={{ marginTop: 6 }}>{c.subs ? 'subscribed, final' : 'issue size'}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS: [string, string][] = [
  ['Pick an issue', 'Read the price band, the dates and the offer document. Everything here comes from the exchanges and the RHP.'],
  ['Bid with UPI', 'Apply through your demat account. The bid amount is blocked in your bank by UPI mandate, not debited.'],
  ['Get the result', 'Check allotment here on allotment day. Allotted shares reach your demat before listing; the rest is released.'],
];

function Steps() {
  return (
    <section className="h-sec h-sec-mist" aria-labelledby="how-h">
      <div className="h-wrap">
        <div className="h-sec-h"><div><p className="h-kicker">How an IPO works</p><h2 id="how-h" className="dsp">Three steps, one week</h2></div></div>
        <ol className="h-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t}><div className="h-steps-n dsp num">{i + 1}</div><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function AllotBand({ choices }: { choices: HomeModel['allotmentChoices'] }) {
  const a = useAllotmentCheck(choices);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); a.submit(); };
  if (!choices.length) return null;
  return (
    <section className="h-on h-allot-band" aria-labelledby="al-h">
      <div className="h-wrap h-allot-grid">
        <div>
          <p className="h-eyebrow h-soft">Allotment</p>
          <h2 id="al-h" className="dsp" style={{ marginTop: 14 }}>Did you get the shares?</h2>
          <p className="h-soft h-allot-lede">Checks the registrar’s file for any applicant, wherever they applied, once the basis of allotment is out.</p>
        </div>
        <AllotForm a={a} choices={choices} onSubmit={onSubmit} />
      </div>
    </section>
  );
}

export default function HomePage({ model }: { model: HomeModel }) {
  const f = featuredOf(model);
  return (
    <>
      <Hero m={model} f={f} />
      <Issues m={model} />
      <Demand m={model} />
      <Listed m={model} />
      <Steps />
      <AllotBand choices={model.allotmentChoices} />
    </>
  );
}
