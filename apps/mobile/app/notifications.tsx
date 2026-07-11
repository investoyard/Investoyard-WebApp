import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NotificationView } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { getNotifications, markNotificationRead } from '../lib/api';

export default function NotificationsScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<NotificationView[] | null>(null);

  const load = useCallback(async () => { if (token) setItems(await getNotifications(token)); }, [token]);
  useEffect(() => { load(); }, [load]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>{t('apply.loginRequired')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/login')}><Text style={styles.btnText}>{t('login.getOtp')}</Text></Pressable>
      </View>
    );
  }

  const onTap = async (n: NotificationView) => { if (!n.read) { await markNotificationRead(token, n.id); load(); } };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('notif.title')}</Text>
      {items === null ? (
        <ActivityIndicator style={{ marginTop: 28 }} color={colors.brand.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t('notif.empty')}</Text>
      ) : (
        items.map((n) => (
          <Pressable key={n.id} onPress={() => onTap(n)} style={[styles.card, !n.read && styles.unread]}>
            <View style={styles.row}>
              <Text style={styles.title}>{n.title}</Text>
              {!n.read ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body}>{n.body}</Text>
            <Text style={styles.date}>{n.createdAt.slice(0, 10)}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle, padding: 16 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  muted: { color: colors.textMuted, fontSize: 15 },
  empty: { color: colors.textMuted, fontSize: 15, marginTop: 28, textAlign: 'center' },
  card: { backgroundColor: colors.surface, marginTop: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  unread: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primarySoft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, paddingRight: 10 },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: colors.brand.primary },
  body: { color: colors.text, fontSize: 14, marginTop: 5, lineHeight: 20 },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
});
