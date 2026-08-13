'use client';
/**
 * IPO Calendar — Month | Week views (web twin of the mobile calendar):
 *   Month: grid with event dots per date → the selected day's events beside it.
 *   Week:  7-day strip (‹ › moves weeks) → the whole week's events grouped by day.
 * Dots: green=opens · amber=closes · indigo=allotment · grey=listing.
 */
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';

type Tone = 'open' | 'close' | 'allot' | 'list';
interface Ev { date: string; label: string; tone: Tone; ipo: IpoFull }

const EVENTS: { field: 'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate'; label: string; tone: Tone }[] = [
  { field: 'openDate', label: 'Opens', tone: 'open' },
  { field: 'closeDate', label: 'Closes', tone: 'close' },
  { field: 'allotmentDate', label: 'Allotment', tone: 'allot' },
  { field: 'listingDate', label: 'Listing', tone: 'list' },
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (day: string) => { const d = new Date(`${day}T00:00:00`); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
const prettyDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
const shortDM = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function IpoCalendar() {
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso()));
  const [selected, setSelected] = useState(todayIso());

  useEffect(() => { getIpos().then((list) => setIpos(list as IpoFull[])); }, []);

  // every event of every IPO, keyed by date
  const byDate = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const ipo of ipos ?? []) {
      for (const { field, label, tone } of EVENTS) {
        const date = ipo[field];
        if (!date) continue;
        const list = map.get(date) ?? [];
        list.push({ date, label, tone, ipo });
        map.set(date, list);
      }
    }
    return map;
  }, [ipos]);

  // month grid: weeks of 7 cells (Mon-start); null = out-of-month filler
  const weeks = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
    const cells: (string | null)[] = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(year, month, i + 1))),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [anchor]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const monthLabel = anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const weekLabel = `${shortDM(weekDays[0])} – ${shortDM(weekDays[6])}`;
  const moveMonth = (delta: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  const moveWeek = (delta: number) => setWeekStart((ws) => addDays(ws, delta * 7));
  const switchView = (v: 'month' | 'week') => {
    if (v === view) return;
    if (v === 'week') setWeekStart(mondayOf(selected)); // keep the user's context
    setView(v);
  };

  const today = todayIso();
  const dayEvents = byDate.get(selected) ?? [];
  const weekEventDays = weekDays.filter((d) => (byDate.get(d) ?? []).length > 0);

  const DayCell = ({ day, showWeekday }: { day: string; showWeekday?: boolean }) => {
    const evs = byDate.get(day) ?? [];
    const isSel = day === selected;
    const isToday = day === today;
    const tones = [...new Set(evs.map((e) => e.tone))].slice(0, 4);
    return (
      <button type="button" className="cal-cell" onClick={() => setSelected(day)} aria-label={prettyDay(day)}>
        {showWeekday ? <span className="cal-cell-wd">{WEEKDAYS[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]}</span> : null}
        <span className={`cal-daynum ${isSel ? 'sel' : isToday ? 'today' : ''}`}>{Number(day.slice(8))}</span>
        <span className="cal-dots">
          {tones.map((t) => <i key={t} className={`cal-dot d-${t}`} />)}
        </span>
      </button>
    );
  };

  const EventRow = ({ e }: { e: Ev }) => (
    <a className="cal-evrow" href={`/ipos/${e.ipo.symbol}`}>
      <IpoLogo logo={e.ipo.logo} name={e.ipo.name} size={36} />
      <span className="grow">
        <span className="cal-ev-name" title={e.ipo.name}>{e.ipo.name}</span>
        <span className="cal-ev-sym">{e.ipo.symbol} · {e.ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
      </span>
      <span className={`cal-ev-tag t-${e.tone}`}>{e.label}</span>
    </a>
  );

  return (
    <div className="container cal-page">
      <div className="cal-head">
        <h1>IPO Calendar</h1>
        <div className="cal-seg" role="tablist" aria-label="Calendar view">
          {(['month', 'week'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={`cal-seg-btn ${view === v ? 'on' : ''}`} onClick={() => switchView(v)}>
              {v === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-wrap">
        {/* calendar card */}
        <div className="panel cal-card">
          <div className="cal-nav">
            <button type="button" className="cal-nav-btn" aria-label="Previous" onClick={() => (view === 'month' ? moveMonth(-1) : moveWeek(-1))}>
              <Icon name="chevron-left" size={16} />
            </button>
            <span className="cal-nav-label">{view === 'month' ? monthLabel : weekLabel}</span>
            <button type="button" className="cal-nav-btn" aria-label="Next" onClick={() => (view === 'month' ? moveMonth(1) : moveWeek(1))}>
              <Icon name="chevron-right" size={16} />
            </button>
          </div>

          {view === 'month' ? (
            <>
              <div className="cal-row cal-wds">
                {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{w}</span>)}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="cal-row">
                  {week.map((day, di) => (day ? <DayCell key={di} day={day} /> : <span key={di} className="cal-cell" />))}
                </div>
              ))}
            </>
          ) : (
            <div className="cal-row">
              {weekDays.map((day) => <DayCell key={day} day={day} showWeekday />)}
            </div>
          )}

          <div className="cal-legend">
            {EVENTS.map((e) => (
              <span key={e.label} className="cal-legend-item"><i className={`cal-dot d-${e.tone}`} />{e.label}</span>
            ))}
          </div>
        </div>

        {/* events beside (desktop) / below (mobile) */}
        <div className="cal-detail">
          {ipos === null ? (
            <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>Loading…</p>
          ) : view === 'month' ? (
            <>
              <div className="cal-dayhead">{selected === today ? `Today · ${prettyDay(selected)}` : prettyDay(selected)}</div>
              {dayEvents.length === 0 ? (
                <div className="panel cal-empty">No IPO events on this day — pick a date with dots.</div>
              ) : (
                <div className="panel cal-list">
                  {dayEvents.map((e) => <EventRow key={`${e.ipo.id}-${e.label}`} e={e} />)}
                </div>
              )}
            </>
          ) : weekEventDays.length === 0 ? (
            <>
              <div className="cal-dayhead">This week</div>
              <div className="panel cal-empty">No IPO events this week — use ‹ › to browse other weeks.</div>
            </>
          ) : (
            weekEventDays.map((day) => (
              <div key={day}>
                <div className={`cal-dayhead ${day === today ? 'today' : ''}`}>
                  {day === today ? `Today · ${prettyDay(day)}` : prettyDay(day)}
                </div>
                <div className="panel cal-list">
                  {(byDate.get(day) ?? []).map((e) => <EventRow key={`${e.ipo.id}-${e.label}`} e={e} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
