import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle, StyleProp } from 'react-native';
import { ui } from '../../lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** 48px button, radius 14, 15/700 label, pressed scale 0.98. Ghost = indigo tint bg. */
export function Button({ label, onPress, variant = 'primary', disabled, busy, small, style }: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = styles[variant];
  const vt = txtStyles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.base, small && styles.small, v, style,
        (disabled || busy) && styles.disabled,
        pressed && !disabled && !busy && styles.pressed,
      ]}
    >
      {busy
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : ui.indigo} />
        : <Text style={[styles.txtBase, small && styles.txtSmall, vt]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, flexDirection: 'row' },
  small: { height: 40, borderRadius: 12, paddingHorizontal: 14 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  disabled: { opacity: 0.45 },
  primary: { backgroundColor: ui.indigo },
  secondary: { backgroundColor: ui.indigoTint },
  ghost: { backgroundColor: ui.indigoTint },
  danger: { backgroundColor: ui.redTint },
  txtBase: { fontSize: 15, fontWeight: '700' },
  txtSmall: { fontSize: 13.5 },
});

const txtStyles = StyleSheet.create({
  primary: { color: '#ffffff' },
  secondary: { color: ui.indigo },
  ghost: { color: ui.indigo },
  danger: { color: ui.red },
});
