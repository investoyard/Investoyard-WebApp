import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { requestOtp, verifyOtp } from '../lib/api';

export default function LoginScreen() {
  const t = useT();
  const router = useRouter();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onGetOtp = async () => {
    if (!/^\d{10}$/.test(mobile)) { setError('Enter a valid 10-digit mobile'); return; }
    setBusy(true); setError(null);
    const { requestId } = await requestOtp(mobile);
    setRequestId(requestId); setBusy(false);
  };

  const onVerify = async () => {
    if (!requestId) return;
    setBusy(true); setError(null);
    const res = await verifyOtp(requestId, otp);
    setBusy(false);
    if (res?.accessToken) { signIn(res.accessToken); router.back(); }
    else setError('Invalid code');
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>{t('login.title')}</Text>
      <Text style={styles.muted}>{t('login.subtitle')}</Text>

      <Text style={styles.label}>{t('login.mobile')}</Text>
      <TextInput
        style={styles.input} value={mobile} onChangeText={setMobile}
        keyboardType="number-pad" maxLength={10} placeholder="9876543210" editable={!requestId}
      />

      {!requestId ? (
        <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onGetOtp} disabled={busy}>
          <Text style={styles.btnText}>{t('login.getOtp')}</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.label}>{t('login.enterOtp')}</Text>
          <TextInput
            style={styles.input} value={otp} onChangeText={setOtp}
            keyboardType="number-pad" maxLength={6} placeholder="••••••"
          />
          <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerify} disabled={busy}>
            <Text style={styles.btnText}>{t('login.verify')}</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  h1: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginTop: 8 },
  muted: { color: colors.textMuted, fontSize: 15, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 22, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 17, color: colors.text, backgroundColor: colors.surface },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
  error: { color: colors.state.danger, marginTop: 14 },
});
