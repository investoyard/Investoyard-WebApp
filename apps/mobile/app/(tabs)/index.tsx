/**
 * Home — IPO dashboard:
 *   gradient hero (decorative geometry + gold accent + personal greeting)
 *   → overlapping 3-col summary card (count-up figures) → filter chips →
 *   "Open now" rich cards · "Upcoming" & "Recently listed" compact rows.
 *   Staggered entrance motion; layout-mirroring skeletons; pull-to-refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { animateNext, microLabel, shadowCard, ui } from '../../lib/theme';
import type { IpoFull } from '../../lib/ipoCalc';
import { getIpos, listApplications } from '../../lib/api';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { useT } from '../../components/i18n';
import { fmtDate } from '../../lib/format';
import { IpoListCard } from '../../components/IpoListCard';
import { Logo } from '../../components/Logo';
import { BrandGradient } from '../../components/ui/Gradient';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard, Skeleton } from '../../components/ui/Skeleton';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { CountUp, FadeInUp } from '../../components/ui/motion';
import { BellIcon, ChevronRightIcon, DocsIcon } from '../../components/ui/icons';

type Filter = 'all' | 'open' | 'upcoming' | 'listed' | 'sme';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'listed', label: 'Listed' },
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
  const [appliedN, setAppliedN] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // gradient hero → light status bar while this tab is focused
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  const load = useCallback(async () => {
    const [rows, apps] = await Promise.all([
      getIpos(),
      token ? listApplications(token).catch(() => []) : Promise.resolve([]),
    ]);
    setIpos(rows);
    setAppliedN(apps.length);
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
  const openIpos = (ipos ?? []).filter((i) => i.status === 'open');
  const upcoming = (ipos ?? []).filter((i) => i.status === 'upcoming');
  const listed = (ipos ?? []).filter((i) => i.status === 'listed' || i.status === 'closed');
  const filtered = filter === 'all' ? (ipos ?? [])
    : filter === 'sme' ? (ipos ?? []).filter((i) => i.type === 'sme')
    : (ipos ?? []).filter((i) => i.status === filter);

  const shortDate = (s?: string) => { const f = fmtDate(s); return f === '—' ? 'TBA' : f.slice(0, 6); };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 28 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" colors={[ui.indigo]} />
      }
    >
      {/* ── gradient hero (full-bleed under the status bar) ── */}
      <View style={[styles.hero, { paddingTop: insets.top + 12, minHeight: 170 + insets.top }]}>
        <BrandGradient />
        {/* decorative geometry — plain Views (svg %-coordinate circles render
            with jagged clipped edges on Android → "broken ellipse") */}
        <View pointerEvents="none" style={[styles.orb, { width: 240, height: 240, borderRadius: 120, top: -140, right: -60, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
        <View pointerEvents="none" style={[styles.orb, { width: 190, height: 190, borderRadius: 95, bottom: -110, left: -70, backgroundColor: 'rgba(255,255,255,0.04)' }]} />
        <View style={styles.heroRow}>
          <View style={styles.logoChip}><Logo height={18} /></View>
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
          >
            <BellIcon size={21} color="#ffffff" strokeWidth={1.8} />
          </Pressable>
        </View>
        <Text style={styles.greet}>{greeting()}, {firstName}</Text>
        {/* the one gold hero accent */}
        <View style={styles.goldUnderline} />
        <Text style={styles.heroTitle}>IPO Dashboard</Text>
      </View>

      {/* ── overlapping summary card (figures count up on first load) ── */}
      <FadeInUp index={0} style={styles.summary}>
        <SummaryCol k="LIVE" v={ipos ? openIpos.length : undefined} />
        <View style={styles.sumDiv} />
        <SummaryCol k="UPCOMING" v={ipos ? upcoming.length : undefined} />
        <View style={styles.sumDiv} />
        <SummaryCol k="APPLIED" v={ipos ? appliedN : undefined} />
      </FadeInUp>

      {/* ── filter chips ── */}
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
            </Pressable>
          );
        })}
      </ScrollView>
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
            icon={<DocsIcon size={26} color={ui.indigo} />}
            title={filter === 'open' ? 'No live IPOs right now' : `No ${filter === 'sme' ? 'SME' : filter} IPOs right now`}
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
                <FadeInUp key={i.id} index={idx + 1}>
                  <IpoListCard ipo={i} />
                </FadeInUp>
              ))}
            </>
          ) : null}

          {/* Upcoming — compact rows */}
          {upcoming.length > 0 ? (
            <FadeInUp index={openIpos.length + 1}>
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

          {/* Recently listed — compact rows with gain */}
          {listed.length > 0 ? (
            <FadeInUp index={openIpos.length + 2}>
              <SectionTitle label="Recently listed" style={styles.section} />
              <View style={styles.compactCard}>
                {listed.map((i, idx) => (
                  <CompactRow
                    key={i.id}
                    ipo={i}
                    right={i.listingGainPct != null ? (
                      <Text style={[styles.gain, { color: i.listingGainPct >= 0 ? ui.green : ui.red }]}>
                        {i.listingGainPct >= 0 ? '▲ +' : '▼ '}{i.listingGainPct}%
                      </Text>
                    ) : (
                      <Text style={styles.compactMeta}>{t(`status.${i.status}`)}</Text>
                    )}
                    divider={idx > 0}
                    onPress={() => router.push(`/ipo/${i.symbol}`)}
                  />
                ))}
              </View>
            </FadeInUp>
          ) : null}

          {openIpos.length === 0 && upcoming.length === 0 && listed.length === 0 ? (
            <EmptyState
              icon={<DocsIcon size={26} color={ui.indigo} />}
              title="No live IPOs right now"
              body="The next one is loading… pull down to check."
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function SummaryCol({ k, v }: { k: string; v?: number }) {
  return (
    <View style={styles.sumCol}>
      <Text style={styles.sumK}>{k}</Text>
      {v == null
        ? <Skeleton w={28} h={22} r={6} style={{ marginTop: 4 }} />
        : <CountUp value={v} style={styles.sumV} />}
    </View>
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
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 56, // room for the overlapping summary card
  },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoChip: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  greet: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 18 },
  goldUnderline: { width: 34, height: 3, borderRadius: 2, backgroundColor: '#FFCB32', marginTop: 6 },
  heroTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: -40, marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#ffffff', borderRadius: 20, paddingVertical: 16,
    ...shadowCard,
  },
  sumCol: { flex: 1, alignItems: 'center', gap: 2 },
  sumDiv: { width: 1, height: 30, backgroundColor: ui.divider },
  sumK: { ...microLabel, fontSize: 10.5 },
  sumV: { fontSize: 20, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  filters: { paddingHorizontal: 16, paddingVertical: 14, gap: 8, flexDirection: 'row' },
  fchip: {
    paddingHorizontal: 16, height: 36, borderRadius: 999, backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    ...shadowCard,
  },
  fchipOn: { backgroundColor: ui.indigo },
  fchipTxt: { fontSize: 13, fontWeight: '700', color: ui.slate },
  fchipTxtOn: { color: '#ffffff' },
  refreshed: { fontSize: 11.5, fontWeight: '700', color: ui.green, textAlign: 'center', marginBottom: 8 },
  section: { marginTop: 14, marginHorizontal: 16 },
  compactCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: '#ffffff', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 4,
    ...shadowCard,
  },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  compactDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  compactName: { fontSize: 14, fontWeight: '700', color: ui.title },
  compactSym: { fontSize: 11.5, fontWeight: '600', color: ui.muted, marginTop: 2, letterSpacing: 0.2 },
  compactMeta: { fontSize: 12, fontWeight: '600', color: ui.slate, fontVariant: ['tabular-nums'] },
  gain: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
