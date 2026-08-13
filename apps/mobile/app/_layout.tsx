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
        headerBackTitleVisible: false,
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
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="profiles/new" options={{ title: t('profile.new') }} />
      <Stack.Screen name="notifications" options={{ title: t('notif.title') }} />
      <Stack.Screen name="calendar" options={{ title: 'IPO Calendar' }} />
      <Stack.Screen name="consents" options={{ title: t('consents.title') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
  });
  // Never block the app on fonts: after 3s (or on a load error) render with
  // system fonts — Android silently falls back per-style, which is acceptable.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const ready = fontsLoaded || !!fontError || timedOut;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null; // splash stays visible

  return (
    <AuthProvider>
      <ProfilesProvider>
        <LanguageProvider>
          {/* translucent so the Home/Login gradients render under the status bar;
              gradient screens flip to 'light' via useFocusEffect */}
          <StatusBar style="dark" translucent backgroundColor="transparent" />
          <RootStack />
        </LanguageProvider>
      </ProfilesProvider>
    </AuthProvider>
  );
}
