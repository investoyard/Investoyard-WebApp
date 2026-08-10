import { StyleSheet, Text, View } from 'react-native';
import { fonts, microLabel, ui } from '../../lib/theme';

/** Key-figure tile: UPPERCASE micro-label over a bold tabular-numeral value. */
export function StatTile({ label, value, hilite }: { label: string; value: string; hilite?: boolean }) {
  return (
    <View style={[styles.tile, hilite && styles.hilite]}>
      <Text style={styles.k} numberOfLines={1}>{label}</Text>
      <Text style={styles.v} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: ui.canvas,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  hilite: { backgroundColor: ui.indigoTint },
  k: { ...microLabel, fontSize: 11 },
  v: { fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 4, fontVariant: ['tabular-nums'] },
});
