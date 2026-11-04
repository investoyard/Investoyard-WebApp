/**
 * IPO Performance — how recent listings actually did: headline stats
 * (average gain · % positive) + every listed issue with price and gain.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../lib/theme';
import { listingInfo, type IpoFull } from '../lib/ipoCalc';
import { getIposResult } from '../lib/api';
import { OfflineState } from '../components/ui/OfflineState';
import { titleCase } from '../lib/format';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { CompanyLogo } from '../components/ui/CompanyLogo';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';

export default function PerformanceScreen() {
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoFull[] | null>(null);
  /* distinct from `null` (still loading) and from an empty list. */
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const listed = (ipos ?? [])
    .map((i) => ({ ipo: i, li: listingInfo(i) }))
    .filter((x): x is { ipo: IpoFull; li: NonNullable<ReturnType<typeof listingInfo>> } => x.li != null)
    .sort((a, b) => (b.ipo.listingDate ?? '').localeCompare(a.ipo.listingDate ?? ''));

  const gains = listed.map((x) => x.li.gainPct).filter((g): g is number => g != null);
  const avg = gains.length ? Math.round((gains.reduce((a, b) => a + b, 0) / gains.length) * 10) / 10 : null;
  const posPct = gains.length ? Math.round((gains.filter((g) => g >= 0).length / gains.length) * 100) : null;

  /* THE SAMPLE HAS TO BE STATED, because these three are the only CLAIMS the
     app makes (QC U4) and none of them said what it was a claim about. Two
     things were wrong beyond the omission:
       - THE DISPLAYED DENOMINATOR WAS NOT THE AVERAGE'S. `listed` admits a
         record with a listing price OR a gain, `gains` needs a gain - so an
         issue with a listing price and no price band counted as a "listing
         tracked" while contributing nothing to either percentage.
       - "listings tracked" reads as a set somebody curated. It is whatever
         this API response happened to carry with a computable gain, which is
         a different and much weaker statement.
     The range comes from the sample itself rather than from a fixed window:
     the catalogue reaches back to 2016, and an average over ten years is not
     the same claim as one over a season. Same house rule as `Total (net
     offer)` and `QIB (Ex. Anchor)` - a figure states its own basis. */
  const withGain = listed.filter((x) => x.li.gainPct != null);
  const dates = withGain.map((x) => x.ipo.listingDate).filter((d): d is string => !!d);
  const yr = (d: string) => d.slice(0, 4);
  const span = dates.length
    ? (yr(dates[dates.length - 1]) === yr(dates[0]) ? yr(dates[0]) : `${yr(dates[dates.length - 1])}–${yr(dates[0])}`)
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      {ipos === null ? (
        <><SkeletonCard lines={2} /><SkeletonCard lines={3} /></>
      ) : offline ? (
        <OfflineState onRetry={load} />
      ) : listed.length === 0 ? (
        <EmptyState title="No listings yet" body="Listing-day performance shows here as issues list." />
      ) : (
        <>
          {avg != null ? (
            <Card style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={[styles.statV, { color: avg >= 0 ? ui.green : ui.red }]}>{avg >= 0 ? '+' : ''}{avg}%</Text>
                <Text style={styles.statK}>avg listing gain</Text>

              </View>
              <View style={styles.statDiv} />
              <View style={styles.stat}>
                <Text style={styles.statV}>{posPct}%</Text>
                <Text style={styles.statK}>listed in profit</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.stat}>
                {/* `gains.length`, NOT `listed.length` - this number is the
                    denominator of the two percentages beside it, so it has to
                    be the set they were computed over. */}
                <Text style={styles.statV}>{gains.length}</Text>
                {/* "listings averaged", not "listings in this average": the
                    longer wording measures 118.6px in a 108.7px column at
                    360px and wraps on a narrow Android. This one is 90.7px. */}
                <Text style={styles.statK}>listings averaged</Text>
              </View>
            </Card>
          ) : null}
          {avg != null ? (
            <Text style={styles.method}>
              Simple average across the {gains.length} listing{gains.length === 1 ? '' : 's'} we
              hold a listing price for{span ? `, ${span}` : ''} — not every IPO ever issued, and
              not a forecast. One unusual debut moves it.
            </Text>
          ) : null}
          <SectionTitle label="Listing day — issue by issue" style={{ marginTop: 16 }} />
          <Card style={{ paddingVertical: 4 }}>
            {listed.map(({ ipo, li }, idx) => {
              const pos = (li.gainPct ?? 0) >= 0;
              const issueP = ipo.priceBandMax ?? ipo.priceBandMin;
              return (
                <Pressable
                  key={ipo.symbol}
                  onPress={() => router.push(`/ipo/${ipo.symbol}`)}
                  style={({ pressed }) => [styles.row, idx < listed.length - 1 && styles.rowDiv, pressed && { opacity: 0.7 }]}
                >
                  <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{titleCase(ipo.name)}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}
                      {issueP != null ? ` · ₹${issueP}${li.price ? ` → ₹${li.price}` : ''}` : ''}
                    </Text>
                  </View>
                  {li.gainPct != null ? (
                    <View style={[styles.gainPill, { backgroundColor: pos ? ui.greenTint : ui.redTint }]}>
                      <Text style={[styles.gainTxt, { color: pos ? ui.green : ui.red }]}>
                        {pos ? '▲ +' : '▼ '}{li.gainPct}%
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  statsCard: { flexDirection: 'row', alignItems: 'center', padding: 0, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statV: { fontSize: 19, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  statK: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 3 },
  /* 11px is the floor the A3 pass set; `slate` not `muted`, which fails AA. */
  method: { fontSize: 11, fontFamily: fonts.regular, color: ui.slate, lineHeight: 16, marginTop: 8, paddingHorizontal: 2 },
  statDiv: { width: 1, height: 30, backgroundColor: ui.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: ui.divider },
  name: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  meta: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 2, fontVariant: ['tabular-nums'] },
  gainPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  gainTxt: { fontSize: 12.5, fontFamily: fonts.extrabold, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
