import { Stack } from 'expo-router';
import { colors } from '@investoyard/design-tokens';
import { Logo } from '../components/Logo';
import { LanguageProvider, LangToggle } from '../components/i18n';
import { AuthProvider } from '../components/auth';
import { ProfilesProvider } from '../components/profiles';

export default function RootLayout() {
  return (
    <AuthProvider>
    <ProfilesProvider>
    <LanguageProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.brand.primary,
          headerTitleAlign: 'center',
          headerTitle: () => <Logo height={22} />,
          headerRight: () => <LangToggle />,
        }}
      />
    </LanguageProvider>
    </ProfilesProvider>
    </AuthProvider>
  );
}
