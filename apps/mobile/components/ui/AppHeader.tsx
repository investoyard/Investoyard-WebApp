import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../../lib/theme';
import { Logo } from '../Logo';
import { HeaderIcons } from './HeaderIcons';

/**
 * Brand header for the non-hero tab screens: logo left, the standard
 * Calendar + Notifications cluster right (language moved to Account →
 * Language), safe-area aware.
 */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Logo height={22} />
        <HeaderIcons />
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
});
