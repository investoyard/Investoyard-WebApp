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

/** Ready-made card-shaped skeleton for list screens. */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton w={44} h={44} r={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton w="70%" h={14} />
          <Skeleton w="40%" h={11} />
        </View>
      </View>
      <View style={{ gap: 10, marginTop: 16 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} w={i === lines - 1 ? '55%' : '100%'} h={12} />
        ))}
      </View>
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
});
