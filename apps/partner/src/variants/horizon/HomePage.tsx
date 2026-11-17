'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMonYear } from '@/core/format';
import Countdown from './Countdown';
import { Arrow, HeroArt, Icon, Logo, Status, targetOf, type IconName } from './parts';

/*
 * The featured issue: the first open one, else the next to open, else the
 * most actionable of the rest. That is the house ordering (compareForList)
 * read once, not a second opinion about what matters today.
 */
const featuredOf = (m: HomeModel): IpoCard | null =>
  m.actionable.find((c) => c.tone === 'open') || m.actionable.find((c) => c.tone === 'upcoming') || m.actionable[0] || m.recent[0] || null;

const topDemand = (m: HomeModel) =>
  [...m.actionable, ...m.recent].filter((c) => c.subsN != null).sort((a, b) => b.subsN! - a.subsN!);

function Featured({ f }: { f: IpoCard }) {
  const target = targetOf(f);
  const chips: [IconName, string, string][] = [
    ['building', 'Issue size', f.size],
    ['tag', 'Price band', f.band],
    ['layers', 'Lot size', f.lot],
    ['users', 'Issue type', f.issueType],
  ];
  return (
    <section className="h-feat-band" aria-labelledby="h-hero-h">
      <div className="h-wrap">
        <div className="h-feat">
          <div className="h-feat-copy">
            <div className="h-feat-tags">
              <span className="h-tag-b">Featured IPO</span>
              <Status tone={f.tone}>{f.status}</Status>
            </div>
            <h1 id="h-hero-h" className="h-h1">{f.legal}</h1>
            <p className="h-lede">{f.blurb || `${f.board} issue on ${f.exchanges}, bidding ${f.dates}.`}</p>
            <dl className="h-chips">
              {chips.map(([ic, k, v]) => (
                <div key={k}><Icon name={ic} size={20} /><span><dt>{k}</dt><dd className="num">{v}</dd></span></div>
              ))}
            </dl>
            <div className="h-actions">
              <Link className="h-btn h-btn-p" href={f.href}>View details</Link>
              {f.tone === 'closed'
                ? <Link className="h-link" href="/allotment/">Check allotment <Arrow /></Link>
                : <Link className="h-link" href="/subscription/">Live subscription <Arrow /></Link>}
            </div>
          </div>
          <div className="h-feat-art">
            <HeroArt kind="exchange" />
            {target ? <div className="h-feat-card"><Countdown at={target.at} label={target.label} /></div>
              : f.subs ? (
                <div className="h-feat-card h-feat-subs">
                  <p className="h-cd-l"><Icon name="chart" size={18} />Subscribed, final</p>
                  <strong className="num">{f.subs}</strong>
                </div>
              ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function SecHead({ id, title, count, href, more = 'View all' }: { id: string; title: string; count?: number; href?: string; more?: string }) {
  return (
    <div className="h-sec-h">
      <h2 id={id} className="h-h2">{title}{count != null ? <span className="h-count num"> ({count})</span> : null}</h2>
      {href ? <Link className="h-link" href={href}>{more} <Arrow /></Link> : null}
    </div>
  );
}

function Current({ rows, title = 'Current issues', id = 'cur-h' }: { rows: IpoCard[]; title?: string; id?: string }) {
  return (
    <section className="h-card" aria-labelledby={id}>
      <SecHead id={id} title={title} count={rows.length} href="/calendar/" />
      <div className="h-tbl-wrap">
        <table className="h-tbl">
          <thead><tr><th>Company / issue size</th><th className="r h-hm">Price band</th><th className="r h-hm">Lot size</th><th className="h-hm">Open – close</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><Link className="h-co" href={c.href}><Logo ipo={c} size="sm" /><span><b>{c.name}</b><small className="num">{c.size}</small></span></Link></td>
                <td className="r num h-hm">{c.band}</td>
                <td className="r num h-hm">{c.lot.replace(' shares', '')}</td>
                <td className="num h-hm">{c.dates}</td>
                <td><Status tone={c.tone}>{c.status}</Status></td>
              </tr>
            )) : <tr><td colSpan={5} className="h-tbl-none">No issue is open or awaiting listing right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Upcoming({ rows }: { rows: IpoCard[] }) {
  return (
    <section className="h-card" aria-labelledby="up-h">
      <SecHead id="up-h" title="Upcoming issues" count={rows.length} href="/calendar/" />
      <div className="h-tbl-wrap">
        <table className="h-tbl">
          <thead><tr><th>Company</th><th className="r">Issue size</th><th className="r">Open date</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><Link className="h-co" href={c.href}><Logo ipo={c} size="sm" /><span><b>{c.name}</b><small>{c.board}</small></span></Link></td>
                <td className="r num">{c.size}</td>
                <td className="r num">{c.open ? dayMonYear(c.open) : '—'}</td>
              </tr>
            )) : <tr><td colSpan={3} className="h-tbl-none">No issue has announced its dates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* A ranking, stated as what it is: the highest subscription multiples among current and recently listed issues. */
function Demand({ m }: { m: HomeModel }) {
  const list = topDemand(m).slice(0, 5);
  return (
    <section className="h-card" aria-labelledby="dem-h">
      <SecHead id="dem-h" title="Highest-demand IPOs" href="/subscription/" more="Subscription" />
      <p className="h-note">Overall subscription among current and recently listed issues. Bars use a log scale.</p>
      {list.length ? (
        <ol className="h-rank">
          {list.map((c, i) => (
            <li key={c.sym}>
              <span className="h-rank-n num">{i + 1}</span>
              <Link href={c.href} className="h-rank-name">{c.name}</Link>
              <span className="h-rank-bar" aria-hidden="true"><span style={{ width: `${Math.max(c.bar, 4)}%` }} /></span>
              <b className="num">{c.subs}</b>
            </li>
          ))}
        </ol>
      ) : <p className="h-tbl-none">No subscription figures yet.</p>}
    </section>
  );
}

function Listed({ rows }: { rows: IpoCard[] }) {
  return (
    <section className="h-card" aria-labelledby="lst-h">
      <SecHead id="lst-h" title="Recently listed IPOs" href="/ipos/" />
      <div className="h-tbl-wrap">
        <table className="h-tbl">
          <thead><tr><th>Company</th><th className="r h-hm">Issue price</th><th className="r h-hm">Listed on</th><th className="r">Subscribed</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><Link className="h-co" href={c.href}><Logo ipo={c} size="sm" /><span><b>{c.name}</b><small>{c.board}</small></span></Link></td>
                <td className="r num h-hm">{c.band}</td>
                <td className="r num h-hm">{c.listing ? dayMonYear(c.listing) : '—'}</td>
                <td className="r num"><b>{c.subs || '—'}</b></td>
              </tr>
            )) : <tr><td colSpan={4} className="h-tbl-none">Nothing listed in the last 45 days.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Plain-language explainers. Generic and factual — what happens, not what to do. */
const BASICS: { icon: IconName; title: string; short: string; long: string }[] = [
  {
    icon: 'book', title: 'What is an IPO?',
    short: 'A company selling its shares to the public for the first time.',
    long: 'In an initial public offering a company lists on a stock exchange. It may raise new money (a fresh issue), let existing shareholders sell (an offer for sale), or both. Mainboard IPOs list on NSE and BSE; smaller companies list on the SME platforms.',
  },
  {
    icon: 'chart', title: 'How to apply',
    short: 'Bid through your broker or bank while the issue is open.',
    long: 'Choose a quantity in whole lots within the price band, or bid at the cut-off price, and approve the UPI mandate. The amount is blocked in your bank account, not debited, until allotment. One public application is allowed per PAN per issue.',
  },
  {
    icon: 'coins', title: 'How allotment works',
    short: 'The registrar decides who gets shares once bidding closes.',
    long: 'If an issue is oversubscribed, retail applicants are chosen by a computerised draw for the minimum lot; other categories are allotted as the offer document sets out. Shares go to your demat account, and the money for any shares not allotted is released.',
  },
  {
    icon: 'candles', title: 'Listing day',
    short: 'The day the shares start trading on the exchange.',
    long: 'Listing usually follows three working days after the issue closes. The opening price is set in a pre-open session that morning. From then on the shares trade like any other listed stock, and the price can move in either direction.',
  },
];

function Basics() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="h-sec" aria-labelledby="edu-h">
      <div className="h-sec-h"><div><h2 id="edu-h" className="h-h2">IPO basics</h2><p className="h-note">The terms on this site, explained briefly.</p></div></div>
      <div className="h-edu">
        {BASICS.map((b, i) => (
          <article key={b.title} className="h-card h-edu-c">
            <span className="h-edu-ic"><Icon name={b.icon} size={26} stroke={1.6} /></span>
            <h3 className="h-h3">{b.title}</h3>
            <p>{b.short}</p>
            {open === i ? <p className="h-edu-more">{b.long}</p> : null}
            <button type="button" className="h-link h-link-btn" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              {open === i ? 'Show less' : 'Read more'} <Arrow />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HomePage({ model }: { model: HomeModel }) {
  const f = featuredOf(model);
  const current = model.actionable.filter((c) => c.tone !== 'upcoming').slice(0, 6);
  const upcoming = model.actionable.filter((c) => c.tone === 'upcoming').slice(0, 6);
  return (
    <>
      {f ? <Featured f={f} /> : (
        <section className="h-feat-band" aria-labelledby="h-hero-h">
          <div className="h-wrap"><div className="h-feat"><div className="h-feat-copy">
            <h1 id="h-hero-h" className="h-h1">IPO research &amp; insights</h1>
            <p className="h-lede">Dates, price bands, subscription and allotment for every mainboard and SME IPO.</p>
          </div><div className="h-feat-art"><HeroArt kind="exchange" /></div></div></div>
        </section>
      )}
      <div className="h-wrap h-main">
        {current.length && upcoming.length ? (
          <div className="h-row h-row-iss">
            <Current rows={current} />
            <Upcoming rows={upcoming} />
          </div>
        ) : upcoming.length ? <Current rows={upcoming} title="Upcoming issues" id="up-h" /> : <Current rows={current} />}
        <div className="h-row">
          <Demand m={model} />
          <Listed rows={model.recent.slice(0, 5)} />
        </div>
        <Basics />
        <p className="h-fine">Figures as the exchanges and registrars publish them. A dash means the figure has not been published. This site informs; it does not recommend any issue.</p>
      </div>
    </>
  );
}
