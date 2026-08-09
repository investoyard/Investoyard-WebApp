/**
 * Account — iOS-Settings-style grouped list cards:
 * Preferences (Language expands inline) · Activity (Notifications, Consents)
 * · Session (Sign out, red). Version footer.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LANGS } from '@investoyard/i18n';
import { animateNext, microLabel, ui } from '../../lib/theme';
import { useLang, useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  BellIcon, ChevronDownIcon, ChevronRightIcon, GlobeIcon, LockIcon,
  ShieldIcon, SignOutIcon, UsersIcon,
} from '../../components/ui/icons';

export default function AccountScreen() {
  const t = useT();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { token, signOut } = useAuth();
  const { profiles } = useProfiles();
  const [langOpen, setLangOpen] = useState(false);

  const currentLang = LANGS.find((l) => l.code === lang)?.label ?? 'English';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={styles.h1}>Account</Text>

      {!token ? (
        <Card style={{ marginTop: 16 }}>
          <View style={styles.signinRow}>
            <View style={[styles.iconChip, { backgroundColor: ui.indigoTint }]}>
              <LockIcon size={19} color={ui.indigo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signinTitle}>{t('login.title')}</Text>
              <Text style={styles.signinSub}>{t('login.subtitle')}</Text>
            </View>
          </View>
          <Button label={t('login.getOtp')} onPress={() => router.push('/login')} style={{ marginTop: 14 }} />
        </Card>
      ) : null}

      {/* Preferences */}
      <Text style={styles.groupLbl}>PREFERENCES</Text>
      <Card style={styles.group}>
        <Pressable
          onPress={() => { animateNext(); setLangOpen((o) => !o); }}
          style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.6 }]}
        >
          <View style={[styles.iconChip, { backgroundColor: ui.indigoTint }]}>
            <GlobeIcon size={19} color={ui.indigo} strokeWidth={1.8} />
          </View>
          <Text style={styles.rowLbl}>Language</Text>
          <Text style={styles.rowVal}>{currentLang}</Text>
          <View style={{ transform: [{ rotate: langOpen ? '180deg' : '0deg' }] }}>
            <ChevronDownIcon size={15} color={ui.muted} strokeWidth={2} />
          </View>
        </Pressable>
        {langOpen ? (
          <View style={styles.langs}>
            {LANGS.map((l) => {
              const on = l.code === lang;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setLang(l.code)}
                  style={({ pressed }) => [styles.lang, on && styles.langOn, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.langTxt, on && styles.langTxtOn]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Card>

      {token ? (
        <>
          {/* Activity */}
          <Text style={styles.groupLbl}>ACTIVITY</Text>
          <Card style={styles.group}>
            <Row
              icon={<UsersIcon size={19} color={ui.indigo} strokeWidth={1.8} />}
              iconBg={ui.indigoTint}
              label={t('profiles.title')}
              value={profiles.length ? `${profiles.length}` : undefined}
              onPress={() => router.push('/profiles')}
            />
            <Row
              icon={<BellIcon size={19} color={ui.amber} strokeWidth={1.8} />}
              iconBg={ui.amberTint}
              label={t('notif.link')}
              onPress={() => router.push('/notifications')}
              divider
            />
            <Row
              icon={<ShieldIcon size={19} color={ui.green} strokeWidth={1.8} />}
              iconBg={ui.greenTint}
              label={t('consents.link')}
              onPress={() => router.push('/consents')}
              divider
            />
          </Card>

          {/* Session */}
          <Text style={styles.groupLbl}>SESSION</Text>
          <Card style={styles.group}>
            <Row
              icon={<SignOutIcon size={19} color={ui.red} strokeWidth={1.8} />}
              iconBg={ui.redTint}
              label="Sign out"
              labelColor={ui.red}
              onPress={signOut}
              chevron={false}
            />
          </Card>
        </>
      ) : null}

      <Text style={styles.version}>Investoyard · v0.1.0</Text>
      <Text style={styles.foot}>
        Investoyard distributes and informs — it does not give investment advice. Grey-market (GMP) figures
        are unofficial and unregulated. Every applicant applies with their own PAN, demat and bank/UPI.
      </Text>
    </ScrollView>
  );
}

function Row({ icon, iconBg, label, value, onPress, divider, chevron = true, labelColor }: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string;
  onPress: () => void;
  divider?: boolean;
  chevron?: boolean;
  labelColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.rowItem, divider && styles.rowDivider, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.iconChip, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={[styles.rowLbl, labelColor ? { color: labelColor } : null]}>{label}</Text>
      {value ? <Text style={styles.rowVal}>{value}</Text> : null}
      {chevron ? <ChevronRightIcon size={15} color={ui.muted} strokeWidth={2} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: ui.title },
  signinRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signinTitle: { fontSize: 15, fontWeight: '700', color: ui.title },
  signinSub: { fontSize: 12.5, color: ui.muted, marginTop: 2 },
  groupLbl: { ...microLabel, marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  group: { paddingVertical: 4 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 6 },
  rowDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  iconChip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLbl: { flex: 1, fontSize: 15, fontWeight: '500', color: ui.title },
  rowVal: { fontSize: 13, color: ui.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  langs: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingTop: 4, paddingBottom: 12, paddingLeft: 48,
  },
  lang: {
    paddingHorizontal: 14, height: 36, borderRadius: 999, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  langOn: { backgroundColor: ui.indigo },
  langTxt: { fontSize: 13, fontWeight: '600', color: ui.slate },
  langTxtOn: { color: '#ffffff' },
  version: { fontSize: 12, color: ui.muted, textAlign: 'center', marginTop: 28, fontWeight: '600' },
  foot: { fontSize: 11, color: ui.muted, lineHeight: 16, marginTop: 10, textAlign: 'center', paddingHorizontal: 8 },
});
