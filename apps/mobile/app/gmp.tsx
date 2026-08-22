/**
 * GMP Trends — every IPO currently carrying a grey-market premium, grouped by
 * stage, with the day-wise trend (REAL admin-entered gmpLog only) and the
 * estimated listing price (band ceiling + GMP). Disclaimer always visible.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../lib/theme';
import { type IpoFull } from '../lib/ipoCalc';
import { getIpos } from '../lib/api';
import { titleCase } from '../lib/format';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { CompanyLogo } from '../components/ui/CompanyLogo';
import { Sparkline } from '../components/ui/Sparkline';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';

const gmpLog = (i: IpoFull): number[] => {
  const log = (i.extra as any)?.gmpLog;
  return Array.isArray(log) ? log.map((e: any) => Number(e?.gmp) || 0) : [];
};

function Row({ ipo, last }: { ipo: IpoFull; last: boolean }) {
  const router = useRouter();
  const gmp = ipo.gmp ?? 0;
  const pos = gmp >= 0;
  const band = ipo.priceBandMax ?? ipo.priceBandMin;
  const est = band != null ? band + gmp : null;
  const log = gmpLog(ipo);
  return (
    <Pressable
      onPress={() => router.push(`/ipo/${ipo.symbol}`)}
      style={({ pressed }) => [styles.row, !last && styles.rowDiv, pressed && { opacity: 0.7 }]}
    >
      <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{titleCase(ipo.name)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}{est != null ? ` · est. listing ₹${est}` : ''}
        </Text>
      </View>
      {log.length >= 2 ? <Sparkline values={log} color={pos ? ui.green : ui.red} /> : null}
      <View style={[styles.gmpPill, { backgroundColor: pos ? ui.greenTint : ui.redTint }]}>
        <Text style={[styles.gmpTxt, { color: pos ? ui.green : ui.red }]}>
          {pos ? '+' : ''}₹{gmp}{ipo.gmpPct != null ? `\n${pos ? '+' : ''}${ipo.gmpPct}%` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function GmpScreen() {
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setIpos(await getIpos()); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const withGmp = (ipos ?? []).filter((i) => i.gmp != null && i.status !== 'withdrawn');
  const groups: { label: string; rows: IpoFull[] }[] = [
    { label: 'Open now', rows: withGmp.filter((i) => i.status === 'open') },
    { label: 'Opening soon', rows: withGmp.filter((i) => i.status === 'upcoming') },
    { label: 'Awaiting listing', rows: withGmp.filter((i) => i.status === 'closed') },
  ].filter((g) => g.rows.length > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      <Text style={styles.disclaimer}>
        Grey-market premium is unofficial, unregulated and often wrong — information only, never investment advice.
      </Text>
      {ipos === null ? (
        <><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>
      ) : groups.length === 0 ? (
        <EmptyState title="No live GMP right now" body="GMP appears here while issues are open or awaiting listing." />
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <SectionTitle label={g.label} style={{ marginTop: 14 }} />
            <Card style={{ paddingVertical: 4 }}>
              {g.rows.map((i, idx) => <Row key={i.symbol} ipo={i} last={idx === g.rows.length - 1} />)}
            </Card>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  disclaimer: { fontSize: 11, fontFamily: fonts.regular, color: ui.muted, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: ui.divider },
  name: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  meta: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  gmpPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, minWidth: 62, alignItems: 'center' },
  gmpTxt: { fontSize: 12, fontFamily: fonts.extrabold, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
});
