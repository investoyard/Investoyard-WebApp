'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HomeModel, IpoCard } from '@/core/models';
import { dayMonYear } from '@/core/format';
import Countdown from './Countdown';
import { Arrow, Art, Board, Icon, Logo, Status, Ttl, targetOf, type IconName } from './parts';

/* The featured issue: first open, else next to open, else the most actionable — the house ordering read once. */
const featuredOf = (m: HomeModel): IpoCard | null =>
  m.actionable.find((c) => c.tone === 'open') || m.actionable.find((c) => c.tone === 'upcoming') || m.actionable[0] || m.recent[0] || null;
const topDemand = (m: HomeModel) => [...m.actionable, ...m.recent].filter((c) => c.subsN != null).sort((a, b) => b.subsN! - a.subsN!);

function Featured({ f }: { f: IpoCard }) {
  const target = targetOf(f);
  return (
    <article className="b-feat" aria-label={`Featured IPO: ${f.name}`}>
      <div className="b-feat-main">
        <div className="b-feat-tags"><span className="b-tag">Featured IPO</span><Status tone={f.tone}>{f.status}</Status><Board board={f.board} /></div>
        <h2 className="b-feat-name">{f.legal}</h2>
        {f.industry ? <p className="b-feat-meta">{f.industry}</p> : null}
        {f.blurb ? <p className="b-feat-blurb">{f.blurb}</p> : null}
        <dl className="b-feat-figs">
          <div><dt>Price band</dt><dd className="num">{f.band}</dd></div>
          <div><dt>Lot size</dt><dd className="num">{f.lot}</dd></div>
          <div><dt>Issue size</dt><dd className="num">{f.size}</dd></div>
          <div><dt>Issue type</dt><dd>{f.issueType}</dd></div>
        </dl>
      </div>
      <div className="b-feat-side">
        <Art kind="exchange" className="b-feat-art" />
        {target ? <Countdown at={target.at} label={target.label} /> : f.subs ? (
          <div className="b-cd"><p className="b-cd-l"><Icon name="chart" size={18} />Subscribed, final</p><strong className="b-feat-x num">{f.subs}</strong></div>
        ) : null}
        <Link className="b-btn b-btn-p" href={f.href}>View IPO details <Arrow /></Link>
      </div>
    </article>
  );
}

function Head({ id, title, href, more = 'View all', sub }: { id: string; title: string; href?: string; more?: string; sub?: string }) {
  return (
    <div className="b-card-h">
      <div><Ttl id={id}>{title}</Ttl>{sub ? <p className="b-note">{sub}</p> : null}</div>
      {href ? <Link className="b-link" href={href}>{more} <Arrow /></Link> : null}
    </div>
  );
}

function Current({ rows, title = 'Current issues', id = 'cur-h' }: { rows: IpoCard[]; title?: string; id?: string }) {
  return (
    <section className="b-card" aria-labelledby={id}>
      <Head id={id} title={title} href="/calendar/" />
      <div className="b-tbl-wrap">
        <table className="b-tbl b-tbl-fit">
          <thead><tr><th>Company</th><th className="r b-hm b-c1 w-band">Price band</th><th className="r b-hm w-size">Issue size</th><th className="w-dates">Open – close</th><th className="r w-act">Action</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><span className="b-co b-co-s"><Link href={c.href} title={c.name}>{c.name}</Link><Board board={c.board} /></span></td>
                <td className="r num b-hm b-c1">{c.band}</td>
                <td className="r num b-hm">{c.size}</td>
                <td className="num w-dates">{c.dates}</td>
                <td className="r"><Link className="b-view" href={c.href}>View</Link></td>
              </tr>
            )) : <tr><td colSpan={5} className="b-none">No issue is open or awaiting listing right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Upcoming({ rows }: { rows: IpoCard[] }) {
  return (
    <section className="b-card" aria-labelledby="up-h">
      <Head id="up-h" title="Upcoming issues" href="/calendar/" />
      <div className="b-tbl-wrap">
        <table className="b-tbl b-tbl-fit">
          <thead><tr><th>Company</th><th className="r b-hm b-c1 w-band">Price band</th><th className="r w-size">Issue size</th><th className="r w-open">Open date</th><th className="r b-hm w-act">Action</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><span className="b-co b-co-s"><Link href={c.href} title={c.name}>{c.name}</Link><Board board={c.board} /></span></td>
                <td className="r num b-hm b-c1">{c.band}</td>
                <td className="r num">{c.size}</td>
                <td className="r num">{c.open ? dayMonYear(c.open) : '—'}</td>
                <td className="r b-hm"><Link className="b-view" href={c.href}>View</Link></td>
              </tr>
            )) : <tr><td colSpan={5} className="b-none">No issue has announced its dates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* A ranking stated as what it is: overall subscription among current and recently listed issues. */
function Demand({ m }: { m: HomeModel }) {
  const list = topDemand(m).slice(0, 5);
  return (
    <section className="b-card" aria-labelledby="dem-h">
      <Head id="dem-h" title="Highest-demand IPOs" href="/subscription/" sub="Based on overall subscription (times)" />
      {list.length ? (
        <ol className="b-rank">
          {list.map((c, i) => (
            <li key={c.sym}>
              <span className="b-rank-n num">{i + 1}</span>
              <span className="b-co"><Link href={c.href} title={c.name}>{c.name}</Link><Board board={c.board} /></span>
              <span className="b-rank-bar" aria-hidden="true"><span style={{ width: `${Math.max(c.bar, 4)}%`, opacity: 1 - i * 0.14 }} /></span>
              <b className="num">{c.subs}</b>
            </li>
          ))}
        </ol>
      ) : <p className="b-none">No subscription figures yet.</p>}
    </section>
  );
}

