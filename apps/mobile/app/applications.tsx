import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ApplicationView } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { listApplications } from '../lib/api';

const POSITIVE = ['allotted', 'upi_blocked', 'confirmed', 'dp_verified'];
const NEGATIVE = ['not_allotted', 'rejected', 'failed', 'dp_failed'];

export default function ApplicationsScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const [apps, setApps] = useState<ApplicationView[] | null>(null);

  useEffect(() => { if (token) listApplications(token).then(setApps); }, [token]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>{t('apply.loginRequired')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/login')}>
          <Text style={styles.btnText}>{t('login.getOtp')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('apps.title')}</Text>
      {apps && apps.length === 0 ? <Text style={styles.empty}>{t('apps.empty')}</Text> : null}
      {(apps ?? []).map((a) => {
        const tone = POSITIVE.includes(a.status) ? styles.ok : NEGATIVE.includes(a.status) ? styles.bad : styles.pending;
        return (
          <View style={styles.card} key={a.id}>
            <View style={styles.row}>
              <Text style={styles.name}>{a.ipoSymbol ?? a.ipoId}{a.ipoName ? ` · ${a.ipoName}` : ''}</Text>
              <Text style={[styles.chip, tone]}>{t(`appStatus.${a.status}`)}</Text>
            </View>
            {a.amountBlocked != null ? <Text style={styles.muted}>₹{a.amountBlocked.toLocaleString('en-IN')} {t('apps.blocked')}</Text> : null}
            {a.applicationNumber ? <Text style={styles.muted}>App no. {a.applicationNumber}</Text> : null}
            {a.allottedLots != null ? (
              <View style={styles.allot}>
                <Text style={styles.allotTxt}>
                  {a.allottedLots > 0 ? `${t('apps.allotted')}: ${a.allottedLots} ${t('apps.lots')}` : t('apps.notAllotted')}
                </Text>
                {a.refundAmount != null && a.refundAmount > 0 ? (
                  <Text style={styles.refundTxt}>₹{a.refundAmount.toLocaleString('en-IN')} {t('apps.refund')}</Text>
                ) : null}
              </View>
            ) : null}
            {a.listingGain != null ? (
              <View style={styles.allot}>
                <Text style={styles.allotTxt}>{a.listingGain >= 0 ? t('apps.listingGain') : t('apps.listingLoss')}</Text>
                <Text style={[styles.gainTxt, a.listingGain >= 0 ? styles.gainPos : styles.gainNeg]}>
                  {a.listingGain >= 0 ? '+' : '−'}₹{Math.abs(a.listingGain).toLocaleString('en-IN')}
                  {a.listingGainPct != null ? `  (${a.listingGainPct >= 0 ? '+' : ''}${a.listingGainPct}%)` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle, padding: 16 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  empty: { color: colors.textMuted, fontSize: 15, marginTop: 24, textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: colors.surface, marginTop: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  ok: { color: colors.state.success, backgroundColor: '#eaf5ee' },
  bad: { color: colors.state.danger, backgroundColor: '#fbeaea' },
  pending: { color: colors.textMuted, backgroundColor: colors.bgSubtle },
  allot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  allotTxt: { color: colors.text, fontSize: 14, fontWeight: '600' },
  refundTxt: { color: colors.state.success, fontSize: 13, fontWeight: '600' },
  gainTxt: { fontSize: 14, fontWeight: '700' },
  gainPos: { color: colors.state.success },
  gainNeg: { color: colors.state.danger },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
});
