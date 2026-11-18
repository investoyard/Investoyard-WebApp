'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import * as st from '@investoyard/shared-types';
import {
  KIND_LABEL, addMonths, dayMon, dowOf, DOW, monthLabel, weekDays, wdDayMon, ymOf,
  type CalIpo, type CalendarModel,
} from '@/core/calendar';
import { Board, Hero, Icon, Logo, Status, type IconName } from './parts';

/*
 * BENTO'S CALENDAR, after the reference: stat tiles in the hero, the six
 * stages of an IPO explained once as a timeline, a filter bar, and the month's
 * IPOs as a table of all six dates — or as a timeline of events by day.
 *
 * Today is the build day on the first render and the reader's IST day after mount.
 */

type Tab = 'all' | 'open' | 'upcoming' | 'allot' | 'list';
type View = 'table' | 'timeline';
const PER = 10;
const DATES: [keyof CalIpo, string][] = [['open', 'Opens'], ['close', 'Closes'], ['allot', 'Allotment'], ['refund', 'Refund'], ['demat', 'Demat'], ['list', 'Listing']];
const STEPS: [IconName, string, string][] = [
  ['calendar', 'IPO opens', 'Bidding starts'],
  ['clock', 'IPO closes', 'Last day to apply'],
  ['award', 'Allotment', 'Basis of allotment'],
  ['card', 'Refund', 'Blocked funds released'],
  ['layers', 'Demat credit', 'Shares reach your demat'],
  ['flag', 'Listing', 'Trading starts on the exchange'],
];
const SIZES: [string, string, (n: number | null) => boolean][] = [
  ['all', 'All sizes', () => true], ['s', 'Under ₹100 Cr', (n) => n != null && n < 100], ['m', '₹100–1,000 Cr', (n) => n != null && n >= 100 && n < 1000], ['l', '₹1,000 Cr and above', (n) => n != null && n >= 1000],
];
/* The two dates dropped first when the table runs out of room: refund and demat credit follow allotment by a day. */
const SPARE = new Set<keyof CalIpo>(['refund', 'demat']);
const inMonth = (x: CalIpo, ym: string) => DATES.some(([k]) => String(x[k]).startsWith(ym));
const statusOf = (x: CalIpo, today: string) => (x.tone === 'open' ? 'Open' : x.tone === 'upcoming' ? 'Upcoming' : x.list && x.list <= today ? 'Listed' : 'Closed');

