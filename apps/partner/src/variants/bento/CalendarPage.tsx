'use client';

import Link from 'next/link';
import {
  CAL_KINDS, DOW, KIND_LABEL, addMonths, dayNum, monthGrid, monthLabel, monthStart, weekLabel, weekDays, wdDayMon, ymOf,
  type CalEvent, type CalendarModel,
} from '@/core/calendar';
import { useCalendar } from '@/core/useCalendar';
import { Arrow, Logo } from './parts';

/*
 * BENTO'S CALENDAR — tiles. A week of day tiles across the top, each holding
 * its events as pills; under it a small month to jump around, the picked day
 * in full, and what is coming next. Built for a thumb: on a phone the week
 * stacks into a list of days.
 */

const Chev = ({ flip = false }: { flip?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}><path d="M9 6l6 6-6 6" /></svg>
);

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const c = useCalendar(model, 'week');
  const ipo = (e: CalEvent) => model.ipos[e.i];
  const ym = ymOf(c.selected);
  const next = c.events.filter((e) => e.d >= c.today).slice(0, 6);
  const nextDay = c.events.find((e) => e.d > c.selected)?.d;
  const monthPrev = monthStart(addMonths(ym, -1));
  const monthNext = monthStart(addMonths(ym, 1));

  return (
    <div className="b-page">
      <section className="b-ph b-cal-ph">
        <div>
          <h1 className="disp">IPO calendar</h1>
          <p>Openings, closings, allotments and listings, a week at a time. Tap a day to see everything on it.</p>
        </div>
        <div className="b-cal-filters">
          <div className="b-pills" role="group" aria-label="Show events">
            {CAL_KINDS.map((k) => (
              <button key={k} type="button" className={`b-pill b-kp k-${k}`} aria-pressed={c.kinds.has(k)} onClick={() => c.toggleKind(k)}><i aria-hidden="true" />{KIND_LABEL[k]}</button>
            ))}
          </div>
          <div className="b-pills" role="group" aria-label="Board">
            {(['all', 'Mainboard', 'SME'] as const).map((b) => (
              <button key={b} type="button" className="b-pill" aria-pressed={c.board === b} onClick={() => c.setBoard(b)}>{b === 'all' ? 'All' : b}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="b-tile b-wk" aria-labelledby="wk-h">
        <div className="b-wk-h">
          <h2 id="wk-h" className="b-h3 disp num">{weekLabel(c.anchor)}</h2>
          <div className="b-wk-nav">
            <button type="button" className="b-rnd" onClick={() => c.go(-1)} disabled={!c.canPrev} aria-label="Previous week"><Chev flip /></button>
            <button type="button" className="b-btn b-btn-s b-wk-today" onClick={c.goToday}>Today</button>
            <button type="button" className="b-rnd" onClick={() => c.go(1)} disabled={!c.canNext} aria-label="Next week"><Chev /></button>
          </div>
        </div>
        <div className="b-wk-days">
          {weekDays(c.anchor).map((d, idx) => {
            const evs = c.days.get(d) || [];
            return (
              <div key={d} className={`b-wd${d === c.today ? ' is-today' : ''}${d === c.selected ? ' is-sel' : ''}${evs.length ? '' : ' is-empty'}`}>
                <button type="button" className="b-wd-h" onClick={() => c.pick(d)} aria-label={`${wdDayMon(d)}, ${evs.length || 'no'} event${evs.length === 1 ? '' : 's'}`}>
                  <span>{DOW[idx]}</span><b className="disp num">{dayNum(d)}</b>
                </button>
                <div className="b-wd-evs">
                  {evs.map((e, j) => (
                    <Link key={j} href={ipo(e).href} className={`b-ev k-${e.k}`}>
                      <em>{KIND_LABEL[e.k]}</em>
                      <span>{ipo(e).name}</span>
                    </Link>
                  ))}
                  {evs.length ? null : <span className="b-wd-none">Nothing</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="b-calg">
        <section className="b-tile" aria-labelledby="mm-h">
          <div className="b-wk-h">
            <h2 id="mm-h" className="b-h3 disp">{monthLabel(ym)}</h2>
            <div className="b-wk-nav">
              <button type="button" className="b-rnd b-rnd-sm" onClick={() => c.pick(monthPrev)} disabled={monthPrev < monthStart(ymOf(model.from))} aria-label="Previous month"><Chev flip /></button>
              <button type="button" className="b-rnd b-rnd-sm" onClick={() => c.pick(monthNext)} disabled={monthNext > model.to} aria-label="Next month"><Chev /></button>
            </div>
          </div>
          <div className="b-mm" role="grid" aria-label={monthLabel(ym)}>
            {DOW.map((d) => <span key={d} className="b-mm-dow" aria-hidden="true">{d.slice(0, 1)}</span>)}
            {monthGrid(ym).flat().map((d) => {
              const evs = c.days.get(d) || [];
              const kinds = Array.from(new Set(evs.map((e) => e.k)));
              return (
                <button key={d} type="button" className={`b-mm-d num${ymOf(d) !== ym ? ' is-out' : ''}${d === c.today ? ' is-today' : ''}${d === c.selected ? ' is-sel' : ''}`} onClick={() => c.pick(d)} aria-label={`${wdDayMon(d)}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}`}>
                  {dayNum(d)}
                  <span className="b-mm-dots" aria-hidden="true">{kinds.map((k) => <i key={k} className={`k-${k}`} />)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="b-tile" aria-labelledby="sd-h">
          <h2 id="sd-h" className="b-h3 disp">{c.selected === c.today ? 'Today' : wdDayMon(c.selected)}</h2>
          <p className="b-k" style={{ marginTop: 4 }}>{c.onDay.length ? `${c.onDay.length} event${c.onDay.length > 1 ? 's' : ''}` : 'No IPO events on this day'}</p>
          <div className="b-sd">
            {c.onDay.map((e, j) => (
              <Link key={j} href={ipo(e).href} className="b-sd-row">
                <Logo ipo={ipo(e)} size="sm" />
                <span className="b-sd-t"><b>{ipo(e).name}</b><span>{ipo(e).board} · {ipo(e).band}</span></span>
                <span className={`b-kchip k-${e.k}`}>{KIND_LABEL[e.k]}</span>
              </Link>
            ))}
          </div>
          {!c.onDay.length && nextDay ? <button type="button" className="b-btn b-btn-s b-sd-next" onClick={() => c.pick(nextDay)}>Next event: {wdDayMon(nextDay)} <Arrow /></button> : null}
        </section>

        <section className="b-tile b-next" aria-labelledby="nx-h">
          <h2 id="nx-h" className="b-h3 disp">Coming up</h2>
          {next.length ? (
            <ol className="b-nx">
              {next.map((e, j) => (
                <li key={j}>
                  <Link href={ipo(e).href}>
                    <span className="b-nx-d num"><b className="disp">{dayNum(e.d)}</b>{wdDayMon(e.d).split(' ')[2]}</span>
                    <span className="b-sd-t"><b>{ipo(e).name}</b><span className={`b-nx-k k-${e.k}`}>{KIND_LABEL[e.k]}</span></span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className="b-k" style={{ marginTop: 10 }}>Nothing scheduled yet. New issues appear here as soon as their dates are announced.</p>}
        </section>
      </div>
    </div>
  );
}
