/**
 * IPO detail — content parity with apps/web/components/views/IpoDetailView.tsx:
 * hero, key-stat grid, timeline (indigo rail), live subscription, reservation,
 * GMP (+disclaimer), SME norms, company accordions, issue details — restyled to
 * the elevated fintech language. Sticky bottom bar: MIN INVESTMENT + Apply.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import type { IpoFull } from '../../lib/ipoCalc';
import { getIpo } from '../../lib/api';
import { useT } from '../../components/i18n';
import { fmtRange, inr, priceBand, stripHtml, closesInLabel } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Chip, ChipTone } from '../../components/ui/Chip';
import { StatTile } from '../../components/ui/StatTile';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';
import { ExpandTile } from '../../components/ui/ExpandTile';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { BrandGradient } from '../../components/ui/Gradient';
import { SkeletonCard, Skeleton } from '../../components/ui/Skeleton';
import { CalendarIcon } from '../../components/ui/icons';
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

  const canApply = ipo.status === 'open' || ipo.status === 'upcoming';
  const closes = ipo.status === 'open' ? closesInLabel(ipo.closeDate) : null;
  const ex: Record<string, any> = ipo.extra ?? {};
  const leadManagers: string[] = Array.isArray(ex.leads) && ex.leads.length
    ? ex.leads
    : ipo.type === 'sme' ? ['Nuvama', 'JM Financial'] : ['Axis Capital', 'Nuvama', 'JM Financial'];
  const exchanges = ipo.type === 'sme' ? 'NSE SME · BSE SME' : 'NSE · BSE';
  const aboutParas = stripHtml(typeof ex.companyDescription === 'string' && ex.companyDescription.trim() ? ex.companyDescription : ipo.about);
  const objectParas = stripHtml(ipo.objectsOfIssue);
  const finParas = stripHtml(typeof ex.companyFinancials === 'string' ? ex.companyFinancials : undefined);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: canApply ? 130 : 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
        }
      >
        {/* slim gradient band — visual continuity with the Home hero */}
        <View style={styles.band}>
          <BrandGradient />
        </View>

        <View style={styles.content}>
        {/* hero card overlapping the band's bottom edge */}
        <Card style={styles.heroCard}>
          <View style={styles.hero}>
            <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={54} />
            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>{ipo.name}</Text>
              <View style={styles.heroMeta}>
                <Chip label={ipo.type === 'sme' ? 'SME' : 'Mainboard'} tone={ipo.type === 'sme' ? 'brand' : 'neutral'} dot={false} />
                <Chip label={t(`status.${ipo.status}`)} tone={STATUS_TONE[ipo.status] ?? 'neutral'} />
              </View>
              <View style={styles.heroDates}>
                <CalendarIcon size={13} color={ui.muted} strokeWidth={1.8} />
                <Text style={styles.heroDatesTxt}>{fmtRange(ipo.openDate, ipo.closeDate)}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* key stats */}
        <View style={styles.stats}>
          <StatTile label="Price band" value={priceBand(ipo.priceBandMin, ipo.priceBandMax)} hilite />
          <StatTile label="Bid lot" value={ipo.lotSize != null ? String(ipo.lotSize) : '—'} />
          <StatTile label="Min investment" value={inr(ipo.minAmount)} hilite />
          <StatTile label="Issue size" value={ipo.issueSize ?? '—'} />
        </View>

        {/* timeline */}
        <SectionTitle label={t('detail.keyDates')} style={{ marginTop: 24 }} />
        <Card><TimelinePanel ipo={ipo} /></Card>

        {/* live subscription */}
        {ipo.subscription && ipo.subscription.length > 0 ? (
          <>
            <SectionTitle
              label={t('detail.liveSubscription')}
              meta={ipo.subscriptionAsOf ? `as of ${ipo.subscriptionAsOf.slice(0, 10)}` : undefined}
              style={{ marginTop: 24 }}
            />
            <Card><SubscriptionPanel ipo={ipo} /></Card>
          </>
        ) : null}

        {/* reservation */}
        <SectionTitle label="Issue reservation" meta={ipo.issueSize} style={{ marginTop: 24 }} />
        <Card><ReservationPanel ipo={ipo} /></Card>

        {/* lot ladder */}
        <SectionTitle
          label="Lot ladder"
          meta={ipo.lotSize != null ? `1 lot = ${ipo.lotSize} shares` : undefined}
          style={{ marginTop: 24 }}
        />
        <Card><LotPanel ipo={ipo} /></Card>

        {/* GMP — always with disclaimer */}
        <SectionTitle label={t('detail.greyMarket')} style={{ marginTop: 24 }} />
        <Card><GmpPanel ipo={ipo} disclaimer={t('detail.disclaimer')} /></Card>

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
        {aboutParas.length > 0 || objectParas.length > 0 || finParas.length > 0 || (ipo.financials && ipo.financials.length > 0) ? (
          <>
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
          </>
        ) : null}

        {/* issue details */}
        <SectionTitle label="Issue details" style={{ marginTop: 24 }} />
        <Card>
          <KV k="Lead managers" v={leadManagers.join(', ')} />
          <KV k="Registrar" v={ipo.registrar ?? '—'} />
          <KV k="Listing on" v={exchanges} last />
        </Card>
        </View>
      </ScrollView>

      {/* sticky bottom apply bar */}
      {canApply ? (
        <View style={[styles.applyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.applyK}>MIN INVESTMENT</Text>
            <Text style={styles.applyV}>{inr(ipo.minAmount)}</Text>
            {closes ? <Text style={styles.applyCloses}>{closes}</Text> : null}
          </View>
          <Button label="Apply now" onPress={() => router.push(`/apply/${ipo.symbol}`)} style={{ minWidth: 150 }} />
        </View>
      ) : null}
    </View>
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
  band: {
    height: 120,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  content: { paddingHorizontal: 16, marginTop: -48 },
  heroCard: { marginBottom: 2 },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  h1: { fontSize: 21, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.5, color: ui.title, lineHeight: 26 },
  heroMeta: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  heroDates: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  heroDatesTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
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
});
