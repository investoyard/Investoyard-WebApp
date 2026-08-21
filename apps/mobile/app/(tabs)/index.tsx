/**
 * Home — IPO dashboard v3 (compact):
 *   slim gradient hero (logo · calendar + bell-with-badge · one greeting line)
 *   → status filter chips WITH live counts → Mainboard/SME segment →
 *   "Open now" rich cards · "Upcoming" & "Recently closed" compact rows.
 *   One-time GMP awareness dialog (compliance). No duplicate shortcuts —
 *   Apply lives on cards, Allotment/Applicants on their tabs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { fonts, animateNext, shadowCard, ui } from '../../lib/theme';
import { listingInfo, type IpoFull } from '../../lib/ipoCalc';
import { getIpos, getNotifications } from '../../lib/api';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { useT } from '../../components/i18n';
import { fmtDate } from '../../lib/format';
import { IpoListCard } from '../../components/IpoListCard';
import { Logo } from '../../components/Logo';
import { GmpDialog } from '../../components/GmpDialog';
import { BrandGradient } from '../../components/ui/Gradient';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { EmptyState } from '../../components/ui/EmptyState';
import { IllusDocs } from '../../components/ui/illustrations';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { FadeInUp } from '../../components/ui/motion';
import { BellIcon, CalendarIcon, ChevronRightIcon } from '../../components/ui/icons';

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { profiles } = useProfiles();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [board, setBoard] = useState<Board>('all');

  // gradient hero → light status bar while this tab is focused
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

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

  const firstName = profiles.find((p) => p.relationship === 'self')?.fullName.trim().split(/\s+/)[0] ?? 'Investor';
  // Board filter applies FIRST — sections and status filtering both respect it.
  const base = (ipos ?? []).filter((i) => board === 'all' || i.type === board);
  const openIpos = base.filter((i) => i.status === 'open');
  const upcoming = base.filter((i) => i.status === 'upcoming');
  const listed = base.filter((i) => i.status === 'listed' || i.status === 'closed');
  const filtered = filter === 'all' ? base
    : filter === 'closed' ? base.filter((i) => i.status === 'closed' || i.status === 'listed')
    : base.filter((i) => i.status === filter);
  const counts: Record<Filter, number> = {
    all: base.length, open: openIpos.length, upcoming: upcoming.length, closed: listed.length,
  };

  const shortDate = (s?: string) => { const f = fmtDate(s); return f === '—' ? 'TBA' : f.slice(0, 6); };

  // gold dot on the calendar icon when TODAY has any IPO event (open/close/
  // allotment/listing) — zero home-screen space; the calendar leads with Today.
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hasTodayEvents = (ipos ?? []).some((i) =>
    i.openDate === todayIso || i.closeDate === todayIso || i.allotmentDate === todayIso || i.listingDate === todayIso);

  return (
    <>
      {/* one-time GMP awareness consent (compliance) */}
      <GmpDialog />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: 110 /* clear the floating tab bar */ }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" colors={[ui.indigo]} />
        }
      >
        {/* ── compact gradient hero: logo · calendar + alerts · greeting ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
          <BrandGradient />
          <View pointerEvents="none" style={[styles.orb, { width: 190, height: 190, borderRadius: 95, top: -110, right: -50, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
          <View style={styles.heroRow}>
            <Logo height={20} variant="light" />
            <View style={styles.heroIcons}>
              <Pressable
                onPress={() => router.push('/calendar')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="IPO calendar"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
              >
                <CalendarIcon size={19} color="#ffffff" strokeWidth={1.8} />
                {hasTodayEvents ? <View style={styles.todayDot} /> : null}
              </Pressable>
              <Pressable
                onPress={() => router.push('/notifications')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
              >
                <BellIcon size={19} color="#ffffff" strokeWidth={1.8} />
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
          <Text style={styles.greet}>
            {greeting()}, {firstName} <Text style={styles.greetGold}>•</Text>
          </Text>
        </View>

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
                <SectionTitle label="Upcoming" style={styles.section} />
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
                <SectionTitle label="Recently closed" style={styles.section} />
                <View style={styles.compactCard}>
                  {listed.map((i, idx) => {
                    const li = listingInfo(i);
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
                          <Text style={styles.compactMeta}>{t(`status.${i.status}`)}</Text>
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
        <Text style={styles.compactName} numberOfLines={1}>{ipo.name}</Text>
        <Text style={styles.compactSym} numberOfLines={1}>{ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
      </View>
      {right}
      <ChevronRightIcon size={15} color={ui.muted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  orb: { position: 'absolute' },
  // compact hero — one row + one greeting line (no dashboard headline)
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: ui.gradTop,
  },
  badgeTxt: { color: '#ffffff', fontSize: 9.5, fontFamily: fonts.extrabold, fontWeight: '800' },
  // "something happens today" — gold dot on the calendar icon
  todayDot: {
    position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#FFCB32', borderWidth: 1.5, borderColor: ui.gradTop,
  },
  greet: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', marginTop: 12 },
  greetGold: { color: '#FFCB32', fontFamily: fonts.extrabold, fontWeight: '800' },
  // status chips with live counts
  filters: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  fchip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, height: 36, borderRadius: 999, backgroundColor: '#ffffff',
    justifyContent: 'center',
    ...shadowCard,
  },
  fchipOn: { backgroundColor: ui.indigo },
  fchipTxt: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  fchipTxtOn: { color: '#ffffff' },
  fchipN: {
    fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.indigo,
    backgroundColor: ui.indigoTint, borderRadius: 999, minWidth: 20, height: 20,
    textAlign: 'center', lineHeight: 20, overflow: 'hidden', fontVariant: ['tabular-nums'],
  },
  fchipNOn: { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.22)' },
  seg: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#ffffff', borderRadius: 999, padding: 3, ...shadowCard,
  },
  segBtn: { flex: 1, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: ui.indigoTint },
  segTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  segTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  refreshed: { fontSize: 11.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.green, textAlign: 'center', marginBottom: 8 },
  section: { marginTop: 14, marginHorizontal: 16 },
  compactCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: '#ffffff', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 4,
    ...shadowCard,
  },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  compactDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  compactName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  compactSym: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, letterSpacing: 0.2 },
  compactMeta: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, fontVariant: ['tabular-nums'] },
  compactPrice: { fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  gain: { fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
