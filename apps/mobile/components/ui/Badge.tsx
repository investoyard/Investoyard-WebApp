import { StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../../lib/theme';
import { CheckIcon } from './icons';

export type BadgeTone = 'ok' | 'wait' | 'info' | 'neutral';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: ui.greenTint, fg: ui.green },
  wait: { bg: ui.amberTint, fg: ui.amber },
  info: { bg: ui.indigoTint, fg: ui.indigo },
  neutral: { bg: ui.slateTint, fg: ui.slate },
};

/** Tiny soft badge pill (KYC ✓, UPI ✓, Bank ✓, demat info) with optional check mark. */
export function Badge({ label, tone = 'neutral', check }: { label: string; tone?: BadgeTone; check?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {check ? <CheckIcon size={12} color={t.fg} strokeWidth={2.6} /> : null}
      <Text style={[styles.txt, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  txt: { fontSize: 11.5, fontFamily: fonts.bold, fontWeight: '700' },
});
