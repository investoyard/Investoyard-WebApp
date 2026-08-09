/**
 * Elevated fintech design language (Groww/Kite-grade) for the mobile app.
 * Complements @investoyard/design-tokens with the app-specific surface system:
 * grey canvas, borderless elevated white cards, tinted pills, micro-labels.
 */
import { Platform, LayoutAnimation, UIManager, TextStyle, ViewStyle } from 'react-native';

export const ui = {
  canvas: '#F6F7FB',
  card: '#FFFFFF',
  divider: '#EEF0F5',
  /** near-black display/title ink */
  title: '#171A23',
  /** body text */
  body: '#3A3F4B',
  /** micro-labels / secondary */
  muted: '#8A90A0',
  indigo: '#3C2E7E',
  indigoTint: '#EEEBFA',
  gradTop: '#46368F',
  gradBottom: '#2A1F5E',
  green: '#167A3D',
  greenTint: '#E7F6EC',
  amber: '#92600A',
  amberTint: '#FFF4DC',
  red: '#B3261E',
  redTint: '#FDECEC',
  slate: '#5A6070',
  slateTint: '#EEF0F5',
  skeleton: '#E9EBF2',
} as const;

/** Soft card elevation — iOS shadow + Android elevation (no visible borders). */
export const shadowCard: ViewStyle = Platform.select<ViewStyle>({
  ios: { shadowColor: '#1A1440', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 3, shadowColor: '#1A1440' },
});

/** 11-12/700 UPPERCASE micro-label. */
export const microLabel: TextStyle = {
  fontSize: 11.5,
  fontWeight: '700',
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: ui.muted,
};

/** Enable LayoutAnimation on Android (call once from the root layout). */
export function enableLayoutAnimation() {
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

/** Animate the next layout pass (accordion open/close, list section swaps). */
export function animateNext() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}
