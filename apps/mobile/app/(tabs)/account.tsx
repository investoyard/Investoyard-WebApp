/**
 * Account — iOS-Settings-style grouped list cards:
 * Preferences (Language expands inline) · Activity (Notifications, Consents)
 * · Session (Sign out, red). Version footer.
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LANGS } from '@investoyard/i18n';
import { fonts, animateNext, microLabel, ui } from '../../lib/theme';
import { useLang, useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  BellIcon, BookIcon, ChevronDownIcon, ChevronRightIcon, DocsIcon, GlobeIcon, LockIcon,
  NewsIcon, ShieldIcon, SignOutIcon, UsersIcon,
} from '../../components/ui/icons';
import { siteUrl } from '../../lib/site';
import { getSecurity, setOtpChannel, setPassword, clearPassword, type SecuritySettings } from '../../lib/api';

const openSite = (path: string) => Linking.openURL(siteUrl(path)).catch(() => {});

export default function AccountScreen() {
  const t = useT();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { token, mobile, signOut } = useAuth();
  const { profiles } = useProfiles();
  const [langOpen, setLangOpen] = useState(false);

  const currentLang = LANGS.find((l) => l.code === lang)?.label ?? 'English';
  const selfName = profiles.find((p) => p.relationship === 'self')?.fullName;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 110 /* clear the floating tab bar */ }}>
      <Text style={styles.h1}>Account</Text>

      {token ? (
        <Card style={{ marginTop: 16 }}>
          <View style={styles.signinRow}>
            <View style={styles.idAvatar}>
              <Text style={styles.idAvatarTxt}>{(selfName ?? 'I').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signinTitle}>{selfName ?? 'Investor'}</Text>
              <Text style={styles.signinSub}>
                {mobile ? `Signed in · +91 ${mobile}` : 'Signed in'}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

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

      {/* Only when signed in: these are settings on an ACCOUNT, and there is
          nothing to read or change without one. */}
      {token ? <SecurityCard token={token} t={t} /> : null}

      {/* About & Legal — the web trust pages (always current with the site) */}
      <Text style={styles.groupLbl}>ABOUT &amp; LEGAL</Text>
      <Card style={styles.group}>
        <Row
          icon={<NewsIcon size={19} color={ui.indigo} strokeWidth={1.8} />}
          iconBg={ui.indigoTint}
          label="About Investoyard"
          onPress={() => openSite('/about')}
        />
        <Row
          icon={<BookIcon size={19} color={ui.amber} strokeWidth={1.8} />}
          iconBg={ui.amberTint}
          label="Help & FAQs"
          onPress={() => openSite('/faqs')}
          divider
        />
        <Row
          icon={<DocsIcon size={19} color={ui.slate} strokeWidth={1.8} />}
          iconBg={ui.slateTint}
          label="Terms & Conditions"
          onPress={() => openSite('/terms')}
          divider
        />
        <Row
          icon={<DocsIcon size={19} color={ui.slate} strokeWidth={1.8} />}
          iconBg={ui.slateTint}
          label="Disclaimer"
          onPress={() => openSite('/disclaimer')}
          divider
        />
        <Row
          icon={<ShieldIcon size={19} color={ui.green} strokeWidth={1.8} />}
          iconBg={ui.greenTint}
          label="Privacy Policy"
          onPress={() => openSite('/privacy-policy')}
          divider
        />
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


/**
 * Sign-in & security — the customer's own choice of how they get in.
 *
 * MIRRORS `SecurityPanel` in `apps/web/components/Account.tsx` and must be kept
 * in step with it BY HAND: different frameworks, no shared component, the same
 * standing rule as the split UPI input and DematPanel.
 *
 * IT RENDERS THE SERVER'S OWN VIEW OF WHAT IS AVAILABLE (`available`), never its
 * own opinion of it — so a channel the server would refuse is disabled here and
 * the two cannot drift into offering what the other rejects.
 *
 * A CHIP ROW, NOT A PICKER: there is no native select on a phone, which is the
 * same reason the demat chooser is a chip row.
 */
function SecurityCard({ token, t }: { token: string; t: (k: string) => string }) {
  const [st, setSt] = useState<SecuritySettings | null>(null);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);

  useEffect(() => { getSecurity(token).then(setSt).catch(() => {}); }, [token]);

  /* Silent when it cannot be read. This card is an extra; an error banner over
     the account screen would read as something being wrong with the account. */
  if (!st) return null;

  const pwOk = pw.length >= 8 && /\d/.test(pw) && /[A-Za-z]/.test(pw);
  const reload = async () => { const next = await getSecurity(token); if (next) setSt(next); };

  const pick = async (channel: 'sms' | 'whatsapp') => {
    if (channel === st.otpChannel || busy) return;
    setBusy(true); setNote(null);
    const res = await setOtpChannel(token, channel);
    /* RE-READ rather than patching local state: the server is the authority on
       what it accepted, and it may refuse a channel this screen thought was
       available. */
    await reload();
    if (!res.ok) setNote({ bad: true, text: res.message ?? 'Could not change that.' });
    setBusy(false);
  };

  const save = async () => {
    setBusy(true); setNote(null);
    const res = await setPassword(token, pw);
    if (res.ok) { setPw(''); await reload(); setNote({ bad: false, text: t('security.saved') }); }
    else setNote({ bad: true, text: res.message ?? 'Could not save that password.' });
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true); setNote(null);
    const res = await clearPassword(token);
    if (res.ok) { await reload(); setNote({ bad: false, text: t('security.removed') }); }
    else setNote({ bad: true, text: res.message ?? 'Could not remove it.' });
    setBusy(false);
  };

  return (
    <>
      <Text style={styles.groupLbl}>{t('security.title').toUpperCase()}</Text>
      <Card style={styles.group}>
        <Pressable
          onPress={() => { animateNext(); setOpen((o) => !o); }}
          style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.6 }]}
        >
          <View style={[styles.iconChip, { backgroundColor: ui.indigoTint }]}>
            <LockIcon size={19} color={ui.indigo} />
          </View>
          <Text style={styles.rowLbl}>{t('security.channel')}</Text>
          <Text style={styles.rowVal}>
            {st.otpChannel === 'whatsapp' ? t('security.channelWhatsapp') : t('security.channelSms')}
          </Text>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronDownIcon size={15} color={ui.muted} strokeWidth={2} />
          </View>
        </Pressable>

        {open ? (
          <View style={styles.secBody}>
            <View style={styles.secChips}>
              {([
                ['sms', t('security.channelSms'), true],
                ['whatsapp', t('security.channelWhatsapp'), st.available.whatsapp],
              ] as const).map(([k, label, can]) => {
                const on = st.otpChannel === k;
                return (
                  <Pressable
                    key={k}
                    disabled={!can || busy}
                    onPress={() => pick(k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !can }}
                    style={[styles.secChip, on && styles.secChipOn, !can && { opacity: 0.45 }]}
                  >
                    <Text style={[styles.secChipTxt, on && styles.secChipTxtOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Shown rather than hidden: "not available yet" is worth knowing,
                where a missing option just looks like nobody thought of it. */}
            {!st.available.whatsapp ? (
              <Text style={styles.secHint}>{t('security.channelWaOff')}</Text>
            ) : null}

            <Text style={[microLabel, { marginTop: 18 }]}>{t('security.passwordTitle').toUpperCase()}</Text>
            <Text style={styles.secHint}>
              {st.hasPassword ? t('security.passwordSet') : t('security.passwordNone')}
            </Text>
            <TextInput
              style={styles.secInput}
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder={t('security.newPassword')}
              placeholderTextColor={ui.muted}
            />
            <Text style={styles.secHint}>{t('security.passwordRule')}</Text>
            <Button label={t('security.save')} onPress={save} busy={busy} disabled={!pwOk}
              style={{ marginTop: 12, height: 46 }} />
            {st.hasPassword ? (
              <Pressable onPress={remove} disabled={busy} hitSlop={8}
                style={({ pressed }) => [styles.secRemove, pressed && { opacity: 0.6 }]}>
                <Text style={styles.secRemoveTxt}>{t('security.remove')}</Text>
              </Pressable>
            ) : null}
            {note ? (
              <Text style={[styles.secNote, { color: note.bad ? ui.red : ui.green }]}>{note.text}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 24, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.5, color: ui.title },
  signinRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  idAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: ui.indigoTint, alignItems: 'center', justifyContent: 'center' },
  idAvatarTxt: { fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.indigo },
  signinTitle: { fontSize: 15, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  signinSub: { fontFamily: fonts.regular, fontSize: 12.5, color: ui.muted, marginTop: 2 },
  /* sign-in & security — mirrors the web panel's .sec-way / .sec-pwrow */
  secBody: { paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2 },
  secChips: { flexDirection: 'row', gap: 8 },
  secChip: { paddingHorizontal: 16, height: 36, borderRadius: 10, backgroundColor: ui.canvas, alignItems: 'center', justifyContent: 'center' },
  secChipOn: { backgroundColor: ui.indigoTint },
  secChipTxt: { fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  secChipTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  secHint: { marginTop: 8, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: ui.muted },
  secInput: {
    marginTop: 10, height: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: ui.canvas,
    fontSize: 15, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title,
  },
  secRemove: { alignSelf: 'center', marginTop: 12, padding: 6 },
  secRemoveTxt: { color: ui.red, fontSize: 13, fontFamily: fonts.bold, fontWeight: '700' },
  secNote: { marginTop: 12, fontFamily: fonts.semibold, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  groupLbl: { ...microLabel, marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  group: { paddingVertical: 4 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 6 },
  rowDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  iconChip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLbl: { flex: 1, fontSize: 15, fontFamily: fonts.medium, fontWeight: '500', color: ui.title },
  rowVal: { fontSize: 13, color: ui.muted, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'] },
  langs: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingTop: 4, paddingBottom: 12, paddingLeft: 48,
  },
  lang: {
    paddingHorizontal: 14, height: 36, borderRadius: 999, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  langOn: { backgroundColor: ui.indigo },
  langTxt: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  langTxtOn: { color: '#ffffff' },
  version: { fontSize: 12, color: ui.muted, textAlign: 'center', marginTop: 28, fontFamily: fonts.semibold, fontWeight: '600' },
  foot: { fontFamily: fonts.regular, fontSize: 11, color: ui.muted, lineHeight: 16, marginTop: 10, textAlign: 'center', paddingHorizontal: 8 },
});
