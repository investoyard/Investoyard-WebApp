import type { ComponentType } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, ui } from '../../lib/theme';
import { tapLight } from '../../lib/haptics';
import { AppHeader } from '../../components/ui/AppHeader';
import {
  DocsIcon, DocsIconFill, GearIcon, GearIconFill,
  HomeIcon, HomeIconFill, InsightsIcon, InsightsIconFill,
  UsersIcon, UsersIconFill, IconProps,
} from '../../components/ui/icons';

/**
 * Primary navigation — 5 bottom tabs:
 *   Home (IPO explorer) · Insights (allotment checker + GMP/subscription/
 *   performance/news/glossary hub) · Applications · Profiles · Account.
 * Group folder keeps every historical path (/, /applications, /profiles) unchanged.
 */

/** Icon slot: filled variant + soft indigo pill behind the icon when active. */
function TabIcon({ focused, color, Line, Fill }: {
  focused: boolean;
  color: string;
  Line: ComponentType<IconProps>;
  Fill: ComponentType<IconProps>;
}) {
  const I = focused ? Fill : Line;
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapOn]}>
      {/* Zomato-style 2px active indicator at the very top of the tab slot */}
      {focused ? <View style={styles.activeLine} /> : null}
      <I size={24} color={color} strokeWidth={1.8} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenListeners={{ tabPress: () => tapLight() }}
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: ui.indigo,
        tabBarInactiveTintColor: ui.muted,
        // Floating pill tab bar — detached from the bottom edge with a soft shadow.
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10) + 4,
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          borderRadius: 24,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          elevation: 12,
          shadowColor: '#1A1440',
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarLabelStyle: { fontSize: 10, fontFamily: fonts.semibold, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false, // Home draws its own gradient hero
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={HomeIcon} Fill={HomeIconFill} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={InsightsIcon} Fill={InsightsIconFill} />,
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={DocsIcon} Fill={DocsIconFill} />,
        }}
      />
      <Tabs.Screen
        name="profiles"
        options={{
          title: 'Profiles',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={UsersIcon} Fill={UsersIconFill} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={GearIcon} Fill={GearIconFill} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48, height: 30, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapOn: { backgroundColor: ui.indigoTint },
  // sits flush with the tab bar's top edge (icon wrapper starts at paddingTop 6)
  activeLine: {
    position: 'absolute', top: -6, width: 34, height: 2, borderRadius: 1,
    backgroundColor: ui.indigo, alignSelf: 'center',
  },
});
