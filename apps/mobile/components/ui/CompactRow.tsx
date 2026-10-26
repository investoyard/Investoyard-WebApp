import { Pressable, StyleSheet, Text, View } from 'react-native';
import { titleCase } from '../../lib/format';
import type { IpoFull } from '../../lib/ipoCalc';
import { fonts, ui } from '../../lib/theme';
import { CompanyLogo } from './CompanyLogo';
import { ChevronRightIcon } from './icons';

/**
 * One dense IPO row — logo, name, symbol/board, a caller-supplied figure, chevron.
 *
 * It lived inside the home screen until 2026-10-26, when the archive screen
 * needed the same row. A second copy of a presentation component is precisely
 * how two surfaces drift apart, so it moved here VERBATIM rather than being
 * reimplemented — the home screen should look identical after the move, which
 * is the point.
 *
 * `right` is a node rather than a string because each caller shows a different
 * figure in that slot: the home screen shows "Opens 28 Oct" or a listing gain,
 * the archive shows when the issue closed.
 */
export function CompactRow({ ipo, right, divider, onPress }: {
  ipo: IpoFull;
  right: React.ReactNode;
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compactRow, divider && styles.compactDivider, pressed && { opacity: 0.7 }]}
    >
      <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.compactName} numberOfLines={1}>{titleCase(ipo.name)}</Text>
        <Text style={styles.compactSym} numberOfLines={1}>{ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}</Text>
      </View>
      {right}
      <ChevronRightIcon size={15} color={ui.muted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  compactDivider: { borderTopWidth: 1, borderTopColor: ui.divider },
  compactName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  compactSym: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
});
