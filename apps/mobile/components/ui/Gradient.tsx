import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ui } from '../../lib/theme';

let uid = 0;

/**
 * Brand gradient fill (react-native-svg — no extra packages).
 * Absolutely positioned behind content; wrap in an overflow-hidden container
 * to get rounded corners.
 */
export function BrandGradient({ from = ui.gradTop, to = ui.gradBottom, style }: {
  from?: string;
  to?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `iy-grad-${++uid}`;
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
