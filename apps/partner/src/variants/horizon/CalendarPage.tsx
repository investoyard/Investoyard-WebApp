'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import * as st from '@investoyard/shared-types';
import {
  addDays, addMonths, dayMon, monthLabel, weekDays, weekLabel, weekStart, ymOf,
  type CalIpo, type CalendarModel,
} from '@/core/calendar';
import { Hero, Icon, Logo, Status, type IconName } from './parts';

/*
 * HORIZON'S CALENDAR — the schedule as a table, the way a research desk keeps
 * one: every IPO with any date in the chosen month, and all six of its dates
 * side by side (open, close, allotment, refund, demat credit, listing). Above
 * it, this week at a glance as a timeline of what happens each day.
 *
 * Today is the build day on the first render and the reader's IST day after
 * mount, so the server HTML and the first client render agree.
 */

type Tab = 'all' | 'open' | 'upcoming' | 'allot' | 'list';
const PER = 10;
const DATES: [keyof CalIpo, string][] = [['open', 'Open'], ['close', 'Close'], ['allot', 'Allotment'], ['refund', 'Refund'], ['demat', 'Demat credit'], ['list', 'Listing']];
const SUMMARY: [keyof CalIpo, string, string][] = [['open', 'IPO opens', 'IPOs open'], ['close', 'IPO closes', 'IPOs close'], ['allot', 'allotment', 'allotments'], ['refund', 'refund', 'refunds'], ['demat', 'demat credit', 'demat credits'], ['list', 'listing', 'listings']];

