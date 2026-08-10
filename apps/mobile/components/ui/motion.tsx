/**
 * Motion primitives — entrance stagger, count-up figures, spring press physics.
 * Built on the RN Animated API only (native driver wherever possible).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native';

/** Fade in + rise 12px on mount; `index` staggers siblings by 60ms. */
export function FadeInUp({ index = 0, children, style }: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 60, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 320, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, [opacity, shift, index]);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY: shift }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * Counts 0 → value once (~600ms) on the first non-zero value, then snaps on
 * later updates. One of the two sanctioned setState-per-frame animations.
 */
export function CountUp({ value, duration = 600, style }: {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [display, setDisplay] = useState(0);
  const animated = useRef(false);
  useEffect(() => {
    if (animated.current || value === 0) {
      setDisplay(value);
      return;
    }
    animated.current = true;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: x }) => setDisplay(Math.round(x)));
    Animated.timing(v, { toValue: value, duration, useNativeDriver: false }).start(() => {
      v.removeListener(id);
      setDisplay(value);
    });
    return () => v.removeListener(id);
  }, [value, duration]);
  return <Animated.Text style={style}>{display}</Animated.Text>;
}

/** Unified press physics: spring to 0.985 on press-in, back on press-out. */
export function PressableScale({ onPress, disabled, style, children }: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(0.985)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
