'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  CAL_KINDS, DOW, KIND_LABEL, KIND_TITLE, countKinds, dayNum, dowOf, monthDays, monthLabel, wdDayMon, ymOf,
  type CalEvent, type CalendarModel,
} from '@/core/calendar';
import { useCalendar } from '@/core/useCalendar';
import { Arrow, RLogo } from './parts';

/*
 * HORIZON'S CALENDAR — the month as a ribbon of days across the partner's
 * colour, big numerals you swipe through; the chosen day's issues laid out
 * large on white underneath, and the month in four big numbers to close.
 */

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const c = useCalendar(model);
  const ipo = (e: CalEvent) => model.ipos[e.i];
  const ym = ymOf(c.anchor);
  const ribbon = useRef<HTMLDivElement>(null);
  const counts = countKinds(c.inView);
  const nextDay = c.events.find((e) => e.d > c.selected)?.d;

  /* Keep the chosen day in view by moving the ribbon itself; scrollIntoView would also scroll the page. */
  useEffect(() => {
    const r = ribbon.current;
    const el = r?.querySelector<HTMLElement>(`[data-day="${c.selected}"]`);
    if (!r || !el) return;
    const left = el.offsetLeft - r.clientWidth / 2 + el.clientWidth / 2;
    r.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [c.selected, ym]);

  return (
    <>
      <section className="h-on h-calband" aria-labelledby="cal-h">
        <div className="h-wrap">
          <div className="h-calband-top">
            <div>
              <p className="h-eyebrow h-soft">IPO calendar</p>
              <h1 id="cal-h" className="dsp h-calmonth num" aria-live="polite">{monthLabel(ym)}</h1>
            </div>
            <div className="h-calnav">
              <button type="button" className="h-calarrow" onClick={() => c.go(-1)} disabled={!c.canPrev} aria-label="Previous month">←</button>
              <button type="button" className="h-btn h-btn-line-on h-caltoday" onClick={c.goToday}>Today</button>
              <button type="button" className="h-calarrow" onClick={() => c.go(1)} disabled={!c.canNext} aria-label="Next month">→</button>
            </div>
          </div>
        </div>
        <div className="h-ribbon" ref={ribbon} role="group" aria-label={`Days of ${monthLabel(ym)}`}>
          {monthDays(ym).map((d) => {
            const evs = c.days.get(d) || [];
            return (
              <button key={d} type="button" data-day={d} className={`h-rday${d === c.selected ? ' is-sel' : ''}${d === c.today ? ' is-today' : ''}${evs.length ? ' has' : ''}`} onClick={() => c.pick(d)} aria-pressed={d === c.selected} aria-label={`${wdDayMon(d)}, ${evs.length || 'no'} event${evs.length === 1 ? '' : 's'}`}>
                <span className="h-rday-w">{DOW[dowOf(d)]}</span>
                <span className="dsp num h-rday-n">{dayNum(d)}</span>
                <span className="h-rday-m" aria-hidden="true">{evs.slice(0, 4).map((e, j) => <i key={j} className={`k-${e.k}`} />)}</span>
              </button>
            );
          })}
        </div>
        <div className="h-wrap h-calfilters">
          <div role="group" aria-label="Show events">
            {CAL_KINDS.map((k) => <button key={k} type="button" className={`h-chip h-chip-on h-kchip k-${k}`} aria-pressed={c.kinds.has(k)} onClick={() => c.toggleKind(k)}><i aria-hidden="true" />{KIND_LABEL[k]}</button>)}
          </div>
          <div role="group" aria-label="Board">
            {(['all', 'Mainboard', 'SME'] as const).map((b) => <button key={b} type="button" className="h-chip h-chip-on h-bchip" aria-pressed={c.board === b} onClick={() => c.setBoard(b)}>{b === 'all' ? 'All boards' : b}</button>)}
          </div>
        </div>
      </section>

      <section className="h-sec h-calday" aria-labelledby="day-h">
        <div className="h-wrap">
          <div className="h-sec-h">
            <div>
              <p className="h-kicker">{c.selected === c.today ? 'Today' : 'Selected day'}</p>
              <h2 id="day-h" className="dsp">{wdDayMon(c.selected)}</h2>
            </div>
            {c.onDay.length ? <p className="num">{c.onDay.length} event{c.onDay.length > 1 ? 's' : ''}</p> : null}
          </div>
          {c.onDay.length ? (
            <div className="h-evgrid">
              {c.onDay.map((e, j) => {
                const x = ipo(e);
                return (
                  <Link key={j} href={x.href} className={`h-evcard k-${e.k}`}>
                    <span className="h-evcard-k">{KIND_LABEL[e.k]}</span>
                    <span className="h-evcard-id"><RLogo ipo={x} /><span><b className="dsp">{x.name}</b><span>{x.board}</span></span></span>
                    <dl className="h-evcard-f">
                      <div><dt>Price band</dt><dd className="num">{x.band}</dd></div>
                      <div><dt>Bidding</dt><dd className="num">{x.dates}</dd></div>
                    </dl>
                    <span className="h-evcard-go">View the issue <Arrow /></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="h-calnone">
              <p>No IPO events on this day.</p>
              {nextDay ? <button type="button" className="h-btn h-btn-line" onClick={() => c.pick(nextDay)}>Next event: {wdDayMon(nextDay)} <Arrow /></button> : null}
            </div>
          )}
        </div>
      </section>

      <section className="h-sec h-sec-mist h-calsum" aria-labelledby="sum-h">
        <div className="h-wrap">
          <h2 id="sum-h" className="dsp h-calsum-h">{monthLabel(ym)} in numbers</h2>
          <dl className="h-calnums">
            {CAL_KINDS.map((k) => (
              <div key={k} className={`k-${k}`}><dt>{KIND_TITLE[k]}</dt><dd className="dsp num">{counts[k]}</dd></div>
            ))}
          </dl>
          <p className="h-calsum-note">Dates as published for each issue. Earlier months are in the <Link href="/ipos/" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>archive</Link>.</p>
        </div>
      </section>
    </>
  );
}
