/**
 * IPO Calendar — Month | Week views:
 *   Month: grid with event dots per date → tap a date for its detail below.
 *   Week:  7-day strip (‹ › moves weeks) → the WHOLE week's events grouped by
 *          day below, for one-glance scanning.
 * Dots: green=opens · amber=closes · indigo=allotment · grey=listing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { fonts, animateNext, microLabel, shadowCard, ui } from '../lib/theme';
import { getIpos } from '../lib/api';
import type { IpoFull } from '../lib/ipoCalc';
import { tapSelect } from '../lib/haptics';
import { CompanyLogo } from '../components/ui/CompanyLogo';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Chip, ChipTone } from '../components/ui/Chip';
import { ChevronRightIcon } from '../components/ui/icons';

interface Ev { date: string; label: string; tone: ChipTone; dot: string; ipo: IpoFull }

const EVENTS: { field: 'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate'; label: string; tone: ChipTone; dot: string }[] = [
  { field: 'openDate', label: 'Opens', tone: 'success', dot: '#2E9E5B' },
  { field: 'closeDate', label: 'Closes', tone: 'warn', dot: '#E3A63C' },
  { field: 'allotmentDate', label: 'Allotment', tone: 'brand', dot: '#6A5ACD' },
  { field: 'listingDate', label: 'Listing', tone: 'neutral', dot: '#9BA1B0' },
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (day: string) => { const d = new Date(`${day}T00:00:00`); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
const prettyDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
const shortDM = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function CalendarScreen() {
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso()));
  const [selected, setSelected] = useState(todayIso());

  const load = useCallback(async () => { setIpos(await getIpos()); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // every event of every IPO, keyed by date
  const byDate = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const ipo of ipos ?? []) {
      for (const { field, label, tone, dot } of EVENTS) {
        const date = ipo[field];
        if (!date) continue;
        const list = map.get(date) ?? [];
        list.push({ date, label, tone, dot, ipo });
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
  const moveMonth = (delta: number) => {
    tapSelect(); animateNext();
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  };
  const moveWeek = (delta: number) => {
    tapSelect(); animateNext();
    setWeekStart((ws) => addDays(ws, delta * 7));
  };
  const switchView = (v: 'month' | 'week') => {
    if (v === view) return;
    tapSelect(); animateNext();
    // keep the user's context when switching
    if (v === 'week') setWeekStart(mondayOf(selected));
    setView(v);
  };

  const today = todayIso();
  const dayEvents = byDate.get(selected) ?? [];
  const weekEventDays = weekDays.filter((d) => (byDate.get(d) ?? []).length > 0);

  const DayCell = ({ day, showWeekday }: { day: string; showWeekday?: boolean }) => {
    const evs = byDate.get(day) ?? [];
    const isSel = day === selected;
    const isToday = day === today;
    const dots = [...new Set(evs.map((e) => e.dot))].slice(0, 4);
    return (
      <Pressable onPress={() => { tapSelect(); setSelected(day); }} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
        {showWeekday ? <Text style={styles.cellWeekday}>{WEEKDAYS[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]}</Text> : null}
        <View style={[styles.dayCircle, isSel && styles.dayCircleSel, !isSel && isToday && styles.dayCircleToday]}>
          <Text style={[styles.dayTxt, isSel && styles.dayTxtSel, !isSel && isToday && { color: ui.indigo }]}>
            {Number(day.slice(8))}
          </Text>
        </View>
        <View style={styles.dots}>
          {dots.map((c) => <View key={c} style={[styles.dot, { backgroundColor: c }]} />)}
        </View>
      </Pressable>
    );
  };

  const EventRow = ({ e, divider }: { e: Ev; divider: boolean }) => (
    <Pressable
      onPress={() => router.push(`/ipo/${e.ipo.symbol}`)}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      <CompanyLogo uri={e.ipo.logoUrl} name={e.ipo.name} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{e.ipo.name}</Text>
        <Text style={styles.sym} numberOfLines={1}>{e.ipo.symbol} · {e.ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
      </View>
      <Chip label={e.label} tone={e.tone} dot={false} />
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      {/* compact Month | Week pill lives in the navigation header (right side) */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.viewSeg}>
              {(['month', 'week'] as const).map((v) => {
                const on = view === v;
                return (
                  <Pressable key={v} onPress={() => switchView(v)} style={({ pressed }) => [styles.viewBtn, on && styles.viewBtnOn, pressed && { opacity: 0.8 }]}>
                    <Text style={[styles.viewTxt, on && styles.viewTxtOn]}>{v === 'month' ? 'Month' : 'Week'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ),
        }}
      />
      <View style={styles.calCard}>
        {/* period header */}
        <View style={styles.monthRow}>
          <Pressable onPress={() => (view === 'month' ? moveMonth(-1) : moveWeek(-1))} hitSlop={8} style={({ pressed }) => [styles.monthBtn, pressed && { opacity: 0.6 }]}>
            <View style={{ transform: [{ rotate: '180deg' }] }}><ChevronRightIcon size={16} color={ui.indigo} strokeWidth={2.2} /></View>
          </Pressable>
          <Text style={styles.monthTxt}>{view === 'month' ? monthLabel : weekLabel}</Text>
          <Pressable onPress={() => (view === 'month' ? moveMonth(1) : moveWeek(1))} hitSlop={8} style={({ pressed }) => [styles.monthBtn, pressed && { opacity: 0.6 }]}>
            <ChevronRightIcon size={16} color={ui.indigo} strokeWidth={2.2} />
          </Pressable>
        </View>

        {view === 'month' ? (
          <>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => (day ? <DayCell key={di} day={day} /> : <View key={di} style={styles.cell} />))}
              </View>
            ))}
          </>
        ) : (
          <View style={styles.weekRow}>
            {weekDays.map((day) => <DayCell key={day} day={day} showWeekday />)}
          </View>
        )}

        {/* legend */}
        <View style={styles.legend}>
          {EVENTS.map((e) => (
            <View key={e.label} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: e.dot }]} />
              <Text style={styles.legendTxt}>{e.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── below the card ── */}
      {ipos === null ? (
        <View style={{ marginTop: 20 }}><SkeletonCard lines={2} /></View>
      ) : view === 'month' ? (
        /* MONTH: selected-day detail */
        <>
          <Text style={styles.dayHead}>{selected === today ? `Today · ${prettyDay(selected)}` : prettyDay(selected)}</Text>
          {dayEvents.length === 0 ? (
            <View style={styles.emptyDay}><Text style={styles.emptyTxt}>No IPO events on this day — tap a date with dots.</Text></View>
          ) : (
            <View style={styles.listCard}>
              {dayEvents.map((e, i) => <EventRow key={`${e.ipo.id}-${e.label}`} e={e} divider={i > 0} />)}
            </View>
          )}
        </>
      ) : (
        /* WEEK: the whole week's events, grouped by day */
        weekEventDays.length === 0 ? (
          <>
            <Text style={styles.dayHead}>This week</Text>
            <View style={styles.emptyDay}><Text style={styles.emptyTxt}>No IPO events this week — try ‹ › to browse other weeks.</Text></View>
          </>
        ) : (
          weekEventDays.map((day) => (
            <View key={day}>
              <Text style={[styles.dayHead, day === today && { color: ui.indigo }]}>
                {day === today ? `Today · ${prettyDay(day)}` : prettyDay(day)}
              </Text>
              <View style={styles.listCard}>
                {(byDate.get(day) ?? []).map((e, i) => <EventRow key={`${e.ipo.id}-${e.label}`} e={e} divider={i > 0} />)}
              </View>
            </View>
          ))
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  calCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 12, ...shadowCard },
  // compact header pill (sits right of the "IPO Calendar" title)
  viewSeg: {
    flexDirection: 'row', backgroundColor: ui.canvas, borderRadius: 999, padding: 2.5,
  },
  viewBtn: { height: 26, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  viewBtnOn: { backgroundColor: '#ffffff', ...shadowCard, elevation: 2 },
  viewTxt: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  viewTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  monthBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: ui.indigoTint, alignItems: 'center', justifyContent: 'center' },
  monthTxt: { fontSize: 15.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.3 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...microLabel, fontSize: 10, marginVertical: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 44 },
  cellWeekday: { ...microLabel, fontSize: 9.5, marginBottom: 4 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayCircleSel: { backgroundColor: ui.indigo },
  dayCircleToday: { borderWidth: 1.5, borderColor: ui.indigo },
  dayTxt: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, fontVariant: ['tabular-nums'] },
  dayTxtSel: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: ui.divider },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendTxt: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  dayHead: { ...microLabel, marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  emptyDay: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20, alignItems: 'center', ...shadowCard },
  emptyTxt: { fontFamily: fonts.regular, fontSize: 13, color: ui.muted, textAlign: 'center' },
  listCard: { backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, ...shadowCard },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  name: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  sym: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
});
