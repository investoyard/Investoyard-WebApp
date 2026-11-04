import { StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../../lib/theme';

export type ChipTone =
  | 'neutral' | 'brand' | 'success' | 'danger' | 'warn' | 'info'
  | 'preapply' | 'awaiting' | 'gold' | 'listed' | 'closing';

/**
 * Soft-tinted pill palette.
 *
 * THIS TABLE IS THE STATUS COLOUR CODE ON MOBILE - a legend, not a mood. It
 * mirrors STAGE_TONE in @investoyard/shared-types, where every status has its
 * OWN colour and no two share one:
 *
 *   success   Live, Open Today        (Open Today IS Live on day one)
 *   closing   Closing Today, Closed, Withdrawn  (one event, caught at
 *                                      different moments)
 *   preapply  Pre Apply               lighter indigo
 *   brand     Upcoming                full brand indigo
 *   awaiting  Awaiting Allotment      teal
 *   gold      Allotment Out
 *   listed    Listed
 *
 * `neutral`, `warn`, `info` and `danger` are for NON-status chips and must not
 * be given a status: a status wearing a generic tone is how the drift below
 * happened in the first place.
 *
 * TWO DRIFTS AGAINST THAT LEGEND WERE FIXED HERE 2026-11-04, and the docblock
 * had been asserting both as correct:
 *  - Awaiting Allotment was `neutral` GREY. Web moved it to teal on 2026-09-02
 *    because grey reads as the ABSENCE of a status rather than a status, and
 *    teal is the one family no other status uses. Measured: dE >= 39.7 from
 *    every other status ink, so it is unmistakable.
 *  - Pre Apply and Upcoming BOTH sat on `brand`, i.e. one swatch for two
 *    statuses, which is the single thing this legend exists to prevent.
 *
 * NOT WEB'S EXACT PRE-APPLY HEX, and the reason is a measurement: web's own
 * ink (#7565BD on #F3F1FB) is 4.32:1 and FAILS WCAG AA, and this chip is 11px
 * bold, which is not "large text", so the 4.5 bar applies. #6356AB is 5.45:1
 * and still dE 16.7 from Upcoming's indigo - web's intent, made legible.
 * WEB HAS THE SAME DEFECT on its own .status chip (12px/600); fixing that is
 * its own change.
 *
 * DARK: five of these are literal hex because `ui` is statically the light
 * palette (DARK_ENABLED=false). When dark is audited this whole table needs
 * dark counterparts - that debt predates these two tones, it is not new.
 */
const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: ui.slateTint, fg: ui.slate },
  brand: { bg: ui.indigoTint, fg: ui.indigo },
  success: { bg: ui.greenTint, fg: ui.green },
  danger: { bg: ui.redTint, fg: ui.red },
  warn: { bg: ui.amberTint, fg: ui.amber },
  info: { bg: ui.indigoTint, fg: ui.indigo },
  /** Pre Apply — the lighter indigo, so it cannot be read as Upcoming. */
  preapply: { bg: '#F3F1FB', fg: '#6356AB' },
  /** Awaiting Allotment — teal, web's own --tone-soft / --tone-ink exactly. */
  awaiting: { bg: '#E2F2F4', fg: '#1C6570' },
  /** Allotment Out. Gold is this status ALONE — an earlier design grouped it
   *  with Closing Today as "act today" and that grouping was rejected. */
  gold: { bg: '#FFF5D6', fg: '#8A6400' },
  /** listed issues — light purple with near-black ink (matches the web chip) */
  listed: { bg: '#E2D9F6', fg: '#241E3D' },
  /** the CLOSE family - Closing Today, Closed, Withdrawn. Web's --neg-soft
   *  with web's --neg-INK, not its --neg: #D8412A on this tint measures
   *  3.86:1 and FAILS AA - the identical figure web measured before promoting
   *  --neg-ink for exactly this pairing. Mobile had copied the failing pair
   *  verbatim and not the fix. #B3372E is 5.19:1 and only dE 17.2 away, so it
   *  reads as the same red. NOT ui.red (#B3261E), which passes too but is a
   *  different red - the close family tracks web deliberately. */
  closing: { bg: '#FCEBE8', fg: '#B3372E' },
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
