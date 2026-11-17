'use client';

import Link from 'next/link';
import { useRef } from 'react';
import {
  CAL_KINDS, DOW, KIND_LABEL, dayNum, dowOf, monthGrid, monthLabel, weekDays, weekLabel, wdDayMon, ymOf,
  type CalEvent, type CalKind, type CalendarModel,
} from '@/core/calendar';
import { useCalendar } from '@/core/useCalendar';
import { Chevron, Logo } from './parts';

/*
 * STERLING'S CALENDAR — a month board with the company names written into each
 * day, and a full agenda for the period underneath. On a phone the board gives
 * way to the agenda alone: seven columns of names cannot be read at 375px.
 */

const SHORT: Record<CalKind, string> = { open: 'Open', close: 'Close', allot: 'Allot', list: 'List' };
const CAP = 3;

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const c = useCalendar(model);
  const agenda = useRef<HTMLDivElement>(null);
  const ipo = (e: CalEvent) => model.ipos[e.i];

  const choose = (d: string) => {
    c.pick(d);
    const el = agenda.current?.querySelector<HTMLElement>(`[data-day="${d}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const weeks = c.mode === 'month' ? monthGrid(ymOf(c.anchor)) : [weekDays(c.anchor)];
  const groups: [string, CalEvent[]][] = [];
  for (const e of c.inView) {
    const g = groups[groups.length - 1];
    if (g && g[0] === e.d) g[1].push(e); else groups.push([e.d, [e]]);
  }

  return (
    <div className="s-page">
      <div className="s-wrap">
        <p className="s-eyebrow">IPO calendar</p>
        <h1 className="s-ph1" style={{ marginTop: 10 }}>Every date that matters</h1>
        <p className="s-plede">When each IPO opens and closes for bidding, when the allotment is finalised and when the shares list. Select a day to see its events.</p>

        <div className="s-calbar">
          <div className="s-calnav">
            <button type="button" className="s-calarrow" onClick={() => c.go(-1)} disabled={!c.canPrev} aria-label={c.mode === 'month' ? 'Previous month' : 'Previous week'}><span style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}><Chevron size={16} /></span></button>
            <h2 className="s-calttl num" aria-live="polite">{c.mode === 'month' ? monthLabel(ymOf(c.anchor)) : weekLabel(c.anchor)}</h2>
            <button type="button" className="s-calarrow" onClick={() => c.go(1)} disabled={!c.canNext} aria-label={c.mode === 'month' ? 'Next month' : 'Next week'}><Chevron size={16} /></button>
            <button type="button" className="s-btn s-btn-s s-caltoday" onClick={c.goToday}>Today</button>
          </div>
          <div className="s-calopts">
            <div className="s-seg" role="group" aria-label="Range">
              <button type="button" aria-pressed={c.mode === 'month'} onClick={() => c.setMode('month')}>Month</button>
              <button type="button" aria-pressed={c.mode === 'week'} onClick={() => c.setMode('week')}>Week</button>
            </div>
            <select className="s-field" aria-label="Board" value={c.board} onChange={(e) => c.setBoard(e.target.value as typeof c.board)}>
              <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
            </select>
          </div>
        </div>

        <div className="s-calkeys" role="group" aria-label="Show events">
          {CAL_KINDS.map((k) => (
            <button key={k} type="button" className={`s-calkey k-${k}`} aria-pressed={c.kinds.has(k)} onClick={() => c.toggleKind(k)}>
              <span className="s-calsw" aria-hidden="true" />{KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className={`s-board${c.mode === 'week' ? ' is-week' : ''}`}>
          <div className="s-board-dow" aria-hidden="true">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
          {weeks.map((w) => (
            <div key={w[0]} className="s-board-row">
              {w.map((d) => {
                const evs = c.days.get(d) || [];
                const out = c.mode === 'month' && ymOf(d) !== ymOf(c.anchor);
                const shown = c.mode === 'month' ? evs.slice(0, CAP) : evs;
                return (
                  <div key={d} className={`s-day${out ? ' is-out' : ''}${d === c.today ? ' is-today' : ''}${d === c.selected ? ' is-sel' : ''}`}>
                    <button type="button" className="s-day-n num" onClick={() => choose(d)} aria-label={`${wdDayMon(d)}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}`}>
                      {c.mode === 'week' ? <><span className="s-day-w">{DOW[dowOf(d)]}</span>{dayNum(d)}</> : dayNum(d)}
                    </button>
                    {shown.map((e, j) => (
                      <Link key={j} href={ipo(e).href} className={`s-chip k-${e.k}`} title={`${KIND_LABEL[e.k]}: ${ipo(e).name}`}>
                        <b>{SHORT[e.k]}</b><span>{ipo(e).name}</span>
                      </Link>
                    ))}
                    {evs.length > shown.length ? <button type="button" className="s-chip-more" onClick={() => choose(d)}>+{evs.length - shown.length} more</button> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <section className="s-agenda" ref={agenda} aria-labelledby="ag-h">
          <div className="s-dsec-h">
            <h2 id="ag-h" className="s-h3">Agenda · {c.mode === 'month' ? monthLabel(ymOf(c.anchor)) : weekLabel(c.anchor)}</h2>
            <span className="s-note num">{c.inView.length} event{c.inView.length === 1 ? '' : 's'}</span>
          </div>
          {groups.length ? groups.map(([d, evs]) => (
            <div key={d} data-day={d} className={`s-ag-day${d === c.selected ? ' is-sel' : ''}`}>
              <div className="s-ag-date num">
                <b>{dayNum(d)}</b>
                <span>{wdDayMon(d).split(' ')[0]}{d === c.today ? ' · Today' : ''}</span>
              </div>
              <ul className="s-ag-list">
                {evs.map((e, j) => (
                  <li key={j}>
                    <Link href={ipo(e).href} className="s-ag-row">
                      <Logo ipo={ipo(e)} />
                      <span className="s-ag-name"><b>{ipo(e).name}</b><span className="s-meta">{ipo(e).board} · {ipo(e).band}</span></span>
                      <span className={`s-ag-kind k-${e.k}`}><span className="s-calsw" aria-hidden="true" />{KIND_LABEL[e.k]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )) : (
            <div className="s-empty"><p>No events in this {c.mode}</p><p>Try another {c.mode}, or turn more event types on above. Older IPOs are in <Link className="s-link" href="/ipos/">All IPOs</Link>.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