function DateCell({ d }: { d: string }) {
  if (!d) return <span className="b-muted">—</span>;
  return <><span className="num">{dayMon(d)}</span><small>{DOW[dowOf(d)]} {d.slice(0, 4)}</small></>;
}

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const [today, setToday] = useState(model.asOf);
  const [ym, setYm] = useState(ymOf(model.asOf));
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('table');
  const [board, setBoard] = useState('all');
  const [exch, setExch] = useState('all');
  const [size, setSize] = useState('all');
  const [sector, setSector] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = st.istToday();
    setToday(t);
    if (t !== model.asOf && t >= model.from && t <= model.to) setYm(ymOf(t));
  }, [model.asOf, model.from, model.to]);

  const months = useMemo(() => { const out: string[] = []; for (let m = ymOf(model.to); m >= ymOf(model.from); m = addMonths(m, -1)) out.push(m); return out; }, [model.from, model.to]);
  const sectors = useMemo(() => Array.from(new Set(model.ipos.map((x) => x.industry).filter(Boolean) as string[])).sort(), [model.ipos]);
  const week = weekDays(today);
  const inWeek = (d: string) => !!d && d >= week[0] && d <= week[6];
  const stats: [IconName, number, string][] = [
    ['calendar', model.ipos.filter((x) => x.open && x.open <= today && x.close >= today).length, 'Open IPOs'],
    ['layers', model.ipos.filter((x) => x.open > today).length, 'Upcoming'],
    ['check', model.ipos.filter((x) => inWeek(x.allot)).length, 'Allotment this week'],
    ['chart', model.ipos.filter((x) => inWeek(x.list)).length, 'Listing this week'],
  ];

  /* The date column a tab is about. Allotment and Listing sort by THEIR date, nearest upcoming first, then the most recent. */
  const key: keyof CalIpo = tab === 'allot' ? 'allot' : tab === 'list' ? 'list' : 'open';
  const fits = (x: CalIpo) => {
    const fitSize = SIZES.find((s) => s[0] === size)![2];
    const ex = x.exchanges.toUpperCase();
    return (board === 'all' || x.board === board) && fitSize(x.sizeN) && (sector === 'all' || x.industry === sector)
      && (exch === 'all' || (exch === 'NSE' ? ex.includes('NSE') : exch === 'BSE' ? ex.includes('BSE') : ex.includes('SME')));
  };
  const rows = useMemo(() => {
    const out = model.ipos.filter((x) => inMonth(x, ym) && fits(x))
      .filter((x) => tab === 'all' || (tab === 'open' ? x.tone === 'open' : tab === 'upcoming' ? x.tone === 'upcoming' : String(x[key]).startsWith(ym)));
    if (tab === 'allot' || tab === 'list') {
      return out.sort((a, b) => {
        const da = String(a[key]), db = String(b[key]);
        const fa = da >= today, fb = db >= today;
        if (fa !== fb) return fa ? -1 : 1;
        return da === db ? a.name.localeCompare(b.name) : fa ? (da < db ? -1 : 1) : (da < db ? 1 : -1);
      });
    }
    const rank = (x: CalIpo) => (x.tone === 'open' ? 0 : x.tone === 'upcoming' ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? (a.open < b.open ? 1 : -1) : (a.open < b.open ? -1 : 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.ipos, ym, tab, board, exch, size, sector, today, key]);

  /* The timeline view: every event in the month, by day, honouring the same filters and tab. */
  const events = useMemo(() => {
    const syms = new Set(rows.map((r) => r.sym));
    const kinds = tab === 'allot' ? ['allot'] : tab === 'list' ? ['list'] : ['open', 'close', 'allot', 'list'];
    const byDay = new Map<string, { k: string; x: CalIpo }[]>();
    for (const e of model.events) {
      const x = model.ipos[e.i];
      if (!e.d.startsWith(ym) || !syms.has(x.sym) || !kinds.includes(e.k)) continue;
      const l = byDay.get(e.d) || [];
      l.push({ k: e.k, x });
      byDay.set(e.d, l);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [model.events, model.ipos, rows, ym, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = rows.slice(p * PER, p * PER + PER);
  const reset = () => setPage(0);
  const clear = () => { setBoard('all'); setExch('all'); setSize('all'); setSector('all'); setTab('all'); setYm(ymOf(today)); reset(); };
  const TABS: [Tab, string][] = [['all', 'All IPOs'], ['open', 'Open'], ['upcoming', 'Upcoming'], ['allot', 'Allotment'], ['list', 'Listing']];

  return (
    <>
      <Hero eyebrow="IPO calendar" title="IPO Calendar" sub="Track the complete IPO schedule — from opening to listing — in one place." art="calendar">
        <dl className="b-hstats b-hstats-sm">
          {stats.map(([ic, n, l]) => <div key={l}><span className="b-strip-ic"><Icon name={ic} size={22} /></span><span><dd className="num">{n}</dd><dt>{l}</dt></span></div>)}
        </dl>
      </Hero>
      <div className="b-wrap b-main">
        <section className="b-sched" aria-labelledby="tl-h">
          <div className="b-sec-h">
            <h2 id="tl-h" className="b-h2">IPO schedule timeline</h2>
            <div className="b-seg" role="tablist" aria-label="Show">
              {TABS.map(([t, l]) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); reset(); }}>{l}</button>)}
            </div>
          </div>
          <ol className="b-steps">
            {STEPS.map(([ic, t, d], i) => (
              <li key={t} className={(tab === 'open' || tab === 'upcoming') && i === 0 ? 'on' : tab === 'allot' && i === 2 ? 'on' : tab === 'list' && i === 5 ? 'on' : tab === 'all' && i === 0 ? 'on' : undefined}>
                <span className="b-step-ic"><Icon name={ic} size={22} /></span><b>{t}</b><small>{d}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="b-card b-fbar" aria-label="Filter IPOs">
          <span className="b-fbar-t"><Icon name="filter" size={20} />Filter IPOs</span>
          <label className="b-flbl">Month<select className="b-field" value={ym} onChange={(e) => { setYm(e.target.value); reset(); }}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
          <label className="b-flbl">Issue type<select className="b-field" value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All types</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
          <label className="b-flbl">Exchange<select className="b-field" value={exch} onChange={(e) => { setExch(e.target.value); reset(); }}><option value="all">All exchanges</option><option value="NSE">NSE</option><option value="BSE">BSE</option><option value="SME">SME platforms</option></select></label>
          <label className="b-flbl">Issue size<select className="b-field" value={size} onChange={(e) => { setSize(e.target.value); reset(); }}>{SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="b-flbl">Sector<select className="b-field" value={sector} onChange={(e) => { setSector(e.target.value); reset(); }}><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <button type="button" className="b-link b-link-btn b-clear" onClick={clear}><Icon name="reset" size={16} />Clear filters</button>
        </section>

        <section className="b-card b-card-flush" aria-labelledby="cl-h">
          <div className="b-card-bar">
            <h2 id="cl-h" className="b-h2">IPO calendar <span className="b-count num">({rows.length})</span></h2>
            <div className="b-vt" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><Icon name="table" size={16} />Table view</button>
              <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><Icon name="list" size={16} />Timeline view</button>
            </div>
          </div>
          {view === 'table' ? (
            <>
              <div className="b-tbl-wrap">
                <table className="b-tbl b-tbl-cal">
                  <thead><tr><th>Company / IPO</th><th className="b-c2">Board</th><th className="r b-c2">Size (₹ Cr)</th><th className="r">Price (₹)</th><th className="r b-c2">Lot</th>{DATES.map(([k, l]) => <th key={k} className={[k === key ? 'is-key' : '', SPARE.has(k) ? 'b-c1' : ''].filter(Boolean).join(' ') || undefined}>{l}</th>)}<th><span className="sr">Open</span></th></tr></thead>
                  <tbody>
                    {shown.length ? shown.map((x, i) => (
                      <tr key={x.sym}>
                        <td><Link className="b-calco" href={x.href}><Logo ipo={x} size="sm" /><span><span className="b-calco-t"><b title={x.name}>{x.name}</b><Status tone={x.tone}>{statusOf(x, today)}</Status></span><small title={x.industry || undefined}>{x.industry || x.exchanges}</small></span></Link></td>
                        <td className="b-c2"><Board board={x.board} /></td>
                        <td className="r num b-c2">{x.sizeN != null ? x.sizeN.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
                        <td className="r num">{x.band.replace(/₹/g, '')}</td>
                        <td className="r num b-c2">{x.lot.replace(' shares', '')}</td>
                        {DATES.map(([k]) => {
                          const d = String(x[k]);
                          return <td key={k} className={`b-dcell${k === key ? ' is-key' : ''}${d === today ? ' is-today' : ''}${SPARE.has(k) ? ' b-c1' : ''}`}><DateCell d={d} /></td>;
                        })}
                        <td><Link className="b-go" href={x.href} aria-label={`${x.name} IPO details`}><Icon name="chevron" size={18} /></Link></td>
                      </tr>
                    )) : <tr><td colSpan={12} className="b-none">No IPO matches in {monthLabel(ym)}.</td></tr>}
                  </tbody>
                </table>
              </div>
              <ul className="b-mrows">
                {!shown.length ? <li className="b-none">No IPO matches in {monthLabel(ym)}.</li> : null}
                {shown.map((x) => (
                  <li key={x.sym}>
                    <Link href={x.href} className="b-mrow">
                      <span className="b-mrow-h"><Logo ipo={x} size="sm" /><span><b>{x.name}</b><small>{x.board} · {x.band}</small></span><Status tone={x.tone}>{statusOf(x, today)}</Status></span>
                      <span className="b-mrow-d">{DATES.filter(([k]) => x[k]).map(([k, l]) => <span key={k} className={k === key ? 'is-key' : undefined}><small>{l}</small><b className="num">{dayMon(String(x[k]))}</b></span>)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="b-pager">
                <span className="b-muted num">{rows.length ? `Showing ${p * PER + 1}–${Math.min(rows.length, p * PER + PER)} of ${rows.length} IPOs` : 'No IPOs'}</span>
                {pages > 1 ? (
                  <nav className="b-pages" aria-label="Pages">
                    <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Previous page">‹</button>
                    {Array.from({ length: pages }, (_, i) => <button key={i} type="button" aria-current={i === p ? 'page' : undefined} onClick={() => setPage(i)}>{i + 1}</button>)}
                    <button type="button" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page">›</button>
                  </nav>
                ) : null}
              </div>
            </>
          ) : (
            <div className="b-tline">
              {events.length ? events.map(([d, list]) => (
                <div key={d} className={`b-tline-day${d === today ? ' is-today' : d < today ? ' done' : ''}`}>
                  <div className="b-tline-d"><b className="num">{d.slice(8, 10).replace(/^0/, '')}</b><span>{wdDayMon(d).split(' ')[0]}{d === today ? ' · Today' : ''}</span></div>
                  <ul>
                    {list.map((e, i) => (
                      <li key={i}><Link href={e.x.href} className="b-tline-e"><Logo ipo={e.x} size="sm" /><span><b>{e.x.name}</b><small>{e.x.board} · {e.x.band}</small></span><span className={`b-kind k-${e.k}`}>{KIND_LABEL[e.k as 'open']}</span></Link></li>
                    ))}
                  </ul>
                </div>
              )) : <p className="b-none">No IPO dates match in {monthLabel(ym)}.</p>}
            </div>
          )}
        </section>
        <p className="b-fine">Dates as published for each issue; a dash means the date has not been entered. Earlier months are in the <Link className="b-link-in" href="/ipos/">archive</Link>.</p>
      </div>
    </>
  );
}
