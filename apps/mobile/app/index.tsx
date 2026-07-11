import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import type { IpoListItem } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { getIpos } from '../lib/api';
import { useT } from '../components/i18n';

export default function HomeScreen() {
  const t = useT();
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoListItem[] | null>(null);

  useEffect(() => {
    getIpos().then(setIpos);
  }, []);

  if (!ipos) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={ipos}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.h1}>{t('home.title')}</Text>
          <View style={styles.quickRow}>
            <Pressable style={styles.profilesLink} onPress={() => router.push('/profiles')}>
              <Text style={styles.profilesLinkTxt}>{t('profiles.title')} →</Text>
            </Pressable>
            <Pressable style={styles.profilesLink} onPress={() => router.push('/applications')}>
              <Text style={styles.profilesLinkTxt}>{t('apps.link')} →</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/ipo/${item.symbol}`} asChild>
          <Pressable style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.chip, item.status === 'open' && styles.chipOpen]}>{t(`status.${item.status}`)}</Text>
            </View>
            <Text style={styles.muted}>
              {item.type === 'sme' ? 'SME' : 'Mainboard'}
              {item.priceBandMin != null ? `  ·  ₹${item.priceBandMin}–${item.priceBandMax}` : ''}
              {item.lotSize != null ? `  ·  Lot ${item.lotSize}` : ''}
            </Text>
            {item.closeDate && item.status === 'open' ? <Text style={styles.muted}>Closes {item.closeDate}</Text> : null}
            {item.subscriptionTimes != null || item.gmp != null || item.listingGainPct != null ? (
              <View style={styles.signals}>
                {item.subscriptionTimes != null ? (
                  <Text style={styles.signal}><Text style={styles.bold}>{item.subscriptionTimes}×</Text> {t('label.subscribed')}</Text>
                ) : null}
                {item.gmp != null ? (
                  <Text style={styles.signal}>
                    GMP <Text style={item.gmp >= 0 ? styles.pos : styles.neg}>{item.gmp >= 0 ? '+' : ''}{item.gmp}{item.gmpPct != null ? ` (${item.gmpPct}%)` : ''}</Text>
                  </Text>
                ) : null}
                {item.listingGainPct != null ? (
                  <Text style={styles.signal}>{t('label.listed')} <Text style={item.listingGainPct >= 0 ? styles.pos : styles.neg}>{item.listingGainPct >= 0 ? '+' : ''}{item.listingGainPct}%</Text></Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgSubtle },
  list: { flex: 1, backgroundColor: colors.bgSubtle },
  h1: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: colors.text, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  quickRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 16, paddingBottom: 10 },
  profilesLink: {},
  profilesLinkTxt: { color: colors.brand.primary, fontWeight: '600', fontSize: 14 },
  card: { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  muted: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  chip: { fontSize: 12, fontWeight: '500', color: colors.textMuted, backgroundColor: colors.bgSubtle, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  chipOpen: { color: colors.state.success, backgroundColor: '#eaf5ee' },
  signals: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  signal: { fontSize: 14, color: colors.text },
  bold: { fontWeight: '600' },
  pos: { color: colors.state.success, fontWeight: '600' },
  neg: { color: colors.state.danger, fontWeight: '600' },
});
