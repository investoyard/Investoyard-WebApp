'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CAL_KINDS, DOW, KIND_LABEL, countKinds, dayNum, monthGrid, monthLabel, weekLabel, wdDayMon, ymOf,
  type CalEvent, type CalendarModel,
} from '@/core/calendar';
import { useCalendar } from '@/core/useCalendar';
import { Logo, St } from './parts';

/*
 * TERMINAL'S CALENDAR — a schedule, the way a dealing desk keeps one: every
 * event in the period as a sortable-by-date row, filters above it, and a
 * pinned panel beside it with a heat-map of the month. Picking a day in the
 * heat-map narrows the schedule to that day; nothing navigates away.
 */

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const c = useCalendar(model);
  const [dayOnly, setDayOnly] = useState(false);
  const ipo = (e: CalEvent) => model.ipos[e.i];
  const rows = dayOnly ? c.onDay : c.inView;
  const counts = countKinds(c.inView);
  const ym = ymOf(c.anchor);
  const grid = monthGrid(ym);
  const max = Math.max(1, ...grid.flat().map((d) => (c.days.get(d) || []).length));
  const title = c.mode === 'month' ? monthLabel(ym) : weekLabel(c.anchor);

  const pickDay = (d: string) => {
    if (dayOnly && d === c.selected) { setDayOnly(false); return; }
    c.pick(d);
    setDayOnly(true);
  };
  const nav = (n: number) => { setDayOnly(false); c.go(n); };

  return (
    <div className="t-page">
      <div className="t-intro">
        <div><h1>IPO calendar</h1><p>Openings, closings, allotments and listings across mainboard and SME, by date.</p></div>
        <div className="t-tools">
          <button type="button" className="t-btn" onClick={() => nav(-1)} disabled={!c.canPrev} aria-label={c.mode === 'month' ? 'Previous month' : 'Previous week'}>‹</button>
          <span className="t-calttl num" aria-live="polite">{title}</span>
          <button type="button" className="t-btn" onClick={() => nav(1)} disabled={!c.canNext} aria-label={c.mode === 'month' ? 'Next month' : 'Next week'}>›</button>
          <button type="button" className="t-btn" onClick={() => { setDayOnly(false); c.goToday(); }}>Today</button>
        </div>
      </div>

      <div className="t-split t-calsplit">
        <section className="t-panel" aria-labelledby="sch-h">
          <div className="t-ph">
            <h2 id="sch-h">Schedule <span className="t-muted num" style={{ fontWeight: 500 }}>· {rows.length} event{rows.length === 1 ? '' : 's'}</span></h2>
            <div className="t-tools">
              <div className="t-seg" role="group" aria-label="Range">
                <button type="button" aria-pressed={c.mode === 'month'} onClick={() => { setDayOnly(false); c.setMode('month'); }}>Month</button>
                <button type="button" aria-pressed={c.mode === 'week'} onClick={() => { setDayOnly(false); c.setMode('week'); }}>Week</button>
              </div>
              <div className="t-seg" role="group" aria-label="Event types">
                {CAL_KINDS.map((k) => <button key={k} type="button" aria-pressed={c.kinds.has(k)} onClick={() => c.toggleKind(k)}><i className={`t-kdot k-${k}`} aria-hidden="true" />{KIND_LABEL[k]}</button>)}
              </div>
              <select className="t-input" aria-label="Board" value={c.board} onChange={(e) => c.setBoard(e.target.value as typeof c.board)}>
                <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
              </select>
            </div>
          </div>
          {dayOnly ? (
            <div className="t-calfilter">Showing <b>{wdDayMon(c.selected)}</b> only <button type="button" className="t-link" onClick={() => setDayOnly(false)}>Show all of {c.mode === 'month' ? monthLabel(ym) : 'this week'}</button></div>
          ) : null}
          {rows.length ? (
            <>
              <div className="t-table-wrap t-calwide">
                <table className="t-table t-caltable">
                  <thead><tr><th>Date</th><th>Event</th><th>Company</th><th className="t-k1">Board</th><th className="r t-k3">Price band</th><th className="r t-k2">Issue size</th><th className="t-k3">Status</th></tr></thead>
                  <tbody>
                    {rows.map((e, j) => {
                      const x = ipo(e);
                      const first = j === 0 || rows[j - 1].d !== e.d;
                      return (
                        <tr key={j} className={`${first ? 'is-first' : ''}${e.d === c.today ? ' is-today' : ''}`}>
                          <td className="num t-caldate">{first ? <>{wdDayMon(e.d)}{e.d === c.today ? <span className="t-todaytag">Today</span> : null}</> : null}</td>
                          <td><span className={`t-ktag k-${e.k}`}>{KIND_LABEL[e.k]}</span></td>
                          <td><div className="t-co"><Logo ipo={x} /><Link className="t-co-name" href={x.href}>{x.name}</Link></div></td>
                          <td className="t-muted t-k1">{x.board}</td>
                          <td className="r t-k3">{x.band}</td>
                          <td className="r t-k2">{x.size}</td>
                          <td className="t-k3"><St tone={x.tone}>{x.status}</St></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="t-calrows">
                {rows.map((e, j) => {
                  const x = ipo(e);
                  return (
                    <li key={j}>
                      <Link href={x.href}>
                        <span className="num t-calrows-d">{wdDayMon(e.d)}</span>
                        <span style={{ minWidth: 0 }}><span className="t-co-name">{x.name}</span><span className="t-co-sub">{x.board} · {x.band}</span></span>
                        <span className={`t-ktag k-${e.k}`}>{KIND_LABEL[e.k]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="t-empty"><strong>No events</strong>Nothing matches in {dayOnly ? 'this day' : `this ${c.mode}`}. Turn more event types on, or move to another {c.mode}.</div>
          )}
        </section>

        <aside className="t-panel t-pane t-calpane" aria-labelledby="hm-h">
          <div className="t-ph"><h2 id="hm-h">{monthLabel(ym)}</h2><span className="t-muted" style={{ fontSize: 12.5 }}>Select a day to filter</span></div>
          <div className="t-pb">
            <div className="t-heat">
              {DOW.map((d) => <span key={d} className="t-heat-dow" aria-hidden="true">{d.slice(0, 2)}</span>)}
              {grid.flat().map((d) => {
                const n = (c.days.get(d) || []).length;
                const out = ymOf(d) !== ym;
                return (
                  <button
                    key={d} type="button"
                    className={`t-heat-d num${out ? ' is-out' : ''}${d === c.today ? ' is-today' : ''}${dayOnly && d === c.selected ? ' is-sel' : ''}`}
                    style={n && !out ? { background: `color-mix(in srgb, var(--brand) ${Math.round(14 + (n / max) * 62)}%, #ffffff)`, color: n / max > 0.5 ? 'var(--brand-on)' : 'var(--ink)' } : undefined}
                    onClick={() => pickDay(d)} disabled={out}
                    aria-label={`${wdDayMon(d)}, ${n || 'no'} event${n === 1 ? '' : 's'}`} aria-pressed={dayOnly && d === c.selected}
                  >{dayNum(d)}</button>
                );
              })}
            </div>
            <div className="t-heat-key" aria-hidden="true"><span>Fewer</span><i style={{ background: 'color-mix(in srgb, var(--brand) 14%, #fff)' }} /><i style={{ background: 'color-mix(in srgb, var(--brand) 45%, #fff)' }} /><i style={{ background: 'var(--brand)' }} /><span>More events</span></div>
          </div>
          <div className="t-pane-sec">
            <h3>In {c.mode === 'month' ? monthLabel(ym) : 'this week'}<b>{c.inView.length}</b></h3>
            {CAL_KINDS.map((k) => (
              <div key={k} className="t-calcount"><span><i className={`t-kdot k-${k}`} aria-hidden="true" />{KIND_LABEL[k]}</span><b className="num">{counts[k]}</b></div>
            ))}
          </div>
          <div className="t-pane-act"><Link className="t-btn" href="/ipos/">Older IPOs in the archive</Link></div>
        </aside>
      </div>
    </div>
  );
}
