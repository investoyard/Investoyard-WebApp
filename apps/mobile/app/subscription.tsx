/**
 * Subscription — live category-wise demand for open issues (+ the last week's
 * closed ones), with plain-language demand words calibrated per board.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../lib/theme';
import { type IpoFull } from '../lib/ipoCalc';
import * as calc from '../lib/ipoCalc';
import { istToday, orderShareRows, shareWiseLabel, subCatLabel } from '@investoyard/shared-types';
import { getIposResult } from '../lib/api';
import { OfflineState } from '../components/ui/OfflineState';
import { titleCase } from '../lib/format';
import { demandWord } from '../lib/ipoStage';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { CompanyLogo } from '../components/ui/CompanyLogo';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { SearchIcon, XIcon } from '../components/ui/icons';
import { tapLight } from '../lib/haptics';

/*
 * There is no label map here any more, and that is the point. The one that
 * was here carried six keys and the catalogue uses more: `hni`, `hni2` and
 * `policyholder` all fell through to `.toUpperCase()`, so 37 records read
 * "HNI", "HNI2" and "POLICYHOLDER" on this screen against "HNI (10L+)",
 * "HNI (2-10L)" and "Policyholder" everywhere else. It was the FOURTH
 * hand-written copy of a mapping `subCatLabel` already owns.
 */

