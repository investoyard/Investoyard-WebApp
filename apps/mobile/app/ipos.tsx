import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { compareForList } from '@investoyard/shared-types';
import { getIposResult } from '../lib/api';
import type { IpoFull } from '../lib/ipoCalc';
import { fmtDate, titleCase } from '../lib/format';
import { fonts, ui } from '../lib/theme';
import { tapLight } from '../lib/haptics';
import { CompactRow } from '../components/ui/CompactRow';
import { EmptyState } from '../components/ui/EmptyState';
import { OfflineState } from '../components/ui/OfflineState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { SearchIcon, XIcon } from '../components/ui/icons';

/**
 * Browse every IPO — the screen the home page's "Browse all" link needed.
 *
 * The home screen deliberately shows a FIXED 16, the most actionable issues
 * rather than the most recent, so there has to be somewhere to see the rest.
 * Web has had /ipos/archive for months; mobile had nowhere at all, which is
 * why the home list was previously unbounded and rendered the entire
 * catalogue in one scroll.
 *
 * FLATLIST, NOT ScrollView + map. Every other list in this app maps over its
 * data inside a ScrollView, which is fine for the handful of rows those
 * screens show. This one is fed 1,314 records — the whole visible catalogue
 * since the API's 500-row default was lifted — and mounting that many rows at
 * once is exactly the stutter virtualisation exists to prevent.
 *
 * Deliberately NOT web's year + month filters: once you can search by name or
 * symbol, a month picker is three more controls on a phone for a case search
 * already covers. Year was offered and declined.
 */
type Board = 'all' | 'mainboard' | 'sme';
const BOARDS: { key: Board; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mainboard', label: 'Mainboard' },
  { key: 'sme', label: 'SME' },
];

export default function AllIposScreen() {
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  /* distinct from `null` (still loading) and from an empty list. */
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<Board>('all');
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

  /* Sorted and filtered in a memo: this runs over 1,314 records and must not
     redo itself on every keystroke's re-render. */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = ipos ?? [];
    const onBoard = board === 'all' ? all : all.filter((i) => i.type === board);
    const matched = q
      ? onBoard.filter((i) => i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q))
      : onBoard;
    /* Same comparator the home screen and the web list use, so "most
       actionable first" means the same thing on every surface. */
    return [...matched].sort(compareForList);
  }, [ipos, board, query]);

  /* The one figure worth carrying in a browsing list: when it closed, or when
     it opens if it has not yet. A listing gain would be better still, but it
     is only known for listed issues and a column that is usually blank reads
     as missing data rather than as not-applicable. */
  const when = (i: IpoFull) => {
    const d = i.listingDate ?? i.closeDate ?? i.openDate;
    const f = fmtDate(d);
    return f === '—' ? 'TBA' : f;
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
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
        <View style={styles.seg}>
          {BOARDS.map(({ key, label }) => {
            const on = board === key;
            return (
              <Pressable
                key={key}
                onPress={() => { tapLight(); setBoard(key); }}
                style={({ pressed }) => [styles.segBtn, on && styles.segBtnOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.segTxt, on && styles.segTxtOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {ipos !== null && !offline ? (
          <Text style={styles.count}>{rows.length.toLocaleString('en-IN')} {rows.length === 1 ? 'IPO' : 'IPOs'}</Text>
        ) : null}
      </View>

      {ipos === null ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonCard lines={2} /><SkeletonCard lines={2} /></View>
      ) : offline ? (
        <OfflineState onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={query.trim() ? `No IPO matches “${query.trim()}”` : 'No IPOs to show'}
          body={query.trim() ? 'Try the company name or its exchange symbol.' : undefined}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id ?? i.symbol}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
          keyboardShouldPersistTaps="handled"
          /* Virtualisation settings matter at 1,314 rows: keep the mounted
             window small so scrolling stays smooth on a mid-range phone. */
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <CompactRow
              ipo={item}
              divider={index > 0}
              right={<Text style={styles.when}>{when(item)}</Text>}
              onPress={() => router.push(`/ipo/${item.symbol}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  header: {
    backgroundColor: '#ffffff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: ui.divider, gap: 10,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: ui.canvas, borderRadius: 12, paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: ui.title, padding: 0 },
  seg: { flexDirection: 'row', backgroundColor: ui.canvas, borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 8 },
  segBtnOn: { backgroundColor: '#ffffff' },
  segTxt: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  segTxtOn: { color: ui.title, fontFamily: fonts.bold, fontWeight: '700' },
  count: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, fontVariant: ['tabular-nums'] },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  when: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, fontVariant: ['tabular-nums'] },
});
