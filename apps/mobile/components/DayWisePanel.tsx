/**
 * Day-wise subscription on a phone.
 *
 * Mobile had a TOTAL-ONLY SPARKLINE: one line for the whole issue, no
 * categories and no hours, against web's six-column table with an hourly
 * drill-down. The figures were all there; nothing drew them.
 *
 * STACKED BLOCKS, NOT A TABLE, and that is the whole design decision. Six
 * columns of multiples cannot be read at 375px — web's own Share-wise table
 * stacks into one block per category below 480px for exactly this reason. So a
 * day is a card: the day number and total on one line, its categories beneath
 * in a two-column grid, and the hourly snapshots behind a tap.
 *
 * The derivation is `dayWiseRows` in shared-types — day numbering, newest-first
 * ordering and the hourly grouping — so a phone cannot number a bidding day
 * differently from the browser. Verified against web's previous inline code
 * across every record that has a log: 82 rows, 0 differences.
 */
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DAY_WISE_COLUMNS, dayValue, dayWiseRows, hasAppFigures,
  type DayEntry, type DayWiseRow, type HourEntry,
} from '@investoyard/shared-types';
import { fonts, microLabel, ui } from '../lib/theme';
import { ChevronDownIcon } from './ui/icons';

const fmtDay = (d?: string) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d ?? '—';

const tx = (v?: number | null) => (v != null ? `${v}×` : '—');

/**
 * A cell in the APPLICATIONS view — the multiple over the count received.
 * Both, because they answer different questions: the multiple says how
 * oversubscribed by applications, the count how many people actually applied.
 * A dash beside a present count is QIB, which has no application multiple.
 */
function appText(e: DayEntry, key: string): string {
  const c = e.apps?.[key];
  if (!c || (c.x == null && c.n == null)) return '—';
  const mult = c.x != null ? `${c.x}×` : '—';
  return c.n != null ? `${mult}  ${c.n.toLocaleString('en-IN')}` : mult;
}

function Figures({ e, shown }: { e: DayEntry; shown: 'shares' | 'apps' }) {
  return (
    <View style={s.grid}>
      {DAY_WISE_COLUMNS.filter((c) => c.key !== 'total').map((c) => (
        <View key={c.key} style={s.cell}>
          <Text style={[s.cellK, c.sub && s.cellKSub]}>{c.label}</Text>
          <Text style={s.cellV} numberOfLines={1}>
            {shown === 'apps' ? appText(e, c.key) : tx(dayValue(e, c.key))}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DayWisePanel({
  subLog, subLogHour, closeDate,
}: {
  subLog: DayEntry[];
  subLogHour: HourEntry[];
  /** The row carrying this date is flagged as the last bidding day. */
  closeDate?: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [view, setView] = useState<'shares' | 'apps'>('shares');

  const rows: DayWiseRow[] = dayWiseRows(subLog, subLogHour, closeDate);
  /* The toggle appears only when there is something behind it. Application
     figures reach the log from 2026-10-01 and CANNOT be backfilled, so every
     issue that closed earlier has none for ever. */
  const hasApps = hasAppFigures(subLog, subLogHour);
  const shown = hasApps ? view : 'shares';
  if (!rows.length) return null;

  return (
    <View>
      {hasApps ? (
        <View style={s.seg}>
          {([['shares', 'Share-wise'], ['apps', 'Application-wise']] as const).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setView(k)}
              style={({ pressed }) => [s.segBtn, shown === k && s.segBtnOn, pressed && { opacity: 0.8 }]}
            >
              <Text style={[s.segTxt, shown === k && s.segTxtOn]} numberOfLines={1}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {rows.map((row) => {
        const isOpen = openDay === row.d;
        const hasHourly = row.hours.length > 0;
        return (
          <View key={row.d} style={[s.day, isOpen && s.dayOpen]}>
            <Pressable
              onPress={() => {
                if (!hasHourly) return;
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpenDay(isOpen ? null : row.d);
              }}
              disabled={!hasHourly}
              accessibilityRole={hasHourly ? 'button' : undefined}
              accessibilityState={hasHourly ? { expanded: isOpen } : undefined}
              accessibilityLabel={`Day ${row.dayNo}${row.isLast ? ', last day' : ''}, ${fmtDay(row.d)}`
                + (hasHourly ? `. ${row.hours.length} hourly snapshots` : '')}
              style={({ pressed }) => [s.head, pressed && hasHourly && { opacity: 0.75 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.dayNo}>
                  Day {row.dayNo}{row.isLast ? ' (Last)' : ''}
                </Text>
                <Text style={s.dayDate}>{fmtDay(row.d)}</Text>
              </View>
              <Text style={s.dayTotal} numberOfLines={1}>
                {shown === 'apps' ? appText(row.entry, 'total') : tx(row.entry.total)}
              </Text>
              {/* Only days with hourly snapshots are expandable; the rest show
                  nothing rather than a chevron that does not move. */}
              {hasHourly ? (
                <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                  <ChevronDownIcon size={15} color={ui.muted} strokeWidth={2} />
                </View>
              ) : <View style={{ width: 15 }} />}
            </Pressable>

            <Figures e={row.entry} shown={shown} />

            {isOpen ? (
              <View style={s.hours}>
                {row.hours.map((h) => (
                  <View key={`${h.d}-${h.t}`} style={s.hour}>
                    <Text style={s.hourT}>{h.t ?? '—'}</Text>
                    <Figures e={h} shown={shown} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <Text style={s.note}>
        {rows.some((r) => r.hours.length)
          ? 'Tap a day for its hourly snapshots.'
          : 'Hourly snapshots are kept for three days — this issue has none left.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: ui.slateTint, borderRadius: 11, padding: 3, marginBottom: 12 },
  segBtn: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: '#ffffff' },
  segTxt: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  segTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },

  day: { borderTopWidth: 1, borderTopColor: ui.divider, paddingTop: 12, marginTop: 12 },
  dayOpen: { backgroundColor: ui.canvas, borderRadius: 12, paddingHorizontal: 10, marginHorizontal: -10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayNo: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  dayDate: { fontSize: 11.5, fontFamily: fonts.regular, color: ui.muted, marginTop: 1 },
  dayTotal: { fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },

  /* Two columns rather than five across: four categories at 375px leaves ~80px
     each, which a multiple and its label do not fit into side by side. */
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  cell: { width: '50%', paddingVertical: 5, paddingRight: 8 },
  cellK: { ...microLabel, fontSize: 10 },
  /* The two HNI bands are sub-rows of the NII quota, indented as they are in
     the table on web rather than reading as two more peers. */
  cellKSub: { paddingLeft: 9 },
  cellV: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, marginTop: 2, fontVariant: ['tabular-nums'] },

  hours: { marginTop: 8, borderTopWidth: 1, borderTopColor: ui.divider, paddingTop: 4 },
  hour: { paddingVertical: 6 },
  hourT: { ...microLabel, fontSize: 10, color: ui.indigo },

  note: { fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 15, color: ui.muted, marginTop: 14 },
});
