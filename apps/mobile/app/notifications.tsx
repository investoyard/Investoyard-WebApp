import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NotificationView } from '@investoyard/shared-types';
import { shadowCard, ui } from '../lib/theme';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { getNotifications, markNotificationRead } from '../lib/api';
import { EmptyState } from '../components/ui/EmptyState';
import { LoginGate } from '../components/ui/LoginGate';
import { SkeletonCard } from '../components/ui/Skeleton';
import { BellIcon } from '../components/ui/icons';
import { fmtDate } from '../lib/format';

export default function NotificationsScreen() {
  const t = useT();
  const { token } = useAuth();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { if (token) setItems(await getNotifications(token)); }, [token]);
  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  if (!token) return <LoginGate body="Sign in to receive allotment and listing alerts." />;

  const onTap = async (n: NotificationView) => { if (!n.read) { await markNotificationRead(token, n.id); load(); } };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
      }
    >
      {items === null ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={26} color={ui.indigo} />}
          title={t('notif.empty')}
        />
      ) : (
        items.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => onTap(n)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.row}>
              <Text style={[styles.title, !n.read && { fontWeight: '800' }]} numberOfLines={2}>{n.title}</Text>
              {!n.read ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body}>{n.body}</Text>
            <Text style={styles.date}>{fmtDate(n.createdAt.slice(0, 10))}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  card: {
    backgroundColor: '#ffffff', marginBottom: 12, padding: 16, borderRadius: 20,
    ...shadowCard,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: ui.title, flex: 1, lineHeight: 20 },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: ui.indigo, marginTop: 5 },
  body: { color: ui.body, fontSize: 13.5, marginTop: 5, lineHeight: 19 },
  date: { color: ui.muted, fontSize: 11.5, fontWeight: '600', marginTop: 9, fontVariant: ['tabular-nums'] },
});
