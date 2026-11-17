'use client';

import Link from 'next/link';
import {
  CAL_KINDS, KIND_TITLE, countKinds, monthLabel, weekLabel, wdDayMon, ymOf,
  type CalEvent, type CalKind, type CalendarModel,
} from '@/core/calendar';
import { useCalendar } from '@/core/useCalendar';
import { BoardTag, Hero, Icon, Logo } from './parts';

/*
 * PRISM'S CALENDAR — the week (or month) sorted by what happens: four columns,
 * Opening · Closing · Allotment · Listing, each a stack of IPO cards in date
 * order, under the dashboard's own hero and stat strip.
 */

const TILE: Record<CalKind, { icon: 'calendar' | 'hourglass' | 'check' | 'rocket'; tone: string }> = {
  open: { icon: 'calendar', tone: 'pos' },
  close: { icon: 'hourglass', tone: 'amber' },
  allot: { icon: 'check', tone: 'ind' },
  list: { icon: 'rocket', tone: 'slate' },
};
const STAT: Record<CalKind, string> = { open: 'Opening', close: 'Closing', allot: 'Allotments', list: 'Listings' };

export default function CalendarPage({ model }: { model: CalendarModel }) {
  const c = useCalendar(model, 'week');
  const ipo = (e: CalEvent) => model.ipos[e.i];
  const counts = countKinds(c.inView);
  const period = c.mode === 'month' ? monthLabel(ymOf(c.anchor)) : weekLabel(c.anchor);
  const span = c.mode === 'month' ? 'this month' : 'this week';

  return (
    <>
      <Hero eyebrow="IPO calendar" title="Every IPO date," accent="one calendar" sub="When each issue opens and closes for bidding, when the allotment is finalised and when the shares list — mainboard and SME together." />
      <div className="p-wrap p-main">
        <dl className="p-stats">
          {CAL_KINDS.map((k) => (
            <div key={k} className="p-stat">
              <span className={`p-tile ${TILE[k].tone}`}><Icon name={TILE[k].icon} size={24} /></span>
              <div className="p-stat-t"><dd>{counts[k]}</dd><dt>{STAT[k]} {span}</dt></div>
            </div>
          ))}
        </dl>

        <section className="p-sec" aria-labelledby="cal-h">
          <div className="p-sec-h">
            <div className="p-sec-title"><Icon name="calendar" size={30} /><h2 id="cal-h">IPO calendar</h2></div>
            <div className="p-calnav">
              <button type="button" className="p-calarrow" onClick={() => c.go(-1)} disabled={!c.canPrev} aria-label={c.mode === 'month' ? 'Previous month' : 'Previous week'}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="arrow" size={18} stroke={2.2} /></span></button>
              <span className="p-calttl num" aria-live="polite">{period}</span>
              <button type="button" className="p-calarrow" onClick={() => c.go(1)} disabled={!c.canNext} aria-label={c.mode === 'month' ? 'Next month' : 'Next week'}><Icon name="arrow" size={18} stroke={2.2} /></button>
              <button type="button" className="p-btn p-btn-q p-btn-sm" onClick={c.goToday}>Today</button>
            </div>
            <div className="p-tools">
              <div className="p-view" role="group" aria-label="Range">
                <button type="button" aria-pressed={c.mode === 'week'} onClick={() => c.setMode('week')}>Week</button>
                <button type="button" aria-pressed={c.mode === 'month'} onClick={() => c.setMode('month')}>Month</button>
              </div>
              <select className="p-select" aria-label="Board" value={c.board} onChange={(e) => c.setBoard(e.target.value as typeof c.board)}>
                <option value="all">All boards</option><option value="Mainboard">Mainboard</option><option value="SME">SME</option>
              </select>
            </div>
          </div>

          <div className="p-calcols">
            {CAL_KINDS.map((k) => {
              const list = c.inView.filter((e) => e.k === k);
              return (
                <section key={k} className={`p-card p-calcol k-${k}`} aria-labelledby={`col-${k}`}>
                  <div className="p-calcol-h">
                    <span className={`p-tile ${TILE[k].tone}`}><Icon name={TILE[k].icon} size={20} /></span>
                    <h3 id={`col-${k}`}>{KIND_TITLE[k]}</h3>
                    <span className="p-calcol-n num">{list.length}</span>
                  </div>
                  {list.length ? (
                    <ul className="p-calcol-list">
                      {list.map((e, j) => {
                        const x = ipo(e);
                        return (
                          <li key={j}>
                            <Link href={x.href} className="p-calev">
                              <span className={`p-calev-d num${e.d === c.today ? ' is-today' : ''}`}>{e.d === c.today ? 'Today' : wdDayMon(e.d)}</span>
                              <span className="p-calev-id"><Logo ipo={x} /><span><b>{x.name}</b><BoardTag board={x.board} /></span></span>
                              <span className="p-calev-f"><span>Price band</span><b className="num">{x.band}</b></span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="p-calcol-none">Nothing {span}.</p>}
                </section>
              );
            })}
          </div>

          <div className="p-more">
            <span className="p-muted">Dates as published for each issue. Older IPOs are in the archive.</span>
            <Link className="p-link" href="/ipos/">Browse every past IPO <Icon name="arrow" size={16} /></Link>
          </div>
        </section>
      </div>
    </>
  );
}
