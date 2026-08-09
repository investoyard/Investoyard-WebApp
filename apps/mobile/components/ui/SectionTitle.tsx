import { StyleSheet, Text, View } from 'react-native';
import { ui } from '../../lib/theme';

/** 16/700 section header with optional right-side meta text. */
export function SectionTitle({ label, meta, style }: { label: string; meta?: string; style?: object }) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{label}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, paddingHorizontal: 2 },
  label: { fontSize: 16, fontWeight: '700', color: ui.title, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: ui.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
