/**
 * IPO Calendar — competitor-grade month view: a calendar grid on top (event
 * dots per date: green=opens · amber=closes · indigo=allotment · grey=listing),
 * tap a date → that day's IPO events listed below. Defaults to today.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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

export default function CalendarScreen() {
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
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

  const monthLabel = anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const moveMonth = (delta: number) => {
    tapSelect();
    animateNext();
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  };
  const today = todayIso();
  const dayEvents = byDate.get(selected) ?? [];
  const prettySelected = new Date(`${selected}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      {/* ── month grid ── */}
      <View style={styles.calCard}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => moveMonth(-1)} hitSlop={8} style={({ pressed }) => [styles.monthBtn, pressed && { opacity: 0.6 }]}>
            <View style={{ transform: [{ rotate: '180deg' }] }}><ChevronRightIcon size={16} color={ui.indigo} strokeWidth={2.2} /></View>
          </Pressable>
          <Text style={styles.monthTxt}>{monthLabel}</Text>
          <Pressable onPress={() => moveMonth(1)} hitSlop={8} style={({ pressed }) => [styles.monthBtn, pressed && { opacity: 0.6 }]}>
            <ChevronRightIcon size={16} color={ui.indigo} strokeWidth={2.2} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              if (!day) return <View key={di} style={styles.cell} />;
              const evs = byDate.get(day) ?? [];
              const isSel = day === selected;
              const isToday = day === today;
              const dots = [...new Set(evs.map((e) => e.dot))].slice(0, 4);
              return (
                <Pressable
                  key={di}
                  onPress={() => { tapSelect(); setSelected(day); }}
                  style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
                >
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
            })}
          </View>
        ))}
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

      {/* ── selected-day detail ── */}
      <Text style={styles.dayHead}>{selected === today ? `Today · ${prettySelected}` : prettySelected}</Text>
      {ipos === null ? (
        <SkeletonCard lines={2} />
      ) : dayEvents.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyTxt}>No IPO events on this day — tap a date with dots.</Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {dayEvents.map((e, i) => (
            <Pressable
              key={`${e.ipo.id}-${e.label}`}
              onPress={() => router.push(`/ipo/${e.ipo.symbol}`)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && { opacity: 0.7 }]}
            >
              <CompanyLogo uri={e.ipo.logoUrl} name={e.ipo.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{e.ipo.name}</Text>
                <Text style={styles.sym} numberOfLines={1}>{e.ipo.symbol} · {e.ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
              </View>
              <Chip label={e.label} tone={e.tone} dot={false} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  calCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 12, ...shadowCard },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  monthBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: ui.indigoTint, alignItems: 'center', justifyContent: 'center' },
  monthTxt: { fontSize: 15.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.3 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...microLabel, fontSize: 10, marginVertical: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 44 },
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
