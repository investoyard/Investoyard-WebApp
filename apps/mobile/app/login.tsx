/**
 * Login — full brand moment: gradient background, white logo chip + wordmark,
 * bottom white sheet (radius 24) with the mobile → OTP flow. Auth logic is
 * unchanged (requestOtp → verifyOtp → signIn → back).
 */
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { microLabel, ui } from '../lib/theme';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { requestOtp, verifyOtp } from '../lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const otpRef = useRef<TextInput>(null);

  // full-screen gradient → light status bar while this modal is up
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  const onGetOtp = async () => {
    if (!/^\d{10}$/.test(mobile)) { setError('Enter a valid 10-digit mobile'); return; }
    setBusy(true); setError(null);
    const { requestId } = await requestOtp(mobile);
    setRequestId(requestId); setBusy(false);
    setTimeout(() => otpRef.current?.focus(), 250);
  };

  const onVerify = async () => {
    if (!requestId) return;
    setBusy(true); setError(null);
    const res = await verifyOtp(requestId, otp);
    setBusy(false);
    if (res?.accessToken) { signIn(res.accessToken, mobile); router.back(); }
    else setError('Invalid code');
  };

  const onResend = async () => {
    if (busy) return;
    setOtp(''); setError(null);
    setBusy(true);
    const { requestId } = await requestOtp(mobile);
    setRequestId(requestId); setBusy(false);
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
        <View style={styles.logoChip}><Logo height={22} /></View>
        <Text style={styles.brandName}>Investoyard</Text>
        <Text style={styles.tagline}>Investing in IPOs, has never been this easy.</Text>
      </View>

      {/* bottom sheet */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
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
                    onChangeText={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="98765 43210"
                    placeholderTextColor={ui.muted}
                    autoFocus
                  />
                </View>
                <Button label="Continue" onPress={onGetOtp} busy={busy} style={styles.cta} />
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>{t('login.enterOtp')}</Text>
                <Text style={styles.sheetSub}>Sent to +91 {mobile}</Text>

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
                <Button label={t('login.verify')} onPress={onVerify} busy={busy} disabled={otp.length < OTP_LEN} style={styles.cta} />
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
  closeTxt: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  brand: { alignItems: 'center', paddingHorizontal: 24 },
  logoChip: { backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  brandName: { color: '#ffffff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 16 },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24,
  },
  sheetTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: ui.title },
  sheetSub: { fontSize: 13.5, color: ui.muted, marginTop: 4, lineHeight: 19 },
  micro: { ...microLabel, marginTop: 22, marginBottom: 8 },
  mobileRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    height: 52, borderRadius: 12, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
  },
  prefixTxt: { fontSize: 16, fontWeight: '700', color: ui.slate },
  input: {
    flex: 1, height: 52, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 17, fontWeight: '600', color: ui.title, backgroundColor: ui.canvas,
    fontVariant: ['tabular-nums'],
  },
  cta: { marginTop: 20, height: 52, borderRadius: 14 },
  otpRow: { flexDirection: 'row', gap: 8, marginTop: 22, justifyContent: 'center' },
  otpBox: {
    width: 44, height: 52, borderRadius: 12, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  otpBoxOn: { borderColor: ui.indigo, backgroundColor: '#ffffff' },
  otpChar: { fontSize: 20, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { alignSelf: 'center', marginTop: 16, padding: 6 },
  resendTxt: { color: ui.indigo, fontSize: 13.5, fontWeight: '700' },
  error: { color: ui.red, marginTop: 12, fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
});
