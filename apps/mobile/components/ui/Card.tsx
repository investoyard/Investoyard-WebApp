import { Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { shadowCard, ui } from '../../lib/theme';

/** Elevated surface card: radius 20, no border, soft shadow. Pressable when onPress given. */
export function Card({ children, style, onPress }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ui.card,
    borderRadius: 20,
    padding: 16,
    ...shadowCard,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
});
