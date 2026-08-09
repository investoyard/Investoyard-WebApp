import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../../lib/theme';
import { Logo } from '../Logo';
import { LangToggle } from '../i18n';
import { BellIcon } from './icons';

/** Brand header for the non-hero tab screens: logo left, actions right, safe-area aware. */
export function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Logo height={22} />
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <BellIcon size={21} color={ui.title} strokeWidth={1.8} />
          </Pressable>
          <LangToggle />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: ui.divider,
  },
  bar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: ui.canvas,
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.96 }] },
});
