/**
 * Home — the IPO feed, cards-first.
 *   Slim header: "Live Subscription" (left, pulses while issues are open) ·
 *   search / calendar / alerts (right). No brand block, no greeting — the
 *   first IPO card is visible the moment the app opens.
 *   → search expands inline (name or symbol) → status chips with live counts →
 *   Mainboard/SME segment → stage-driven IPO cards.
 * One-time GMP awareness dialog (compliance).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { fonts, animateNext, shadowCard, ui } from '../../lib/theme';
import { listingInfo, type IpoFull } from '../../lib/ipoCalc';
import { stageOf } from '../../lib/ipoStage';
import { getIpos, getNotifications } from '../../lib/api';
import { useAuth } from '../../components/auth';
import { fmtDate, titleCase } from '../../lib/format';
import { tapLight } from '../../lib/haptics';
import { IpoListCard } from '../../components/IpoListCard';
import { GmpDialog } from '../../components/GmpDialog';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { EmptyState } from '../../components/ui/EmptyState';
import { IllusDocs } from '../../components/ui/illustrations';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { FadeInUp } from '../../components/ui/motion';
import { BellIcon, CalendarIcon, ChevronRightIcon, SearchIcon, XIcon } from '../../components/ui/icons';

type Filter = 'all' | 'open' | 'upcoming' | 'closed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' }, // post-close phase: both closed AND listed issues
];

// Board is a SEPARATE dimension (mirrors the web explorer): status × board combine.
type Board = 'all' | 'mainboard' | 'sme';
const BOARDS: { key: Board; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mainboard', label: 'Mainboard' },
  { key: 'sme', label: 'SME' },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [board, setBoard] = useState<Board>('all');
  const [searchOn, setSearchOn] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  // light header (no gradient hero any more) → dark status-bar content
  useFocusEffect(useCallback(() => { setStatusBarStyle('dark'); }, []));

  const load = useCallback(async () => {
    const [rows, notifs] = await Promise.all([
      getIpos(),
      token ? getNotifications(token).catch(() => []) : Promise.resolve([]),
    ]);
    setIpos(rows);
    setUnread(notifs.filter((n: any) => !(n.readAt ?? n.read)).length);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      setJustRefreshed(true);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setJustRefreshed(false), 2500);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Board filter applies FIRST — sections and status filtering both respect it.
  const base = (ipos ?? []).filter((i) => board === 'all' || i.type === board);
  const q = query.trim().toLowerCase();
  const searched = q
    ? base.filter((i) => i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q))
    : base;
  const openIpos = searched.filter((i) => i.status === 'open');
  const upcoming = searched.filter((i) => i.status === 'upcoming');
  const listed = searched.filter((i) => i.status === 'listed' || i.status === 'closed');
  const filtered = filter === 'all' ? searched
    : filter === 'closed' ? searched.filter((i) => i.status === 'closed' || i.status === 'listed')
    : searched.filter((i) => i.status === filter);
  const counts: Record<Filter, number> = {
    all: searched.length, open: openIpos.length, upcoming: upcoming.length, closed: listed.length,
  };

  const shortDate = (s?: string) => { const f = fmtDate(s); return f === '—' ? 'TBA' : f.slice(0, 6); };

  // gold dot on the calendar icon when TODAY carries any IPO event
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hasTodayEvents = (ipos ?? []).some((i) =>
    i.openDate === todayIso || i.closeDate === todayIso || i.allotmentDate === todayIso || i.listingDate === todayIso);
  const liveCount = (ipos ?? []).filter((i) => i.status === 'open').length;

  const openSearch = () => {
    tapLight(); animateNext(); setSearchOn(true);
    setTimeout(() => searchRef.current?.focus(), 60);
  };
  const closeSearch = () => {
    tapLight(); animateNext(); setSearchOn(false); setQuery('');
  };

  return (
    <>
      {/* one-time GMP awareness consent (compliance) */}
      <GmpDialog />

      {/* ── slim header: Live Subscription · search / calendar / alerts ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {searchOn ? (
          <View style={styles.searchRow}>
            <SearchIcon size={17} color={ui.muted} strokeWidth={2} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search IPO by name or symbol"
              placeholderTextColor={ui.muted}
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable onPress={closeSearch} hitSlop={8} style={({ pressed }) => [styles.searchClose, pressed && { opacity: 0.6 }]}>
              <XIcon size={16} color={ui.slate} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.headRow}>
            <Pressable
              onPress={() => { tapLight(); router.push('/subscription'); }}
              accessibilityRole="button"
              accessibilityLabel="Live subscription of open IPOs"
              style={({ pressed }) => [styles.liveBtn, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
            >
              <View style={[styles.liveDot, liveCount === 0 && { backgroundColor: ui.muted }]} />
              <Text style={styles.liveTxt}>Live Subscription</Text>
              {liveCount > 0 ? <Text style={styles.liveN}>{liveCount}</Text> : null}
            </Pressable>
            <View style={styles.headIcons}>
              <Pressable onPress={openSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Search IPOs"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] }]}>
                <SearchIcon size={19} color={ui.title} strokeWidth={1.9} />
              </Pressable>
              <Pressable onPress={() => router.push('/calendar')} hitSlop={8} accessibilityRole="button" accessibilityLabel="IPO calendar"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] }]}>
                <CalendarIcon size={19} color={ui.title} strokeWidth={1.9} />
                {hasTodayEvents ? <View style={styles.todayDot} /> : null}
              </Pressable>
              <Pressable onPress={() => router.push('/notifications')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Alerts"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] }]}>
                <BellIcon size={19} color={ui.title} strokeWidth={1.9} />
                {unread > 0 ? (
                  <View style={styles.badge}><Text style={styles.badgeTxt}>{unread > 9 ? '9+' : unread}</Text></View>
                ) : null}
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: 110 /* clear the floating tab bar */ }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
        }
      >
        {/* ── status chips WITH counts (summary + filter in one control) ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map(({ key, label }) => {
            const on = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => { animateNext(); setFilter(key); }}
                style={({ pressed }) => [styles.fchip, on && styles.fchipOn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
              >
                <Text style={[styles.fchipTxt, on && styles.fchipTxtOn]}>{label}</Text>
                {ipos !== null ? (
                  <Text style={[styles.fchipN, on && styles.fchipNOn]}>{counts[key]}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {/* board segmented control — Mainboard vs SME, independent of status */}
        <View style={styles.seg}>
          {BOARDS.map(({ key, label }) => {
            const on = board === key;
            return (
              <Pressable
                key={key}
                onPress={() => { animateNext(); setBoard(key); }}
                style={({ pressed }) => [styles.segBtn, on && styles.segBtnOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.segTxt, on && styles.segTxtOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {justRefreshed ? <Text style={styles.refreshed}>Up to date ✓</Text> : null}

        {ipos === null ? (
          /* skeletons mirroring the real card anatomy */
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </View>
        ) : q ? (
          /* search results — one flat list, no sectioning */
          filtered.length === 0 ? (
            <EmptyState art={<IllusDocs />} title={`No IPO matches “${query.trim()}”`} body="Try the company name or its exchange symbol." />
          ) : (
            <>
              <SectionTitle label={`${filtered.length} result${filtered.length === 1 ? '' : 's'}`} style={styles.section} />
              {filtered.map((i, idx) => (
                <FadeInUp key={i.id} index={idx}><IpoListCard ipo={i} /></FadeInUp>
              ))}
            </>
          )
        ) : filter !== 'all' ? (
          /* filtered flat list */
          filtered.length === 0 ? (
            <EmptyState
              art={<IllusDocs />}
              title={filter === 'open' ? 'No live IPOs right now' : `No ${board === 'sme' ? 'SME ' : board === 'mainboard' ? 'Mainboard ' : ''}${filter} IPOs right now`}
              body="The next one is loading… pull down to check."
            />
          ) : (
            filtered.map((i, idx) => (
              <FadeInUp key={i.id} index={idx}>
                <IpoListCard ipo={i} />
              </FadeInUp>
            ))
          )
        ) : (
          <>
            {/* Open now — rich cards (the one gold section tick) */}
            {openIpos.length > 0 ? (
              <>
                <SectionTitle label="Open now" tick style={styles.section} />
                {openIpos.map((i, idx) => (
                  <FadeInUp key={i.id} index={idx}>
                    <IpoListCard ipo={i} />
                  </FadeInUp>
                ))}
              </>
            ) : null}

            {/* Upcoming — compact rows */}
            {upcoming.length > 0 ? (
              <FadeInUp index={openIpos.length}>
                <SectionTitle label="Opening soon" style={styles.section} />
                <View style={styles.compactCard}>
                  {upcoming.map((i, idx) => (
                    <CompactRow
                      key={i.id}
                      ipo={i}
                      right={<Text style={styles.compactMeta}>Opens {shortDate(i.openDate)}</Text>}
                      divider={idx > 0}
                      onPress={() => router.push(`/ipo/${i.symbol}`)}
                    />
                  ))}
                </View>
              </FadeInUp>
            ) : null}

            {/* Recently closed — closed (allotment phase) + listed issues, with gain when listed */}
            {listed.length > 0 ? (
              <FadeInUp index={openIpos.length + 1}>
                <SectionTitle label="Allotment & listings" style={styles.section} />
                <View style={styles.compactCard}>
                  {listed.map((i, idx) => {
                    const li = listingInfo(i);
                    const st = stageOf(i);
                    return (
                      <CompactRow
                        key={i.id}
                        ipo={i}
                        right={li ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            {li.price ? <Text style={styles.compactPrice}>₹{li.price}</Text> : null}
                            {li.gainPct != null ? (
                              <Text style={[styles.gain, { color: li.gainPct >= 0 ? ui.green : ui.red }]}>
                                {li.gainPct >= 0 ? '▲ +' : '▼ '}{li.gainPct}%
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={[styles.compactMeta, st.stage === 'allotmentout' && { color: '#8A6400' }]}>{st.label}</Text>
                        )}
                        divider={idx > 0}
                        onPress={() => router.push(`/ipo/${i.symbol}`)}
                      />
                    );
                  })}
                </View>
              </FadeInUp>
            ) : null}

            {openIpos.length === 0 && upcoming.length === 0 && listed.length === 0 ? (
              <EmptyState
                art={<IllusDocs />}
                title="No live IPOs right now"
                body="The next one is loading… pull down to check."
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function CompactRow({ ipo, right, divider, onPress }: {
  ipo: IpoFull;
  right: React.ReactNode;
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compactRow, divider && styles.compactDivider, pressed && { opacity: 0.7 }]}
    >
      <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.compactName} numberOfLines={1}>{titleCase(ipo.name)}</Text>
        <Text style={styles.compactSym} numberOfLines={1}>{ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
      </View>
      {right}
      <ChevronRightIcon size={15} color={ui.muted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  // ── slim white header (replaces the gradient hero) ──
  header: {
    backgroundColor: '#ffffff', paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: ui.divider,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: ui.canvas, borderRadius: 999, paddingLeft: 11, paddingRight: 13, height: 34,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ui.green },
  liveTxt: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, letterSpacing: -0.1 },
  liveN: {
    fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', color: '#ffffff',
    backgroundColor: ui.green, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },
  headIcons: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ffffff',
  },
  badgeTxt: { color: '#ffffff', fontSize: 9, fontFamily: fonts.extrabold, fontWeight: '800' },
  todayDot: {
    position: 'absolute', top: 4, right: 5, width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#FFCB32', borderWidth: 1.5, borderColor: '#ffffff',
  },
  // inline search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9, height: 40,
    backgroundColor: ui.canvas, borderRadius: 14, paddingHorizontal: 13,
  },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: ui.title, padding: 0 },
  searchClose: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.slateTint },
  // status chips with live counts
  filters: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  fchip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, height: 36, borderRadius: 999, backgroundColor: '#ffffff', ...shadowCard, elevation: 1,
  },
  fchipOn: { backgroundColor: ui.indigo },
  fchipTxt: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  fchipTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
  fchipN: { fontSize: 11.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.muted, fontVariant: ['tabular-nums'] },
  fchipNOn: { color: 'rgba(255,255,255,0.85)' },
  // board segment
  seg: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 14,
    backgroundColor: ui.slateTint, borderRadius: 12, padding: 3,
  },
  segBtn: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: '#ffffff', ...shadowCard, elevation: 2 },
  segTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  segTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  refreshed: { textAlign: 'center', fontSize: 12, color: ui.green, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 8 },
  section: { marginTop: 6, marginBottom: 10, paddingHorizontal: 16 },
  // compact rows (upcoming / recently closed)
  compactCard: {
    backgroundColor: '#ffffff', borderRadius: 20, marginHorizontal: 16,
    paddingHorizontal: 14, paddingVertical: 4, ...shadowCard,
  },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  compactDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  compactName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  compactSym: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
  compactMeta: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, fontVariant: ['tabular-nums'] },
  compactPrice: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, fontVariant: ['tabular-nums'] },
  gain: { fontSize: 11.5, fontFamily: fonts.extrabold, fontWeight: '800', marginTop: 1, fontVariant: ['tabular-nums'] },
});