const inMonth = (x: CalIpo, ym: string) => DATES.some(([k]) => String(x[k]).startsWith(ym));
const dd = (d: string, ym: string) => (!d ? '—' : d.slice(0, 4) === ym.slice(0, 4) ? dayMon(d) : `${dayMon(d)} ${d.slice(0, 4)}`);

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const [today, setToday] = useState(model.asOf);
  const [ym, setYm] = useState(ymOf(model.asOf));
  const [tab, setTab] = useState<Tab>('all');
  const [board, setBoard] = useState('all');
  const [sector, setSector] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  /* The week the glance card shows; the build day first, the reader's IST week after mount. */
  const [wk, setWk] = useState(model.asOf);

  useEffect(() => {
    const t = st.istToday();
    setToday(t);
    setWk(t);
    if (t !== model.asOf && t >= model.from && t <= model.to) setYm(ymOf(t));
  }, [model.asOf, model.from, model.to]);

  const months = useMemo(() => {
    const out: string[] = [];
    for (let m = ymOf(model.to); m >= ymOf(model.from); m = addMonths(m, -1)) out.push(m);
    return out;
  }, [model.from, model.to]);
  const sectors = useMemo(() => Array.from(new Set(model.ipos.map((x) => x.industry).filter(Boolean) as string[])).sort(), [model.ipos]);

  const week = weekDays(today);
  const wkEnd = week[6];
  const inWeek = (d: string) => !!d && d >= week[0] && d <= wkEnd;
  const stats: [IconName, number, string][] = [
    ['calendar', model.ipos.filter((x) => x.open && x.open <= today && x.close >= today).length, 'Open IPOs'],
    ['clock', model.ipos.filter((x) => x.open > today).length, 'Upcoming IPOs'],
    ['check', model.ipos.filter((x) => inWeek(x.allot)).length, 'Allotments this week'],
    ['candles', model.ipos.filter((x) => inWeek(x.list)).length, 'Listings this week'],
  ];
  const wkDays = weekDays(wk);
  const isThisWeek = weekStart(wk) === weekStart(today);
  const canPrev = addDays(weekStart(wk), -1) >= model.from;
  const canNext = addDays(weekStart(wk), 7) <= model.to;
  const glance = wkDays.map((d) => ({
    d,
    lines: SUMMARY.map(([k, one, many]) => { const n = model.ipos.filter((x) => x[k] === d).length; return n ? `${n} ${n === 1 ? one : many}` : ''; }).filter(Boolean),
  })).filter((g) => g.lines.length);

  /* The date column a tab is about, or none. */
  const key: keyof CalIpo | null = tab === 'allot' ? 'allot' : tab === 'list' ? 'list' : null;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return model.ipos
      .filter((x) => inMonth(x, ym))
      .filter((x) => tab === 'all' || (tab === 'open' ? x.tone === 'open' : tab === 'upcoming' ? x.tone === 'upcoming' : tab === 'allot' ? x.allot.startsWith(ym) : x.list.startsWith(ym)))
      .filter((x) => (board === 'all' || x.board === board) && (sector === 'all' || x.industry === sector) && (!s || x.name.toLowerCase().includes(s) || x.sym.toLowerCase().includes(s)))
      .sort((a, b) => {
        /* Allotment and Listing order by THEIR date: the nearest one still ahead first, then the most recent. In most months
           nearly every IPO has both dates, so filtering alone left the list looking unchanged. */
        if (key) {
          const da = String(a[key]), db = String(b[key]);
          const fa = da >= today, fb = db >= today;
          if (fa !== fb) return fa ? -1 : 1;
          if (da !== db) return fa ? (da < db ? -1 : 1) : (da < db ? 1 : -1);
          return a.name.localeCompare(b.name);
        }
        const rank = (x: CalIpo) => (x.tone === 'open' ? 0 : x.tone === 'upcoming' ? 1 : 2);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        const ao = a.open || '9', bo = b.open || '9';
        const dir = rank(a) === 2 ? -1 : 1;
        return ao < bo ? -dir : ao > bo ? dir : a.name.localeCompare(b.name);
      });
  }, [model.ipos, ym, tab, board, sector, q, key, today]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const p = Math.min(page, pages - 1);
  const shown = rows.slice(p * PER, p * PER + PER);
  const reset = () => setPage(0);
  const TABS: [Tab, string][] = [['all', 'All IPOs'], ['open', 'Open'], ['upcoming', 'Upcoming'], ['allot', 'Allotment'], ['list', 'Listing']];

  return (
    <>
      <Hero eyebrow="IPO calendar" title="IPO schedule & key dates" sub="Opening, closing, allotment, refund, demat credit and listing dates for every mainboard and SME IPO, at a glance." art="tower" />
      <div className="h-wrap h-main">
        <dl className="h-stats">
          {stats.map(([ic, n, l], i) => (
            <div key={l} className={i === 0 ? 'is-first' : undefined}><Icon name={ic} size={26} stroke={1.6} /><span><dd className="num">{n}</dd><dt>{l}</dt></span></div>
          ))}
        </dl>

        <section className="h-card h-glance" aria-labelledby="gl-h">
          <div className="h-glance-l">
            <h2 id="gl-h" className="h-h3">{isThisWeek ? 'This week at a glance' : 'Week at a glance'}</h2>
            <p className="num" aria-live="polite">{weekLabel(wk)}</p>
            <div className="h-wknav">
              <button type="button" onClick={() => setWk(addDays(weekStart(wk), -7))} disabled={!canPrev} aria-label="Previous week">‹</button>
              <button type="button" className="h-wknav-now" onClick={() => setWk(today)} disabled={isThisWeek}>This week</button>
              <button type="button" onClick={() => setWk(addDays(weekStart(wk), 7))} disabled={!canNext} aria-label="Next week">›</button>
            </div>
          </div>
          {glance.length ? (
            <ol className="h-glance-t">
              {glance.map((g) => (
                <li key={g.d} className={g.d < today ? 'done' : g.d === today ? 'now' : undefined}>
                  <span className="h-glance-d num">{g.d === today ? 'Today' : dayMon(g.d)}</span>
                  <i aria-hidden="true" />
                  {g.lines.map((l) => <span key={l} className="h-glance-x">{l}</span>)}
                </li>
              ))}
            </ol>
          ) : <p className="h-tbl-none">No IPO dates fall in {isThisWeek ? 'this week' : weekLabel(wk)}.</p>}
        </section>

        <div className="h-calbar">
          <div className="h-tabs" role="tablist" aria-label="Filter IPOs">
            {TABS.map(([t, l]) => <button key={t} type="button" role="tab" className="h-tab" aria-selected={tab === t} onClick={() => { setTab(t); reset(); }}>{l}</button>)}
          </div>
          <div className="h-filters">
            <label className="h-sel h-sel-plain"><span className="sr">Month</span><select value={ym} onChange={(e) => { setYm(e.target.value); reset(); }}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
            <label className="h-sel h-sel-plain"><span className="sr">Board</span><select value={board} onChange={(e) => { setBoard(e.target.value); reset(); }}><option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option></select></label>
            {sectors.length ? <label className="h-sel h-sel-plain"><span className="sr">Sector</span><select value={sector} onChange={(e) => { setSector(e.target.value); reset(); }}><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label> : null}
            <label className="h-qbox"><Icon name="search" size={17} /><span className="sr">Search</span><input type="search" placeholder="Search company or IPO" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
          </div>
        </div>

        <section className="h-card h-card-flush" aria-label={`IPOs with dates in ${monthLabel(ym)}`}>
          <div className="h-tbl-wrap">
            <table className="h-tbl h-tbl-cal">
              <thead>
                <tr><th className="num h-k1">#</th><th>Company / IPO</th><th className="r h-k3">Issue size</th><th className="r">Price band (₹)</th><th className="h-k1">Board</th>{DATES.map(([k, l]) => <th key={l} className={[k === key ? 'is-key' : '', k === 'refund' || k === 'demat' ? 'h-k2' : ''].join(' ').trim() || undefined}>{l}</th>)}<th className="h-k3">Status</th></tr>
              </thead>
              <tbody>
                {shown.length ? shown.map((x, i) => (
                  <tr key={x.sym}>
                    <td className="num h-muted h-k1">{p * PER + i + 1}</td>
                    <td><Link className="h-co" href={x.href}><Logo ipo={x} size="sm" /><span><b>{x.name}</b>{x.industry ? <small>{x.industry}</small> : null}</span></Link></td>
                    <td className="r num h-k3">{x.size}</td>
                    <td className="r num">{x.band.replace(/₹/g, '')}</td>
                    <td className="h-k1"><span className={`h-board${x.board === 'SME' ? ' sme' : ''}`}>{x.board}</span></td>
                    {DATES.map(([k]) => {
                      const d = String(x[k]);
                      return <td key={k} className={`num h-dt${d === today ? ' is-today' : ''}${!d ? ' h-muted' : ''}${k === key ? ' is-key' : ''}${k === key && d >= today ? ' is-ahead' : ''}${k === 'refund' || k === 'demat' ? ' h-k2' : ''}`}>{dd(d, ym)}</td>;
                    })}
                    <td className="h-k3"><Status tone={x.tone}>{x.tone === 'open' ? 'Open' : x.tone === 'upcoming' ? 'Upcoming' : x.list && x.list <= today ? 'Listed' : 'Closed'}</Status></td>
                  </tr>
                )) : <tr><td colSpan={12} className="h-tbl-none">No IPO matches in {monthLabel(ym)}.</td></tr>}
              </tbody>
            </table>
          </div>
          <ul className="h-mrows">
            {shown.map((x) => (
              <li key={x.sym}>
                <Link href={x.href} className="h-mrow">
                  <span className="h-mrow-h"><Logo ipo={x} size="sm" /><span><b>{x.name}</b><small>{x.board} · {x.band}</small></span><Status tone={x.tone}>{x.tone === 'open' ? 'Open' : x.tone === 'upcoming' ? 'Upcoming' : 'Closed'}</Status></span>
                  <span className="h-mrow-d">{DATES.filter(([k]) => x[k]).map(([k, l]) => <span key={k}><small>{l}</small><b className="num">{dayMon(String(x[k]))}</b></span>)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="h-pager">
          <span className="h-muted num">{rows.length ? `Showing ${p * PER + 1}–${Math.min(rows.length, p * PER + PER)} of ${rows.length} IPOs` : 'No IPOs'}</span>
          {pages > 1 ? (
            <nav className="h-pages" aria-label="Pages">
              <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Previous page">‹</button>
              {Array.from({ length: pages }, (_, i) => <button key={i} type="button" aria-current={i === p ? 'page' : undefined} onClick={() => setPage(i)}>{i + 1}</button>)}
              <button type="button" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page">›</button>
            </nav>
          ) : null}
        </div>
        <p className="h-fine">Dates as published for each issue; a dash means the date has not been entered. Earlier months are in the <Link className="h-link-in" href="/ipos/">archive</Link>.</p>
      </div>
    </>
  );
}
