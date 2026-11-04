import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../lib/theme';
import { useGmpConsent } from './gmpConsent';
import { tapSuccess } from '../lib/haptics';

/**
 * The GMP awareness disclaimer (compliance). Original Investoyard wording,
 * operator-approved — do not reword without the operator.
 *
 * CONTROLLED BY `GmpConsentProvider` AND MOUNTED ONCE AT THE ROOT. It used to
 * own the acceptance flag itself and be mounted on Home alone, which is what
 * made consent a dismissal rather than a gate — see the note on gmpConsent.tsx.
 *
 * THE BACK BUTTON NO LONGER ACCEPTS. `onRequestClose` was wired to `accept`, so
 * Android hardware-back GRANTED the consent and recorded a server-side
 * `gmp_disclaimer` against a reader who had agreed to nothing. It can only
 * dismiss now — which is safe to do precisely BECAUSE the gate exists: before
 * it, a non-accepting close would have left the figures on screen anyway.
 */
const POINTS = [
  'Grey Market Premium (GMP) is an informal, unofficial number from the grey market — it is NOT published or endorsed by SEBI, the exchanges, or Investoyard.',
  'We show GMP for information only, collected from public sources. We may not update every IPO in real time and cannot verify accuracy — confirm precise figures with your broker.',
  'GMP is sentiment, not science: it can swing sharply near close, often reflects very few trades, and can fall further after listing.',
  'It is NOT a prediction of the listing price or allotment, and NOT investment advice or a recommendation from Investoyard.',
  'Investoyard informs and distributes — we are not SEBI-registered investment advisers and are not part of any grey market. Decide on fundamentals, the offer documents and your own judgment, or consult a registered adviser.',
  'No one — including Investoyard — accepts liability for decisions or losses based on GMP.',
];

export function GmpDialog() {
  const { asking, grant, dismiss } = useGmpConsent();
  if (!asking) return null;

  const accept = () => { tapSuccess(); grant(); };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
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
          {/* An explicit way out that is NOT acceptance. Without it the only
              visible action is the one that grants consent, which is how a
              disclaimer turns into a formality. */}
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 6, bottom: 10 }}
            style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.laterTxt}>Not now</Text>
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
  cta: {
    marginHorizontal: 16, marginTop: 16, minHeight: 52, borderRadius: 14, backgroundColor: '#6A3AB8',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTxt: { color: '#ffffff', fontSize: 15.5, fontFamily: fonts.bold, fontWeight: '700' },
  later: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginBottom: 4 },
  laterTxt: { fontSize: 13, fontFamily: fonts.medium, color: ui.slate },
});
