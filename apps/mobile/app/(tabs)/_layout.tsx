import type { ComponentType } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, ui } from '../../lib/theme';
import { tapLight } from '../../lib/haptics';
import { AppHeader } from '../../components/ui/AppHeader';
import {
  DocsIcon, DocsIconFill, GearIcon, GearIconFill,
  HomeIcon, HomeIconFill, InsightsIcon, InsightsIconFill,
  IconProps,
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
  /* RN 0.88: tabBarIcon passes a ColorValue, which may be an opaque
     platform colour or null - not necessarily a string. */
  color: ColorValue;
  Line: ComponentType<IconProps>;
  Fill: ComponentType<IconProps>;
}) {
  const I = focused ? Fill : Line;
  /* Narrow once. A non-string ColorValue cannot be handed to IconProps,
     so fall back to a real theme colour rather than casting a lie. */
  /* `slate` because this stands in for the navigator's own tint, which is
     `ui.indigo` when focused and `ui.slate` otherwise — a `muted` fallback
     would render the icon lighter than the label beside it. */
  const tint = typeof color === 'string' ? color : ui.slate;
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapOn]}>
      {/* Zomato-style 2px active indicator at the very top of the tab slot */}
      {focused ? <View style={styles.activeLine} /> : null}
      <I size={24} color={tint} strokeWidth={1.8} />
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
        /* `slate`, not `muted` — this tint colours the tab LABEL as well as the
           icon, so the 4.5:1 text bar applies rather than the 3:1 graphic one.
           On the white pill `muted` (#767CA3) is 4.05:1 and `slate` is 5.97:1,
           and the label is 10px, the smallest text in the app: it is the one
           place where the A3 floor could not be applied (at 11px
           "Applications" needs 66.6px in a 66.4px tab), so contrast is all
           there is to give it. The A1 sweep classified this as an icon prop
           and left it. */
        tabBarInactiveTintColor: ui.slate,
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
        /* 11 - the A3 floor, reachable now the bar is FOUR tabs, and measured
           rather than guessed. The pill is inset left:14 right:14, so a tab is
           (screen-28)/4 = 83px at 360 and the widest label, "Account", is
           44.7px in Inter SemiBold: 38.3px spare, and it still fits at a 1.3x
           font scale (58.1px), which the column does not grow for. At five tabs
           this could not be done - "Applications" was 66.6px in a 66.4px tab -
           so THE RENAME TO "Applied" (40.9px) IS LOAD-BEARING for the floor,
           not cosmetic. */
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', marginTop: 2 },
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
      {/* "Applied", not "Applications" - the handoff's own label, and the
          reason the 11sp floor above is reachable. Second, ahead of Insights:
          an investor opens this app to check a bid far more often than to
          browse, and the handoff orders it that way too. */}
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applied',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={color} Line={DocsIcon} Fill={DocsIconFill} />,
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
