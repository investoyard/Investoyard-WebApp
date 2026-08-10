import { StyleSheet, Text, View } from 'react-native';
import { ui } from '../../lib/theme';

/** 16/700 section header with optional right-side meta text.
 *  `tick` renders the small brand-gold block before the label — used exactly
 *  once (the "Open now" section) so the gold stays scarce and premium. */
export function SectionTitle({ label, meta, tick, style }: {
  label: string;
  meta?: string;
  tick?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {tick ? <View style={styles.tick} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, paddingHorizontal: 2 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tick: { width: 4, height: 16, borderRadius: 2, backgroundColor: '#FFCB32' },
  label: { fontSize: 16, fontWeight: '700', color: ui.title, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: ui.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
