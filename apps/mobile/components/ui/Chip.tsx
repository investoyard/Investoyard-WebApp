import { StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../../lib/theme';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'danger' | 'warn' | 'info' | 'gold' | 'listed' | 'closing';

/**
 * Soft-tinted pill palette.
 *
 * For IPO STATUS the tone comes from STAGE_TONE in @investoyard/shared-types,
 * which gives every status its OWN colour — no two statuses share one:
 *   success Live/Open Today · danger Closing Today · brand Upcoming/Pre Apply
 *   neutral Awaiting Allotment · gold Allotment Out · listed Listed
 *   closing Closing Today / Closed / Withdrawn
 * warn and info remain for non-status chips.
 */
const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: ui.slateTint, fg: ui.slate },
  brand: { bg: ui.indigoTint, fg: ui.indigo },
  success: { bg: ui.greenTint, fg: ui.green },
  danger: { bg: ui.redTint, fg: ui.red },
  warn: { bg: ui.amberTint, fg: ui.amber },
  info: { bg: ui.indigoTint, fg: ui.indigo },
  /** act TODAY — Closing Today and Allotment Out (see STAGE_TONE) */
  gold: { bg: '#FFF5D6', fg: '#8A6400' },
  /** listed issues — light purple with near-black ink (matches the web chip) */
  listed: { bg: '#E2D9F6', fg: '#241E3D' },
  /** the CLOSE family — Closing Today, Closed, Withdrawn. Web's --neg /
   *  --neg-soft exactly, because ui.red (#B3261E) is a different red. */
  closing: { bg: '#FCEBE8', fg: '#D8412A' },
};

/** Status pill — 6px dot prefix, radius 999, 11/700, 4×10 padding. */
export function Chip({ label, tone = 'neutral', dot = true }: { label: string; tone?: ChipTone; dot?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text style={[styles.txt, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  txt: { fontSize: 11, fontFamily: fonts.bold, fontWeight: '700' },
});
