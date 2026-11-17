'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as st from '@investoyard/shared-types';
import {
  addDays, addMonths, byDay, monthEnd, monthStart, weekStart, ymOf,
  type CalEvent, type CalKind, type CalendarModel,
} from './calendar';

export type CalMode = 'month' | 'week';

/*
 * The state every calendar page shares: which period is showing, which day is
 * picked, which kinds and board are on. Each variant draws it its own way.
 *
 * TODAY IS THE BUILD DAY ON THE FIRST RENDER and the reader's IST day after
 * mount. A date computed during render differs between the export and the
 * browser, and React answers that by discarding the server tree.
 */
export function useCalendar(model: CalendarModel, initialMode: CalMode = 'month') {
  const [today, setToday] = useState(model.asOf);
  const [mode, setModeState] = useState<CalMode>(initialMode);
  const [anchor, setAnchor] = useState(model.asOf);
  const [selected, setSelected] = useState(model.asOf);
  const [kinds, setKinds] = useState<Set<CalKind>>(() => new Set<CalKind>(['open', 'close', 'allot', 'list']));
  const [board, setBoard] = useState<'all' | 'Mainboard' | 'SME'>('all');
  const moved = useRef(false);

  useEffect(() => {
    const t = st.istToday();
    setToday(t);
    if (!moved.current && t !== model.asOf && t >= model.from && t <= model.to) { setAnchor(t); setSelected(t); }
  }, [model.asOf, model.from, model.to]);

  const events = useMemo<CalEvent[]>(
    () => model.events.filter((e) => kinds.has(e.k) && (board === 'all' || model.ipos[e.i].board === board)),
    [model, kinds, board],
  );
  const days = useMemo(() => byDay(events), [events]);

  const start = mode === 'month' ? monthStart(ymOf(anchor)) : weekStart(anchor);
  const end = mode === 'month' ? monthEnd(ymOf(anchor)) : addDays(start, 6);
  const step = (n: number) => (mode === 'month' ? `${addMonths(ymOf(anchor), n)}-01` : addDays(start, 7 * n));
  const canPrev = addDays(start, -1) >= model.from;
  const canNext = step(1) <= model.to;

  const go = (n: number) => {
    if ((n < 0 && !canPrev) || (n > 0 && !canNext)) return;
    moved.current = true;
    const a = step(n);
    setAnchor(a);
    setSelected(a);
  };
  const goToday = () => { moved.current = true; setAnchor(today); setSelected(today); };
  const pick = (d: string) => { moved.current = true; setSelected(d); if (d < start || d > end) setAnchor(d); };
  const toggleKind = (k: CalKind) => setKinds((s) => {
    const n = new Set(s);
    if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k);
    return n;
  });
  const setMode = (m: CalMode) => { moved.current = true; setModeState(m); setAnchor(selected); };
  const inView = events.filter((e) => e.d >= start && e.d <= end);

  return {
    today, mode, setMode, anchor, start, end, selected, pick, go, goToday, canPrev, canNext,
    kinds, toggleKind, board, setBoard, events, days, inView,
    onDay: days.get(selected) || [],
  };
}

export type Cal = ReturnType<typeof useCalendar>;
