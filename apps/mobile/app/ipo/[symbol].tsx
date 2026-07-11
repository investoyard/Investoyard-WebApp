import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { IpoDetail } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { getIpo } from '../../lib/api';
import { useT } from '../../components/i18n';

export default function IpoDetailScreen() {
  const t = useT();
  const router = useRouter();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoDetail | null | undefined>(undefined);

  useEffect(() => {
    if (symbol) getIpo(String(symbol)).then((v) => setIpo(v ?? null));
  }, [symbol]);

  if (ipo === undefined) return <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>;
  if (ipo === null) return <View style={styles.center}><Text style={styles.muted}>{t('detail.notFound')}</Text></View>;

  const subMax = Math.max(1, ...(ipo.subscription ?? []).map((s) => s.timesSubscribed));
  const dates: [string, string | undefined][] = [
    [t('dates.open'), ipo.openDate], [t('dates.close'), ipo.closeDate], [t('dates.allotment'), ipo.allotmentDate], [t('dates.listing'), ipo.listingDate],
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.row}>
        <Text style={styles.h1}>{ipo.name}</Text>
        <Text style={[styles.chip, ipo.status === 'open' && styles.chipOpen]}>{t(`status.${ipo.status}`)}</Text>
      </View>
      <Text style={styles.muted}>
        {ipo.type === 'sme' ? 'SME' : 'Mainboard'}
        {ipo.priceBandMin != null ? `  ·  ₹${ipo.priceBandMin}–${ipo.priceBandMax}` : ''}
        {ipo.lotSize != null ? `  ·  Lot ${ipo.lotSize}` : ''}
        {ipo.minAmount != null ? `  ·  Min ₹${ipo.minAmount.toLocaleString('en-IN')}` : ''}
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('detail.keyDates')}</Text>
        {dates.map(([k, v]) => (
          <View style={styles.kv} key={k}><Text style={styles.kvK}>{k}</Text><Text style={styles.kvV}>{v ?? '—'}</Text></View>
        ))}
      </View>

      {ipo.subscription ? (
        <View style={styles.card}>
          <Text style={styles.label}>{t('detail.liveSubscription')}</Text>
          {ipo.subscription.map((s) => (
            <View style={styles.subrow} key={s.category}>
              <Text style={styles.subcat}>{s.category.toUpperCase()}</Text>
              <View style={styles.subbar}><View style={[styles.subfill, { width: `${Math.min(100, (s.timesSubscribed / subMax) * 100)}%` }]} /></View>
              <Text style={styles.subx}>{s.timesSubscribed}×</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>{t('detail.greyMarket')}</Text>
        {ipo.gmp != null ? (
          <View style={styles.row}>
            <Text style={styles.muted}>{t('detail.premiumPerShare')}</Text>
            <Text style={[styles.gmpVal, ipo.gmp >= 0 ? styles.pos : styles.neg]}>
              {ipo.gmp >= 0 ? '+' : ''}{ipo.gmp}{ipo.gmpPct != null ? `  (${ipo.gmpPct}%)` : ''}
            </Text>
          </View>
        ) : <Text style={styles.muted}>{t('detail.noGmp')}</Text>}
        <Text style={styles.disclaimer}>{t('detail.disclaimer')}</Text>
      </View>

      {ipo.type === 'sme' && ipo.smeCompliance ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('detail.smeNorms')}</Text>
            {ipo.smeCompliance.meetsNorms ? <Text style={styles.badgeOk}>{t('detail.meetsNorms')}</Text> : null}
          </View>
          <View style={styles.kv}><Text style={styles.kvK}>₹1cr EBITDA test</Text><Text style={styles.kvV}>{ipo.smeCompliance.ebitdaTest ? 'Pass' : '—'}</Text></View>
          <View style={styles.kv}><Text style={styles.kvK}>OFS %</Text><Text style={styles.kvV}>{ipo.smeCompliance.ofsPct ?? '—'}%</Text></View>
          <View style={styles.kv}><Text style={styles.kvK}>GCP %</Text><Text style={styles.kvV}>{ipo.smeCompliance.gcpPct ?? '—'}%</Text></View>
        </View>
      ) : null}

      {ipo.about ? <Text style={[styles.muted, { marginTop: 14 }]}>{ipo.about}</Text> : null}

      <Pressable style={styles.btn} onPress={() => router.push(`/apply/${ipo.symbol}`)}><Text style={styles.btnText}>{t('detail.apply')}</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgSubtle },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.text, flex: 1, paddingRight: 12 },
  card: { backgroundColor: colors.surface, marginTop: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textMuted, marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  disclaimer: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  chip: { fontSize: 12, fontWeight: '500', color: colors.textMuted, backgroundColor: colors.bgSubtle, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  chipOpen: { color: colors.state.success, backgroundColor: '#eaf5ee' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvK: { color: colors.textMuted, fontSize: 15 },
  kvV: { color: colors.text, fontSize: 15, fontWeight: '500' },
  subrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 7 },
  subcat: { width: 56, fontSize: 12, color: colors.textMuted, letterSpacing: 0.3 },
  subbar: { flex: 1, height: 8, backgroundColor: colors.bgSubtle, borderRadius: 980, overflow: 'hidden' },
  subfill: { height: '100%', backgroundColor: colors.brand.primary, borderRadius: 980 },
  subx: { width: 52, textAlign: 'right', fontWeight: '600', fontSize: 14, color: colors.text },
  gmpVal: { fontSize: 18 },
  pos: { color: colors.state.success, fontWeight: '600' },
  neg: { color: colors.state.danger, fontWeight: '600' },
  badgeOk: { fontSize: 12, fontWeight: '600', color: colors.state.success, backgroundColor: '#eaf5ee', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 24 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
});
