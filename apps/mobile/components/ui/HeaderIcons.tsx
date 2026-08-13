import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../../lib/theme';
import { useAuth } from '../auth';
import { getNotifications } from '../../lib/api';
import { BellIcon, CalendarIcon } from './icons';

/**
 * The standard header action cluster used on EVERY screen: IPO Calendar +
 * Notifications (with red unread badge). `tint` adapts to light/dark bars.
 */
export function HeaderIcons({ tint = ui.title, boxed = true }: { tint?: string; boxed?: boolean }) {
  const router = useRouter();
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) { setUnread(0); return; }
    getNotifications(token)
      .then((rows) => setUnread(rows.filter((n: any) => !(n.readAt ?? n.read)).length))
      .catch(() => {});
  }, [token]);

  const btn = boxed ? styles.iconBtn : styles.iconBtnPlain;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push('/calendar')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="IPO calendar"
        style={({ pressed }) => [btn, pressed && styles.pressed]}
      >
        <CalendarIcon size={19} color={tint} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        style={({ pressed }) => [btn, pressed && styles.pressed]}
      >
        <BellIcon size={19} color={tint} strokeWidth={1.8} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: ui.canvas,
  },
  iconBtnPlain: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  badge: {
    position: 'absolute', top: 1, right: 1, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { color: '#ffffff', fontSize: 9, fontFamily: fonts.extrabold, fontWeight: '800' },
});
