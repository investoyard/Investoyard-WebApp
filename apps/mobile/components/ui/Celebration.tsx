import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../../lib/theme';
import { tapSuccess } from '../../lib/haptics';
import { CheckIcon } from './icons';

/** Brand-colored confetti palette — gold leads (the celebration accent). */
const COLORS = ['#FFCB32', '#FFCB32', ui.indigo, ui.green, '#8A79D9', '#FFB300'];
const PIECES = 18;

/**
 * One-shot confetti burst: pieces launch from the top-center, drift apart,
 * spin and fade over ~1.4s. Pure Animated (native driver), no packages.
 */
function Confetti() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: PIECES }).map((_, i) => {
        // deterministic pseudo-random spread per piece (no Math.random → stable renders)
        const seed = (i * 2654435761) % 1000 / 1000;
        const dx = (seed - 0.5) * 300;
        const dy = 90 + ((i * 7919) % 1000 / 1000) * 130;
        const rot = (seed - 0.5) * 720;
        const size = 6 + ((i * 104729) % 3) * 2;
        const color = COLORS[i % COLORS.length];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', top: 8, left: '50%', width: size, height: size * (i % 2 ? 1 : 0.55),
              borderRadius: i % 2 ? size / 2 : 2, backgroundColor: color,
              opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${rot}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * The apply-success moment: success haptic + confetti burst + check circle,
 * headline and clear next step. Mount it when the application is placed.
 */
export function SuccessMoment({ title, body }: { title: string; body?: string }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    tapSuccess();
    Animated.spring(pop, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <View style={styles.wrap}>
      <Confetti />
      <Animated.View style={[styles.circle, { transform: [{ scale: pop }] }]}>
        <CheckIcon size={30} color="#ffffff" strokeWidth={3} />
      </Animated.View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 26, overflow: 'hidden' },
  circle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: ui.green,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title, textAlign: 'center' },
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: ui.muted, textAlign: 'center', marginTop: 6, lineHeight: 20, paddingHorizontal: 12 },
});
