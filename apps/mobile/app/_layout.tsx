import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { fonts, enableLayoutAnimation, ui } from '../lib/theme';
import { Logo } from '../components/Logo';
import { HeaderIcons } from '../components/ui/HeaderIcons';
import { LanguageProvider, useT } from '../components/i18n';
import { AuthProvider } from '../components/auth';
import { ProfilesProvider } from '../components/profiles';
import { GmpConsentProvider } from '../components/gmpConsent';
import { GmpDialog } from '../components/GmpDialog';
import { LABEL } from '@investoyard/shared-types';

// Hold the splash until the Inter faces are ready (no unstyled-text flash).
SplashScreen.preventAutoHideAsync().catch(() => {});

// Accordion / section animations (Android needs the experimental flag; once, at startup).
enableLayoutAnimation();

/** Inner stack — lives inside LanguageProvider so screen titles are translated. */
function RootStack() {
  const t = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTintColor: ui.indigo,
        headerTitleStyle: { color: ui.title, fontSize: 16, fontFamily: fonts.bold, fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: ui.canvas },
      }}
    >
      {/* main app — bottom tabs draw their own headers */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* detail/flow screens keep native back-navigation headers */}
      <Stack.Screen
        name="ipo/[symbol]"
        options={{ headerTitle: () => <Logo height={20} />, headerTitleAlign: 'center', headerRight: () => <HeaderIcons boxed={false} /> }}
      />
      <Stack.Screen name="apply/[symbol]" options={{ title: t('apply.title'), headerRight: () => <HeaderIcons boxed={false} /> }} />
      <Stack.Screen name="print/[symbol]" options={{ title: 'Print Forms', headerRight: () => <HeaderIcons boxed={false} /> }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      {/* Moved out of the tab group by the handoff's 5->4 cut, so it needs a
          stack entry to get the back header. Reached from Account. */}
      <Stack.Screen name="profiles/index" options={{ title: t('profiles.title') }} />
      <Stack.Screen name="profiles/new" options={{ title: t('profile.new') }} />
      <Stack.Screen name="notifications" options={{ title: t('notif.title') }} />
      <Stack.Screen name="watchlist" options={{ title: 'Watchlist' }} />
      <Stack.Screen name="calendar" options={{ title: 'IPO Calendar' }} />
      <Stack.Screen name="consents" options={{ title: t('consents.title') }} />
      {/* Insights hub screens */}
      <Stack.Screen name="gmp" options={{ title: `${LABEL.gmp} Trends` }} />
      <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
      <Stack.Screen name="performance" options={{ title: 'IPO Performance' }} />
      <Stack.Screen name="glossary" options={{ title: 'IPO Glossary' }} />
      <Stack.Screen name="news/index" options={{ title: 'News & Updates' }} />
      <Stack.Screen name="news/[slug]" options={{ title: 'Investoyard News' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
  });
  /* NEVER BLOCK THE APP ON FONTS, but do not lose the race either.
   *
   * This used to open after 3s and the comment called the fallback
   * "acceptable". It is not: the family names stay applied, and on Android an
   * unresolvable `fontFamily` makes text measure a glyph short of what it
   * draws — the board segment rendered "Al / Mainboar / SM" inside buttons
   * with 46px to spare, because the label shrink-wraps to its measurement.
   *
   * Five font files over a LAN dev server on a cold Metro cache can take
   * longer than 3s; in a production build they are local and resolve in
   * milliseconds, so a generous hatch costs real users nothing and only stops
   * a dev session rendering in the wrong typeface. */
  const FONT_TIMEOUT_MS = 12_000;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = fontsLoaded || !!fontError || timedOut;
  /* SAY SO. The fallback was silent, which is why "why is the text cut off?"
     was not answerable from the device. */
  useEffect(() => {
    if (!__DEV__ || fontsLoaded) return;
    if (fontError) console.warn('[fonts] Inter failed to load; text will render in the system font:', fontError);
    else if (timedOut) console.warn(`[fonts] Inter did not load within ${FONT_TIMEOUT_MS}ms; rendering in the system font — expect clipped labels`);
  }, [fontsLoaded, fontError, timedOut]);
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null; // splash stays visible

  return (
    <AuthProvider>
      <ProfilesProvider>
        <GmpConsentProvider>
          <LanguageProvider>
            {/* SDK 58 removed translucent + backgroundColor from StatusBarProps.
                Android edge-to-edge is the default from SDK 55, so the bar is
                already translucent and the Home/Login gradients still render
                under it. Gradient screens flip to 'light' via useFocusEffect. */}
            <StatusBar style="dark" />
            <RootStack />
            {/* ONE instance, at the root: the disclaimer has to be reachable
                from whichever screen the reader asked to see a figure on, and
                mounting it on Home alone is what let a deep link to /gmp show
                GMP to someone who was never given it. */}
            <GmpDialog />
          </LanguageProvider>
        </GmpConsentProvider>
      </ProfilesProvider>
    </AuthProvider>
  );
}
