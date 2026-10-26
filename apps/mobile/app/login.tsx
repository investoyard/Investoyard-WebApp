/**
 * Login — full brand moment: gradient background, white logo chip + wordmark,
 * bottom white sheet (radius 24) with the mobile → OTP flow. Auth logic is
 * unchanged (requestOtp → verifyOtp → signIn → back).
 */
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { fonts, microLabel, ui } from '../lib/theme';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { requestOtp, requestOtpResult, verifyOtp, passwordLogin } from '../lib/api';
import { tapSuccess } from '../lib/haptics';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { BrandGradient } from '../components/ui/Gradient';

const OTP_LEN = 6;

export default function LoginScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  // Revealed only when the server says this mobile has no account yet.
  const [needName, setNeedName] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Which door. BOTH are always offered: the only way to know whether THIS
     number has a password is to ask about a specific account, which is the
     question a login screen must not answer. A password attempt on an account
     without one therefore fails like any wrong password, and the hint below the
     field carries the way out. */
  const [way, setWay] = useState<'otp' | 'password'>('otp');
  const [password, setPassword] = useState('');
  /* Which channel actually carried the code, as the server reports it — a
     person watching the wrong app concludes it never arrived. */
  const [sentVia, setSentVia] = useState<'sms' | 'whatsapp'>('sms');
  const [otpFocused, setOtpFocused] = useState(false);
  const otpRef = useRef<ComponentRef<typeof TextInput>>(null);

  // full-screen gradient → light status bar while this modal is up
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  /*
   * EVERY handler catches. `requestOtp` used to fall back to a `mock-` request
   * id and `verifyOtp` used to accept 123456 client-side, so neither could ever
   * fail and none of these needed a catch. Now that an unreachable server fails
   * honestly, an uncaught rejection would leave `busy` true and the button
   * spinning for ever — which is a worse bug than the one being removed.
   */
  const msg = (e: unknown) => String((e as any)?.message ?? e) || 'Something went wrong. Please try again.';

  const onGetOtp = async () => {
    if (!/^\d{10}$/.test(mobile)) { setError('Enter a valid 10-digit mobile'); return; }
    /* The name field appears on THIS step once the server says there is no
       account, so a new customer gives their name before a code is sent
       rather than after. Second press sends it as a signup. */
    if (needName && name.trim().length < 2) { setError('Please enter your name to create the account'); return; }
    setBusy(true); setError(null);
    const r = await requestOtpResult(mobile, needName ? 'signup' : 'signin');
    setBusy(false);
    if (r.ok) {
      setRequestId(r.requestId);
      setSentVia(r.channel === 'whatsapp' ? 'whatsapp' : 'sms');
      setTimeout(() => otpRef.current?.focus(), 250);
      return;
    }
    if (r.reason === 'no_account') { setNeedName(true); setError(null); return; }
    if (r.reason === 'have_account') { setNeedName(false); setError(r.message ?? 'You already have an account \u2014 just continue.'); return; }
    if (r.reason === 'unreachable') { setError('Could not reach Investoyard. Check your connection.'); return; }
    setError(r.message ?? 'Could not send the code.');
  };

  const onPasswordSignIn = async () => {
    if (!/^d{10}$/.test(mobile)) { setError('Enter a valid 10-digit mobile'); return; }
    setBusy(true); setError(null);
    try {
      const res = await passwordLogin(mobile, password);
      if (res.ok) { tapSuccess(); signIn(res.accessToken, mobile); router.back(); return; }
      if (res.reason === 'unreachable') { setError('Could not reach Investoyard. Check your connection.'); return; }
      /* The server answers every password failure identically, so there is
         nothing to branch on. Its own wording is used because it is the one
         that names the way out. */
      setError(res.message ?? 'Mobile number or password is incorrect.');
    } catch (e) {
      setError(msg(e));
    } finally { setBusy(false); }
  };

  const onVerify = async () => {
    if (!requestId) return;
    setBusy(true); setError(null);
    try {
      /* The name is sent only once the server has told us this number has no
         account — so an existing user is never asked for it, and a new one is
         asked exactly once, on the screen they are already on. A separate
         signup route would be a second thing to navigate on a phone for a
         difference of one field. */
      const res = await verifyOtp(requestId, otp, needName ? name.trim() : undefined);
      if (res.ok) { tapSuccess(); signIn(res.accessToken, mobile); router.back(); return; }
      if (res.reason === 'no_account') {
        setNeedName(true);
        setError(needName ? 'Please enter your name to create the account' : null);
        return;
      }
      if (res.reason === 'unreachable') { setError('Could not reach Investoyard. Check your connection.'); return; }
      setError(res.message ?? 'Invalid code');
    } catch (e) {
      setError(msg(e));
    } finally { setBusy(false); }
  };

  const onResend = async () => {
    if (busy) return;
    setOtp(''); setError(null);
    setBusy(true);
    try {
      const { requestId, channel } = await requestOtp(mobile, needName ? 'signup' : 'signin');
      setRequestId(requestId);
      setSentVia(channel === 'whatsapp' ? 'whatsapp' : 'sms');
    } catch (e) {
      setError(msg(e));
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.screen}>
      <BrandGradient />
      {/* close (modal has no header) */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => [styles.close, { top: insets.top + 10 }, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.closeTxt}>✕</Text>
      </Pressable>

      {/* brand block */}
      <View style={[styles.brand, { paddingTop: insets.top + 64 }]}>
        <Logo height={34} variant="light" />
        <Text style={styles.tagline}>Investing in IPOs, has never been this easy.</Text>
      </View>

      {/* bottom sheet — 'padding' on BOTH platforms: SDK 54 Android is edge-to-edge,
          so the OS no longer resizes the window for the keyboard (sheet was hidden) */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {!requestId ? (
              <>
                <Text style={styles.sheetTitle}>{t('login.title')}</Text>
                <Text style={styles.sheetSub}>{t('login.subtitle')}</Text>

                <Text style={styles.micro}>MOBILE NUMBER</Text>
                <View style={styles.mobileRow}>
                  <View style={styles.prefix}><Text style={styles.prefixTxt}>+91</Text></View>
                  <TextInput
                    style={styles.input}
                    value={mobile}
                    onChangeText={(v) => { setMobile(v.replace(/\D/g, '').slice(0, 10)); setNeedName(false); setError(null); }}
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="98765 43210"
                    placeholderTextColor={ui.muted}
                    autoFocus
                  />
                </View>
                {/* Shown only before a code is on its way: once it has been sent
                    the choice is made, and a toggle there would discard it. */}
                <View style={styles.wayRow}>
                  {([
                    ['otp', t('login.wayOtp')],
                    ['password', t('login.wayPassword')],
                  ] as const).map(([k, label]) => (
                    <Pressable
                      key={k}
                      accessibilityRole="button"
                      accessibilityState={{ selected: way === k }}
                      onPress={() => { setWay(k); setError(null); }}
                      style={[styles.wayBtn, way === k && styles.wayBtnOn]}
                    >
                      <Text style={[styles.wayTxt, way === k && styles.wayTxtOn]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                {way === 'password' && (
                  <>
                    <Text style={styles.micro}>{t('login.password').toUpperCase()}</Text>
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="current-password"
                      placeholderTextColor={ui.muted}
                    />
                    <Text style={styles.forgot}>{t('login.forgot')}</Text>
                  </>
                )}

                {/* THE NAME IS ASKED BEFORE A CODE IS SENT, not after. The server
                    now answers the wrong door at this step, so a new customer gives
                    their name here and the first SMS they receive is one that
                    actually signs them up — rather than paying for a code, typing
                    it, and only then being told to start again. */}
                {needName && way === 'otp' && (
                  <View style={styles.newUser}>
                    <Text style={styles.newUserTitle}>Welcome — let’s create your account</Text>
                    <Text style={styles.newUserSub}>
                      There’s no account on +91 {mobile} yet. Tell us your name and we’ll set one up.
                    </Text>
                    <TextInput
                      style={styles.nameInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="Full name"
                      placeholderTextColor={ui.muted}
                      autoCapitalize="words"
                      maxLength={60}
                      autoFocus
                    />
                  </View>
                )}

                {way === 'otp' ? (
                  <Button label={needName ? 'Create account' : 'Continue'} onPress={onGetOtp} busy={busy}
                    disabled={needName && name.trim().length < 2} style={styles.cta} />
                ) : (
                  <Button label={t('login.signIn')} onPress={onPasswordSignIn} busy={busy}
                    disabled={mobile.length < 10 || password.length < 1} style={styles.cta} />
                )}
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>{t('login.enterOtp')}</Text>
                <Text style={styles.sheetSub}>
                  {sentVia === 'whatsapp' ? t('login.sentWhatsapp') : t('login.sentSms')} +91 {mobile}
                </Text>

                {/* 6-box OTP — one hidden input drives the boxes */}
                <Pressable style={styles.otpRow} onPress={() => otpRef.current?.focus()}>
                  {Array.from({ length: OTP_LEN }).map((_, i) => {
                    const active = otpFocused && otp.length === i;
                    return (
                      <View key={i} style={[styles.otpBox, active && styles.otpBoxOn]}>
                        <Text style={styles.otpChar}>{otp[i] ?? ''}</Text>
                      </View>
                    );
                  })}
                </Pressable>
                <TextInput
                  ref={otpRef}
                  style={styles.hiddenInput}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, OTP_LEN))}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  keyboardType="number-pad"
                  maxLength={OTP_LEN}
                  autoFocus
                />
                <Button label={needName ? 'Create account' : t('login.verify')} onPress={onVerify} busy={busy}
                  disabled={otp.length < OTP_LEN} style={styles.cta} />
                <Pressable onPress={onResend} hitSlop={8} style={({ pressed }) => [styles.resend, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.resendTxt}>{t('login.resend')}</Text>
                </Pressable>
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.gradBottom },
  close: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeTxt: { color: '#ffffff', fontSize: 15, fontFamily: fonts.bold, fontWeight: '700' },
  brand: { alignItems: 'center', paddingHorizontal: 24 },
  logoChip: { backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: fonts.medium, fontWeight: '500', marginTop: 14, textAlign: 'center' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24,
  },
  sheetTitle: { fontSize: 19, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.4, color: ui.title },
  sheetSub: { fontFamily: fonts.regular, fontSize: 13.5, color: ui.muted, marginTop: 4, lineHeight: 19 },
  micro: { ...microLabel, marginTop: 22, marginBottom: 8 },
  mobileRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    height: 52, borderRadius: 12, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
  },
  prefixTxt: { fontSize: 16, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  input: {
    flex: 1, height: 52, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 17, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, backgroundColor: ui.canvas,
    fontVariant: ['tabular-nums'],
  },
  /* The sign-in-method toggle. Mirrors web’s `.lg-way` + `.seg`; kept in step
     by hand, the same standing rule as the split UPI input and DematPanel. */
  wayRow: { flexDirection: 'row', backgroundColor: ui.canvas, borderRadius: 12, padding: 3, marginTop: 20, gap: 2 },
  wayBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wayBtnOn: { backgroundColor: '#ffffff' },
  wayTxt: { fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  wayTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  forgot: { marginTop: 10, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: ui.muted },
  newUser: { marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: ui.canvas },
  newUserTitle: { fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title },
  newUserSub: { marginTop: 4, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: ui.muted },
  nameInput: {
    marginTop: 10, height: 52, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 17, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, backgroundColor: '#ffffff',
  },
  cta: { marginTop: 20, height: 52, borderRadius: 14 },
  otpRow: { flexDirection: 'row', gap: 8, marginTop: 22, justifyContent: 'center' },
  otpBox: {
    width: 44, height: 52, borderRadius: 12, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  otpBoxOn: { borderColor: ui.indigo, backgroundColor: '#ffffff' },
  otpChar: { fontSize: 20, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { alignSelf: 'center', marginTop: 16, padding: 6 },
  resendTxt: { color: ui.indigo, fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700' },
  error: { color: ui.red, marginTop: 12, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', textAlign: 'center' },
});