function Listed({ rows }: { rows: IpoCard[] }) {
  return (
    <section className="b-card" aria-labelledby="lst-h">
      <Head id="lst-h" title="Recently listed IPOs" href="/ipos/" sub="Issues listed in the last 45 days" />
      <div className="b-tbl-wrap">
        <table className="b-tbl">
          <thead><tr><th>Company</th><th className="r b-hm">Issue price</th><th className="r">Listed on</th><th className="r">Subscribed</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.sym}>
                <td><Link className="b-co-l" href={c.href}>{c.name}</Link></td>
                <td className="r num b-hm">{c.band}</td>
                <td className="r num">{c.listing ? dayMonYear(c.listing) : '—'}</td>
                <td className="r num"><b className="b-x">{c.subs || '—'}</b></td>
              </tr>
            )) : <tr><td colSpan={4} className="b-none">Nothing listed in the last 45 days.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Plain-language explainers: what happens, never what to do. */
const BASICS: { icon: IconName; title: string; short: string; long: string }[] = [
  { icon: 'book', title: 'What is an IPO?', short: 'A company selling its shares to the public for the first time.', long: 'In an initial public offering a company lists on a stock exchange. It may raise new money (a fresh issue), let existing shareholders sell (an offer for sale), or both. Mainboard IPOs list on NSE and BSE; smaller companies list on the SME platforms.' },
  { icon: 'trend', title: 'How to apply for an IPO', short: 'Bid through your broker or bank while the issue is open.', long: 'Choose a quantity in whole lots within the price band, or bid at the cut-off price, and approve the UPI mandate. The amount is blocked in your bank account, not debited, until allotment. One public application is allowed per PAN per issue.' },
  { icon: 'scale', title: 'IPO allotment process', short: 'The registrar decides who gets shares once bidding closes.', long: 'If an issue is oversubscribed, retail applicants are chosen by a computerised draw for the minimum lot; other categories are allotted as the offer document sets out. Shares go to your demat account, and the money for any shares not allotted is released.' },
  { icon: 'chart', title: 'Listing day', short: 'The day the shares start trading on the exchange.', long: 'Listing usually follows three working days after the issue closes. The opening price is set in a pre-open session that morning. From then on the shares trade like any other listed stock, and the price can move in either direction.' },
];

function Basics() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section aria-labelledby="edu-h">
      <div className="b-sec-h"><div><h2 id="edu-h" className="b-h2">IPO basics</h2><p className="b-note">The terms on this site, explained briefly.</p></div></div>
      <div className="b-edu">
        {BASICS.map((b, i) => (
          <article key={b.title} className="b-card b-edu-c">
            <span className="b-edu-ic"><Icon name={b.icon} size={26} stroke={1.7} /></span>
            <h3 className="b-h3">{b.title}</h3>
            <p>{b.short}</p>
            {open === i ? <p className="b-edu-more">{b.long}</p> : null}
            <button type="button" className="b-link b-link-btn" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Show less' : 'Read more'} <Arrow /></button>
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
  const top = topDemand(model)[0];
  const stats: [IconName, string, string][] = [
    ['calendar', String(model.counts.open), 'Open IPOs'],
    ['hourglass', String(model.counts.upcoming), 'Upcoming IPOs'],
    ['chart', String(model.counts.recent), 'Listed in the last 45 days'],
    ['trend', top ? top.subs || '—' : '—', top ? `Highest demand · ${top.name}` : 'Highest demand'],
  ];
  return (
    <>
      <section className="b-hero b-hero-home" aria-labelledby="b-hero-h">
        <div className="b-wrap b-home-in">
          <div className="b-home-copy">
            <h1 id="b-hero-h" className="b-h1 b-h1-xl">Discover, analyse &amp; track IPOs</h1>
            <p className="b-lede">Your destination for IPO information: dates, price bands, live subscription, allotment status and listings for every mainboard and SME issue.</p>
            <div className="b-actions">
              <a className="b-btn b-btn-p" href="#issues">Explore current IPOs <Arrow /></a>
              <Link className="b-link" href="/allotment/">Check allotment <Arrow /></Link>
            </div>
          </div>
          {f ? <Featured f={f} /> : <Art kind="exchange" />}
        </div>
      </section>
      <div className="b-wrap b-main">
        <dl className="b-strip">
          {stats.map(([ic, v, l]) => <div key={l}><span className="b-strip-ic"><Icon name={ic} size={22} /></span><span><dd className="num">{v}</dd><dt>{l}</dt></span></div>)}
        </dl>
        <div id="issues" className="b-anchor" />
        {current.length && upcoming.length ? (
          <div className="b-row">
            <Current rows={current} />
            <Upcoming rows={upcoming} />
          </div>
        ) : upcoming.length ? <Upcoming rows={upcoming} /> : <Current rows={current} />}
        <div className="b-row">
          <Demand m={model} />
          <Listed rows={model.recent.slice(0, 5)} />
        </div>
        <Basics />
        <p className="b-fine">Figures as the exchanges and registrars publish them. A dash means the figure has not been published. This site informs; it does not recommend any issue.</p>
      </div>
    </>
  );
}
