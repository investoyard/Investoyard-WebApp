import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, animateNext, ui } from '../../lib/theme';
import { ChevronDownIcon } from './icons';

/**
 * In-card accordion row — expands inline with LayoutAnimation (no page jump).
 * 48px header for a comfortable tap target; chevron flips when open.
 */
export function ExpandTile({ title, value, children, initiallyOpen }: {
  title: string;
  /** optional right-aligned summary value shown while collapsed */
  value?: React.ReactNode;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const toggle = () => {
    animateNext();
    setOpen((o) => !o);
  };
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>
          {!open && value != null ? (typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value) : null}
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronDownIcon size={17} color={ui.muted} strokeWidth={1.8} />
          </View>
        </View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: ui.divider },
  head: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 14.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 13, color: ui.muted, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'] },
  body: { paddingBottom: 14 },
});
