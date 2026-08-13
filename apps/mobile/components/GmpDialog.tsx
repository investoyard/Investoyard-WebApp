import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fonts, ui } from '../lib/theme';
import { useAuth } from './auth';
import { grantConsent } from '../lib/api';
import { tapSuccess } from '../lib/haptics';

/**
 * One-time GMP awareness dialog (compliance) — shown the first time the user
 * opens the Home feed (where grey-market figures appear). Acceptance is stored
 * on-device and, when signed in, recorded server-side as a 'gmp_disclaimer'
 * consent (gmp-v2). Original Investoyard wording (operator-approved).
 */
const VERSION = 'gmp-v2';
const KEY = `iy_gmp_consent_${VERSION}`;

const POINTS = [
  'Grey Market Premium (GMP) is an informal, unofficial number from the grey market — it is NOT published or endorsed by SEBI, the exchanges, or Investoyard.',
  'We show GMP for information only, collected from public sources. We may not update every IPO in real time and cannot verify accuracy — confirm precise figures with your broker.',
  'GMP is sentiment, not science: it can swing sharply near close, often reflects very few trades, and can fall further after listing.',
  'It is NOT a prediction of the listing price or allotment, and NOT investment advice or a recommendation from Investoyard.',
  'Investoyard informs and distributes — we are not SEBI-registered investment advisers and are not part of any grey market. Decide on fundamentals, the offer documents and your own judgment, or consult a registered adviser.',
  'No one — including Investoyard — accepts liability for decisions or losses based on GMP.',
];

export function GmpDialog() {
  const { token } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => { if (!v) setShow(true); }).catch(() => {});
  }, []);

  const accept = () => {
    tapSuccess();
    void SecureStore.setItemAsync(KEY, new Date().toISOString());
    if (token) void grantConsent(token, 'gmp_disclaimer', VERSION);
    setShow(false);
  };

  if (!show) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={accept}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.headTxt}>⚠️ Before you view GMP figures</Text>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.body}>
            {POINTS.map((p) => (
              <View key={p} style={styles.li}>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.liTxt}>{p}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={accept} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}>
            <Text style={styles.ctaTxt}>I Understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(18,14,40,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#F6F0FD', borderRadius: 24, overflow: 'hidden' },
  head: { backgroundColor: '#EDE3FB', paddingHorizontal: 18, paddingVertical: 16 },
  headTxt: { fontSize: 15.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo, lineHeight: 21 },
  body: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  li: { flexDirection: 'row', gap: 8 },
  dot: { color: ui.title, fontSize: 14, lineHeight: 21 },
  liTxt: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: ui.title, lineHeight: 21 },
  liBold: { fontFamily: fonts.bold, fontWeight: '700' },
  h2: { fontSize: 16.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 8 },
  cta: {
    margin: 16, height: 52, borderRadius: 14, backgroundColor: '#6A3AB8',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTxt: { color: '#ffffff', fontSize: 15.5, fontFamily: fonts.bold, fontWeight: '700' },
});
