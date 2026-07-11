import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ConsentView } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { listConsents, withdrawConsent } from '../lib/api';

/** DPDP data-principal rights: view granted consents + withdraw (prospective). */
export default function ConsentsScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<ConsentView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (token) setItems(await listConsents(token));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>{t('apply.loginRequired')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/login')}><Text style={styles.btnText}>{t('login.getOtp')}</Text></Pressable>
      </View>
    );
  }

  const onWithdraw = async (type: string) => {
    setBusy(type);
    await withdrawConsent(token, type);
    await load();
    setBusy(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('consents.title')}</Text>
      <Text style={styles.note}>{t('consents.note')}</Text>

      {items === null ? (
        <ActivityIndicator style={{ marginTop: 28 }} color={colors.brand.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t('consents.empty')}</Text>
      ) : (
        items.map((c) => (
          <View style={styles.card} key={c.id}>
            <View style={styles.row}>
              <Text style={styles.name}>{t(`consent.type.${c.type}`)}</Text>
              <Text style={[styles.chip, c.active ? styles.ok : styles.warn]}>
                {c.active ? t('consents.active') : t('consents.withdrawn')}
              </Text>
            </View>
            <Text style={styles.muted}>{t('consents.granted')}: {c.grantedAt.slice(0, 10)} · v{c.noticeVersion}{c.channel ? ` · ${c.channel}` : ''}</Text>
            {c.active ? (
              <Pressable style={styles.withdraw} disabled={busy === c.type} onPress={() => onWithdraw(c.type)}>
                <Text style={styles.withdrawTxt}>{busy === c.type ? '…' : t('consents.withdraw')}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle, padding: 16 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  muted: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  empty: { color: colors.textMuted, fontSize: 15, marginTop: 28, textAlign: 'center' },
  card: { backgroundColor: colors.surface, marginTop: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1, paddingRight: 10 },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  ok: { color: colors.state.success, backgroundColor: '#eaf5ee' },
  warn: { color: colors.textMuted, backgroundColor: colors.bgSubtle },
  withdraw: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 980, borderWidth: 1, borderColor: colors.state.danger },
  withdrawTxt: { color: colors.state.danger, fontWeight: '600', fontSize: 13 },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
});
