/**
 * Subscription — live category-wise demand for open issues (+ the last week's
 * closed ones), with plain-language demand words calibrated per board.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../lib/theme';
import { type IpoFull } from '../lib/ipoCalc';
import { getIpos } from '../lib/api';
import { demandWord } from '../components/IpoListCard';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { CompanyLogo } from '../components/ui/CompanyLogo';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';

const CAT_LABEL: Record<string, string> = { qib: 'QIB', nii: 'NII', retail: 'Retail', employee: 'Employee', shareholder: 'Shareholder', total: 'Total' };

function SubCard({ ipo }: { ipo: IpoFull }) {
  const router = useRouter();
  const rows = (ipo.subscription ?? []).filter((r) => r.category !== 'total');
  const total = ipo.subscriptionTimes ?? (ipo.subscription ?? []).find((r) => r.category === 'total')?.timesSubscribed;
  const maxX = Math.max(1, ...rows.map((r) => r.timesSubscribed));
  return (
    <Card style={{ marginTop: 10 }} onPress={() => router.push(`/ipo/${ipo.symbol}`)}>
      <View style={styles.head}>
        <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{ipo.name}</Text>
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
            <View key={r.category} style={styles.catRow}>
              <Text style={styles.catK}>{CAT_LABEL[r.category] ?? r.category.toUpperCase()}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, Math.min(100, (r.timesSubscribed / maxX) * 100))}%` }]} />
              </View>
              <Text style={styles.catV}>{r.timesSubscribed}×</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedTxt}>Category-wise figures arrive once bidding starts.</Text>
      )}
    </Card>
  );
}

export default function SubscriptionScreen() {
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setIpos(await getIpos()); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const withSub = (i: IpoFull) => (i.subscription ?? []).length > 0 || i.subscriptionTimes != null;
  const open = (ipos ?? []).filter((i) => i.status === 'open' && withSub(i));
  const recent = (ipos ?? []).filter((i) => (i.status === 'closed' || i.status === 'listed') && withSub(i))
    .sort((a, b) => (b.closeDate ?? '').localeCompare(a.closeDate ?? ''))
    .slice(0, 8);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      {ipos === null ? (
        <><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>
      ) : open.length === 0 && recent.length === 0 ? (
        <EmptyState title="No subscription data yet" body="Live category-wise demand shows here while issues are open." />
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
              <SectionTitle label="Recently closed — final figures" style={{ marginTop: open.length ? 20 : 0 }} />
              {recent.map((i) => <SubCard key={i.symbol} ipo={i} />)}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
