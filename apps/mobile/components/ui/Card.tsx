import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { shadowCard, ui } from '../../lib/theme';
import { PressableScale } from './motion';

/** Elevated surface card: radius 20, no border, soft shadow.
 *  Pressable cards get the unified spring press physics (scale 0.985). */
export function Card({ children, style, onPress }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={[styles.card, style]}>
        {children}
      </PressableScale>
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
});
