/**
 * IPO detail — content parity with apps/web/components/views/IpoDetailView.tsx:
 * hero, key-stat grid, timeline (indigo rail), live subscription, reservation,
 * GMP (+disclaimer), SME norms, company accordions, issue details — restyled to
 * the elevated fintech language. Sticky bottom bar: MIN INVESTMENT + Apply.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { animateNext, fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import { listingInfo, type IpoFull } from '../../lib/ipoCalc';
import { getIpo } from '../../lib/api';
import { useT } from '../../components/i18n';
import { tapSelect } from '../../lib/haptics';
import Svg, { Path, Polyline } from 'react-native-svg';
import { fmtRange, inr, priceBand, stripHtml, closesInLabel } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Chip, ChipTone } from '../../components/ui/Chip';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';
import { ExpandTile } from '../../components/ui/ExpandTile';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { SkeletonCard, Skeleton } from '../../components/ui/Skeleton';
import { CalendarIcon, ShareIcon } from '../../components/ui/icons';
import { EmptyState } from '../../components/ui/EmptyState';
import { GmpPanel, LotPanel, ReservationPanel, SubscriptionPanel, TimelinePanel } from '../../components/IpoPanels';

const STATUS_TONE: Record<string, ChipTone> = {
  open: 'success', upcoming: 'warn', closed: 'neutral', listed: 'neutral', withdrawn: 'danger',
};

export default function IpoDetailScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoFull | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Sticky section navigation (Pack D): section Y positions are captured via
  // onLayout; the chip bar appears after the hero scrolls away and tracks the
  // section under the reader. ALL hooks live above the early returns.
  const scrollRef = useRef<ScrollView>(null);
  const secY = useRef<Record<string, number>>({});
  const [navOn, setNavOn] = useState(false);
  const [active, setActive] = useState('overview');
  const navRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (symbol) setIpo((await getIpo(String(symbol))) ?? null);
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  if (ipo === undefined) {
    return (
      <View style={[styles.screen, { padding: 16, gap: 12 }]}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Skeleton w={54} h={54} r={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton w="80%" h={18} />
            <Skeleton w="45%" h={12} />
          </View>
        </View>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </View>
    );
  }
  if (ipo === null) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <EmptyState title={t('detail.notFound')} />
      </View>
    );
  }

  const inWindow = ipo.status === 'open' || ipo.status === 'upcoming';
  // Operator gates: "Start Bid" → Apply (UPI) · "Start Printing" → Print Forms (bank ASBA).
  const canApply = inWindow && (ipo.extra as any)?.startBid === true;
  const canPrint = inWindow && (ipo.extra as any)?.startPrint === true;
  const closes = ipo.status === 'open' ? closesInLabel(ipo.closeDate) : null;
  const ex: Record<string, any> = ipo.extra ?? {};
  const leadManagers: string[] = Array.isArray(ex.leads) && ex.leads.length
    ? ex.leads
    : ipo.type === 'sme' ? ['Nuvama', 'JM Financial'] : ['Axis Capital', 'Nuvama', 'JM Financial'];
  const exchanges = ipo.type === 'sme' ? 'NSE SME · BSE SME' : 'NSE · BSE';
  const aboutParas = stripHtml(typeof ex.companyDescription === 'string' && ex.companyDescription.trim() ? ex.companyDescription : ipo.about);
  const objectParas = stripHtml(ipo.objectsOfIssue);
  const finParas = stripHtml(typeof ex.companyFinancials === 'string' ? ex.companyFinancials : undefined);
  const hasCompany = aboutParas.length > 0 || objectParas.length > 0 || finParas.length > 0 || (ipo.financials?.length ?? 0) > 0;

  /* ---- pinned section-nav plumbing (identity + chips never scroll away) ---- */
  const sections: { key: string; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'dates', label: 'Dates' },
    ...(ipo.subscription && ipo.subscription.length > 0 ? [{ key: 'subs', label: 'Subscription' }] : []),
    { key: 'reserve', label: 'Reserve' },
    { key: 'lots', label: 'Lots' },
    { key: 'gmp', label: 'GMP' },
    ...(hasCompany ? [{ key: 'company', label: 'Company' }] : []),
    { key: 'details', label: 'Details' },
  ];
  const reg = (k: string) => (e: { nativeEvent: { layout: { y: number } } }) => { secY.current[k] = e.nativeEvent.layout.y; };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // Scrolled → the pinned bar COMPACTS: logo hidden, name to one line with …,
    // and a one-line key-metrics strip (band · lot · min invest) above the chips.
    const on = y > 64;
    if (on !== navOn) { animateNext(); setNavOn(on); }
    let cur = sections[0].key;
    for (const s of sections) {
      const sy = secY.current[s.key];
      if (sy != null && sy - 24 <= y) cur = s.key;
    }
    if (cur !== active) {
      setActive(cur);
      // keep the active chip visible in the bar
      const idx = sections.findIndex((s) => s.key === cur);
      navRef.current?.scrollTo({ x: Math.max(0, idx * 92 - 60), animated: true });
    }
  };
  const jump = (k: string) => {
    const sy = secY.current[k];
    if (sy == null) return;
    tapSelect();
    scrollRef.current?.scrollTo({ y: Math.max(0, sy - 8), animated: true });
  };
  const onShare = () => {
    Share.share({
      message: `${ipo.name} (${ipo.symbol}) IPO — ${priceBand(ipo.priceBandMin, ipo.priceBandMax)}, lot ${ipo.lotSize ?? '—'}, ${fmtRange(ipo.openDate, ipo.closeDate)}. Details: https://newipo.finwave.co/ipos/${ipo.symbol}`,
    }).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      {/* ── PINNED bar: full identity at rest → compacts on scroll (logo hidden,
             one-line name with …, key metrics strip). Name is ALWAYS visible. ── */}
      <View style={[styles.pin, navOn && styles.pinShadow]}>
        {!navOn ? (
          <View style={styles.pinRow}>
            <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pinName} numberOfLines={1}>{ipo.name}</Text>
              <Text style={styles.pinSym} numberOfLines={1}>
                {ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'} · {exchanges}
              </Text>
            </View>
            <Chip label={t(`status.${ipo.status}`)} tone={STATUS_TONE[ipo.status] ?? 'neutral'} />
            <Pressable
              onPress={onShare}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Share this IPO"
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.94 }] }]}
            >
              <ShareIcon size={17} color={ui.indigo} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.pinCompact}>
            <Text style={styles.pinName} numberOfLines={1} ellipsizeMode="tail">{ipo.name}</Text>
            <Text style={styles.pinMetrics} numberOfLines={1}>
              {priceBand(ipo.priceBandMin, ipo.priceBandMax)} · Lot {ipo.lotSize != null ? `${ipo.lotSize} sh` : '—'} · Min {inr(ipo.minAmount)}
            </Text>
          </View>
        )}
        <ScrollView ref={navRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          {sections.map((s) => {
            const on = active === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => jump(s.key)}
                style={({ pressed }) => [styles.navChip, on && styles.navChipOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.navTxt, on && styles.navTxtOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingBottom: inWindow ? 130 : 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
        }
      >
        <View style={styles.content}>
        {/* ── OVERVIEW: dates + key metrics ── */}
        <View onLayout={reg('overview')}>
        <View style={styles.datesRow}>
          <CalendarIcon size={13} color={ui.muted} strokeWidth={1.8} />
          <Text style={styles.heroDatesTxt}>{fmtRange(ipo.openDate, ipo.closeDate)}</Text>
        </View>

        {/* key metrics — one elevated card, 2×2 grid with hairline dividers */}
        <Card style={styles.metricsCard}>
          <View style={styles.metricsRow}>
            <Metric k="Price band" v={priceBand(ipo.priceBandMin, ipo.priceBandMax)} />
            <View style={styles.mDivV} />
            <Metric k="Bid lot" v={ipo.lotSize != null ? `${ipo.lotSize} shares` : '—'} />
          </View>
          <View style={styles.mDivH} />
          <View style={styles.metricsRow}>
            <Metric k="Min investment" v={inr(ipo.minAmount)} hi />
            <View style={styles.mDivV} />
            <Metric k="Issue size" v={ipo.issueSize ?? '—'} />
          </View>
        </Card>
        </View>

        {/* listing performance — statement card, tinted by outcome */}
        {(() => {
          const li = listingInfo(ipo);
          if (!li) return null;
          const pos = (li.gainPct ?? 0) >= 0;
          const issueP = ipo.priceBandMax ?? ipo.priceBandMin;
          return (
            <>
              <SectionTitle label="Listing performance" style={{ marginTop: 24 }} />
              <Card style={[styles.perfCard, { backgroundColor: pos ? ui.greenTint : ui.redTint }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.perfK}>LISTED AT</Text>
                    <View style={styles.perfRow}>
                      <Text style={styles.perfV}>{li.price ? `₹${li.price}` : `${li.gainPct}%`}</Text>
                      {li.gainPct != null ? (
                        <View style={[styles.perfPill, { backgroundColor: pos ? ui.green : ui.red }]}>
                          <Text style={styles.perfPillTxt}>{pos ? '▲ +' : '▼ '}{li.gainPct}%</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.perfSub}>
                      Issue price {issueP != null ? `₹${issueP}` : '—'} · {exchanges}
                    </Text>
                  </View>
                  <TrendArrow up={pos} />
                </View>
              </Card>
            </>
          );
        })()}

        {/* timeline */}
        <View onLayout={reg('dates')}>
          <SectionTitle label={t('detail.keyDates')} style={{ marginTop: 24 }} />
          <Card><TimelinePanel ipo={ipo} /></Card>
        </View>

        {/* live subscription */}
        {ipo.subscription && ipo.subscription.length > 0 ? (
          <View onLayout={reg('subs')}>
            <SectionTitle
              label={t('detail.liveSubscription')}
              meta={ipo.subscriptionAsOf ? `as of ${ipo.subscriptionAsOf.slice(0, 10)}` : undefined}
              style={{ marginTop: 24 }}
            />
            <Card><SubscriptionPanel ipo={ipo} /></Card>
          </View>
        ) : null}

        {/* reservation */}
        <View onLayout={reg('reserve')}>
          <SectionTitle label="Issue reservation" meta={ipo.issueSize} style={{ marginTop: 24 }} />
          <Card><ReservationPanel ipo={ipo} /></Card>
        </View>

        {/* lot ladder */}
        <View onLayout={reg('lots')}>
          <SectionTitle
            label="Lot ladder"
            meta={ipo.lotSize != null ? `1 lot = ${ipo.lotSize} shares` : undefined}
            style={{ marginTop: 24 }}
          />
          <Card><LotPanel ipo={ipo} /></Card>
        </View>

        {/* GMP — always with disclaimer */}
        <View onLayout={reg('gmp')}>
          <SectionTitle label={t('detail.greyMarket')} style={{ marginTop: 24 }} />
          <Card><GmpPanel ipo={ipo} disclaimer={t('detail.disclaimer')} /></Card>
        </View>

        {/* SME norms */}
        {ipo.type === 'sme' && ipo.smeCompliance ? (
          <>
            <SectionTitle label={t('detail.smeNorms')} style={{ marginTop: 24 }} />
            <Card>
              {ipo.smeCompliance.meetsNorms ? (
                <View style={{ marginBottom: 10 }}><Chip label="Meets norms" tone="success" /></View>
              ) : null}
              <KV k="₹1cr EBITDA test" v={ipo.smeCompliance.ebitdaTest ? 'Pass' : '—'} />
              <KV k="OFS %" v={`${ipo.smeCompliance.ofsPct ?? '—'}%`} />
              <KV k="GCP %" v={`${ipo.smeCompliance.gcpPct ?? '—'}%`} last />
            </Card>
          </>
        ) : null}

        {/* company long-form content — animated in-card accordions */}
        {hasCompany ? (
          <View onLayout={reg('company')}>
            <SectionTitle label="Company" style={{ marginTop: 24 }} />
            <Card style={{ paddingVertical: 2 }}>
              {aboutParas.length > 0 ? (
                <ExpandTile title="About the company" initiallyOpen>
                  {aboutParas.map((p, i) => <Text key={i} style={[styles.para, i > 0 && { marginTop: 8 }]}>{p}</Text>)}
                </ExpandTile>
              ) : null}
              {objectParas.length > 0 ? (
                <ExpandTile title="Objects of the issue">
                  {objectParas.map((p, i) => <Text key={i} style={[styles.para, i > 0 && { marginTop: 8 }]}>{p}</Text>)}
                </ExpandTile>
              ) : null}
              {finParas.length > 0 || (ipo.financials && ipo.financials.length > 0) ? (
                <ExpandTile title="Financials">
                  {finParas.length > 0
                    ? finParas.map((p, i) => <Text key={i} style={[styles.para, i > 0 && { marginTop: 8 }]}>{p}</Text>)
                    : ipo.financials!.map((f, i) => <KV key={f.label} k={f.label} v={f.value} last={i === ipo.financials!.length - 1} />)}
                </ExpandTile>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* issue details */}
        <View onLayout={reg('details')}>
          <SectionTitle label="Issue details" style={{ marginTop: 24 }} />
          <Card>
            <KV k="Lead managers" v={leadManagers.join(', ')} />
            <KV k="Registrar" v={ipo.registrar ?? '—'} />
            <KV k="Listing on" v={exchanges} last />
          </Card>
        </View>
        </View>
      </ScrollView>


      {/* sticky bottom apply bar */}
      {inWindow ? (
        <View style={[styles.applyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.applyK}>MIN INVESTMENT</Text>
            <Text style={styles.applyV}>{inr(ipo.minAmount)}</Text>
            {closes ? <Text style={styles.applyCloses}>{closes}</Text> : null}
            {ipo.status === 'open' && ipo.subscriptionTimes != null ? (
              <Text style={styles.applySub}>{ipo.subscriptionTimes}× subscribed</Text>
            ) : null}
          </View>
          {canApply || canPrint ? (
            <View style={{ gap: 8, minWidth: 150 }}>
              {canApply ? <Button label="Apply now" small onPress={() => router.push(`/apply/${ipo.symbol}`)} /> : null}
              {canPrint ? <Button label="Print Forms" small variant="danger" onPress={() => router.push(`/print/${ipo.symbol}`)} /> : null}
            </View>
          ) : (
            <Button label="Bidding opens soon" variant="ghost" disabled onPress={() => {}} style={{ minWidth: 150 }} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function Metric({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricK} numberOfLines={1}>{k}</Text>
      <Text style={[styles.metricV, hi && { color: ui.indigo }]} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
    </View>
  );
}

/** Small decorative trend arrow for the listing-performance card. */
function TrendArrow({ up }: { up: boolean }) {
  const c = up ? ui.green : ui.red;
  return (
    <Svg width={64} height={44} viewBox="0 0 64 44">
      <Polyline
        points={up ? '4,36 22,26 36,30 58,10' : '4,10 22,20 36,16 58,36'}
        stroke={c} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d={up ? 'M50 10 h8 v8' : 'M50 36 h8 v-8'}
        stroke={c} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function KV({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.kv, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  // key-metrics card (2×2, hairline dividers)
  metricsCard: { marginTop: 10, padding: 0 },
  metricsRow: { flexDirection: 'row' },
  metric: { flex: 1, paddingHorizontal: 16, paddingVertical: 13 },
  metricK: { ...microLabel, fontSize: 10.5 },
  metricV: { fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title, marginTop: 4, fontVariant: ['tabular-nums'] },
  mDivV: { width: 1, backgroundColor: ui.divider, marginVertical: 10 },
  mDivH: { height: 1, backgroundColor: ui.divider, marginHorizontal: 16 },
  // listing-performance statement card
  perfCard: {},
  perfK: { ...microLabel, fontSize: 10.5, color: ui.slate },
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  perfV: { fontSize: 26, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.5, color: ui.title, fontVariant: ['tabular-nums'] },
  perfPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  perfPillTxt: { color: '#ffffff', fontSize: 12, fontFamily: fonts.extrabold, fontWeight: '800', fontVariant: ['tabular-nums'] },
  perfSub: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 7, fontVariant: ['tabular-nums'] },
  // pinned identity + section nav (fixed under the native header)
  pin: {
    backgroundColor: '#ffffff',
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: ui.divider,
    zIndex: 5,
  },
  pinShadow: { ...shadowCard, elevation: 6 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  pinName: { fontSize: 15.5, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title },
  pinSym: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
  // scrolled (compact) mode — no logo, name one line, key metrics strip
  pinCompact: { paddingHorizontal: 16 },
  pinMetrics: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate, marginTop: 3, fontVariant: ['tabular-nums'] },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, marginBottom: 2 },
  heroDatesTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, fontVariant: ['tabular-nums'] },
  para: { fontFamily: fonts.regular, fontSize: 14, color: ui.body, lineHeight: 21 },
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: ui.divider,
  },
  kvK: { fontFamily: fonts.regular, fontSize: 14, color: ui.muted },
  kvV: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, flexShrink: 1, textAlign: 'right' },
  applyBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: ui.divider,
    ...shadowCard,
  },
  applyK: { ...microLabel, fontSize: 10.5 },
  applyV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 2, fontVariant: ['tabular-nums'] },
  applyCloses: { fontSize: 11.5, color: ui.amber, fontFamily: fonts.bold, fontWeight: '700', marginTop: 2 },
  applySub: { fontSize: 11.5, color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  shareBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: ui.indigoTint,
    alignItems: 'center', justifyContent: 'center',
  },
  navRow: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  navChip: { paddingHorizontal: 14, height: 32, borderRadius: 999, justifyContent: 'center', backgroundColor: ui.canvas },
  navChipOn: { backgroundColor: ui.indigo },
  navTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  navTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
});
