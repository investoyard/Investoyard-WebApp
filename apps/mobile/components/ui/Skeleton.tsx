import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { shadowCard, ui } from '../../lib/theme';

/** Pulsing skeleton block (opacity 0.5 ↔ 1 loop). Never show "Loading…" text. */
export function Skeleton({ w = '100%', h = 16, r = 10, style }: {
  w?: DimensionValue;
  h?: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: r, backgroundColor: ui.skeleton, opacity: pulse }, style]}
    />
  );
}

/** Card-shaped skeleton mirroring the REAL IPO card anatomy:
 *  logo circle + two text bars, then the 3-col stat strip, then a CTA bar. */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      {/* identity row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton w={44} h={44} r={22} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton w="68%" h={14} />
          <Skeleton w="38%" h={11} />
        </View>
        <Skeleton w={58} h={22} r={999} />
      </View>
      {/* 3-col stat strip */}
      <View style={styles.statStrip}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.statCol}>
            <Skeleton w={52} h={9} r={5} />
            <Skeleton w={64} h={14} r={7} style={{ marginTop: 7 }} />
          </View>
        ))}
      </View>
      {/* body lines + CTA */}
      {lines > 1 ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {Array.from({ length: lines - 1 }).map((_, i) => (
            <Skeleton key={i} w={i === lines - 2 ? '52%' : '100%'} h={11} />
          ))}
        </View>
      ) : null}
      <Skeleton h={44} r={14} style={{ marginTop: 14 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ui.card,
    borderRadius: 20,
    padding: 16,
    ...shadowCard,
  },
  statStrip: {
    flexDirection: 'row',
    backgroundColor: ui.canvas,
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
  statCol: { flex: 1, alignItems: 'center' },
});
