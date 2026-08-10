import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { enableLayoutAnimation, ui } from '../lib/theme';
import { Logo } from '../components/Logo';
import { LanguageProvider, LangToggle, useT } from '../components/i18n';
import { AuthProvider } from '../components/auth';
import { ProfilesProvider } from '../components/profiles';

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
        headerTitleStyle: { color: ui.title, fontSize: 16, fontWeight: '700' },
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: ui.canvas },
      }}
    >
      {/* main app — bottom tabs draw their own headers */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* detail/flow screens keep native back-navigation headers */}
      <Stack.Screen
        name="ipo/[symbol]"
        options={{ headerTitle: () => <Logo height={20} />, headerTitleAlign: 'center', headerRight: () => <LangToggle /> }}
      />
      <Stack.Screen name="apply/[symbol]" options={{ title: t('apply.title') }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="profiles/new" options={{ title: t('profile.new') }} />
      <Stack.Screen name="notifications" options={{ title: t('notif.title') }} />
      <Stack.Screen name="consents" options={{ title: t('consents.title') }} />
    </Stack>
  );
}

export default function RootLayout() {
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