function SubCard({ ipo }: { ipo: IpoFull }) {
  const router = useRouter();
  /* THE SAME TABLE THE DETAIL PAGE RENDERS. Until 2026-10-23 this card read
     the raw rows, which carry the times the poller STORED (demand / GROSS
     offered) while `subscriptionTable` recomputes against the NET book with
     the anchor deducted — so one tap moved JPL’s QIB from 14.82x to 36.74x
     with nothing to explain it, on 59 rows across the catalogue. */
  const table = calc.subscriptionTable(ipo);
  /* The 11 records `subscriptionTable` cannot resolve have no reservation
     table at all (historical imports; none currently open). They keep the raw
     rows, which is what they show today — a fallback firing only where there
     is no better answer, rather than one competing with a better answer. */
  const rows = table
    ? orderShareRows(table.rows).map((r) => ({ key: r.key, cat: shareWiseLabel(r, table.anchorDeducted), times: r.times }))
    : (ipo.subscription ?? []).filter((r) => r.category !== 'total')
        .map((r) => ({ key: r.category, cat: subCatLabel(r.category), times: r.timesSubscribed }));
  const total = table?.total.times
    ?? ipo.subscriptionTimes ?? (ipo.subscription ?? []).find((r) => r.category === 'total')?.timesSubscribed;
  const maxX = Math.max(1, ...rows.map((r) => r.times));
  return (
    <Card style={{ marginTop: 10 }} onPress={() => router.push(`/ipo/${ipo.symbol}`)}>
      <View style={styles.head}>
        <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{titleCase(ipo.name)}</Text>
          <Text style={styles.meta} numberOfLines={1}>{ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
        </View>
        {total != null ? (
          <View style={styles.totalBox}>
            <Text style={styles.totalV}>{total}×</Text>
            <Text style={styles.totalK}>{demandWord(total, ipo.type === 'sme')}</Text>
          </View>
        ) : null}
      </View>
      {rows.length > 0 ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          {rows.map((r) => (
            <View key={r.key} style={styles.catRow}>
              <Text style={styles.catK} numberOfLines={1}>{r.cat}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, Math.min(100, (r.times / maxX) * 100))}%` }]} />
              </View>
              <Text style={styles.catV}>{r.times}×</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedTxt}>Category-wise figures arrive once bidding opens.</Text>
      )}
    </Card>
  );
}

export default function SubscriptionScreen() {
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  /* distinct from `null` (still loading) and from an empty list. */
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SubFilter>('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<ComponentRef<typeof TextInput>>(null);
  const load = useCallback(async () => {
    const r = await getIposResult();
    setOffline(!r.ok);
    setIpos(r.ok ? r.ipos : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const withSub = (i: IpoFull) => (i.subscription ?? []).length > 0 || i.subscriptionTimes != null;
  const todayIso = istToday();

  const { open, recent } = useMemo(() => {
    const q = query.trim().toLowerCase();
    /* One predicate for both lists, so a filter cannot mean two things on one
       screen. 'closing' legitimately empties the closed list - an issue that
       has already closed is not closing today. */
    const passes = (i: IpoFull) => {
      if (q && !`${i.name} ${i.symbol ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'closing') return i.closeDate === todayIso;
      if (filter === 'mainboard' || filter === 'sme') return i.type === filter;
      return true;
    };
    const all = ipos ?? [];
    /* THE CLOSED SECTION IS A TIME WINDOW, NOT A COUNT (operator, 2026-10-26).
       It used to take the 8 most recently closed whatever their age, while
       this file's own docblock claimed "the last week's closed ones" - the
       comment was right and the code never implemented it. A consequence
       worth knowing: in a quiet fortnight this section now renders NOTHING,
       where the count cap always found something to show. That is correct for
       a heading that says "final subscription". */
    const cutoff = sevenDaysAgoIso();
    return {
      open: all.filter((i) => i.status === 'open' && withSub(i) && passes(i)),
      recent: all
        .filter((i) => (i.status === 'closed' || i.status === 'listed') && withSub(i)
          && (i.closeDate ?? '') >= cutoff && passes(i))
        .sort((a, b) => (b.closeDate ?? '').localeCompare(a.closeDate ?? '')),
    };
  }, [ipos, filter, query, todayIso]);

  return (
    <View style={styles.screen}>
      <View style={styles.subHead}>
        <View style={styles.searchRow}>
          <SearchIcon size={17} color={ui.muted} strokeWidth={2} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by company or symbol"
            placeholderTextColor={ui.muted}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { tapLight(); setQuery(''); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <XIcon size={16} color={ui.muted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        {/* A SCROLLING chip row, not a segmented control: four options with
            "Closing today" and "Mainboard" among them do not fit a 375px
            segment, and a clipped label is worse than a scroll. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SUB_FILTERS.map(({ key, label }) => {
            const on = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => { tapLight(); setFilter(key); }}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
      >
      {ipos === null ? (
        <><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>
      ) : offline ? (
        <OfflineState onRetry={load} />
      ) : open.length === 0 && recent.length === 0 ? (
        <EmptyState
          title={query.trim() || filter !== 'all' ? 'Nothing matches those filters' : 'No subscription data yet'}
          body={query.trim() || filter !== 'all'
            ? 'Clear the search or choose All to see every issue with live demand.'
            : 'Live category-wise demand shows here while issues are open.'}
        />
      ) : (
        <>
          {open.length > 0 ? (
            <>
              <SectionTitle label="Open now — live demand" />
              {open.map((i) => <SubCard key={i.symbol} ipo={i} />)}
            </>
          ) : null}
          {recent.length > 0 ? (
            <>
              <SectionTitle label="Closed — final subscription" style={{ marginTop: open.length ? 20 : 0 }} />
              {recent.map((i) => <SubCard key={i.symbol} ipo={i} />)}
            </>
          ) : null}
        </>
      )}
      </ScrollView>
    </View>
  );
}

type SubFilter = 'all' | 'closing' | 'mainboard' | 'sme';
const SUB_FILTERS: { key: SubFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'closing', label: 'Closing today' },
  { key: 'mainboard', label: 'Mainboard' },
  { key: 'sme', label: 'SME' },
];

/**
 * Seven days back from today, in IST.
 *
 * Both ends are UTC midnight of a plain date string, so the subtraction cannot
 * drift across a timezone boundary - parsing the IST day as +05:30 and then
 * formatting in UTC silently yields EIGHT days, which is the class of
 * off-by-one this project has already paid for once.
 */
function sevenDaysAgoIso(): string {
  const today = istToday();
  return new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subHead: {
    backgroundColor: '#ffffff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: ui.divider, gap: 10,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: ui.canvas, borderRadius: 12, paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: ui.title, padding: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 13, height: 32, borderRadius: 999, justifyContent: 'center',
    backgroundColor: ui.canvas,
  },
  chipOn: { backgroundColor: ui.indigo },
  chipTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  chipTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
  name: { fontSize: 14.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  meta: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
  totalBox: { alignItems: 'flex-end' },
  totalV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.indigo, fontVariant: ['tabular-nums'] },
  totalK: { fontSize: 10, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 1 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catK: { width: 80, fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  track: { flex: 1, height: 6, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  catV: { width: 56, textAlign: 'right', fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, fontVariant: ['tabular-nums'] },
  mutedTxt: { marginTop: 10, fontSize: 12.5, fontFamily: fonts.regular, color: ui.muted },
});
