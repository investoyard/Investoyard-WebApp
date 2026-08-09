import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ui } from '../../lib/theme';

/** Centered empty/locked state: soft svg circle behind the icon, title, body + CTA. */
export function EmptyState({ icon, title, body, cta }: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  cta?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Svg width={84} height={84} viewBox="0 0 84 84" style={StyleSheet.absoluteFill as any}>
          <Circle cx={42} cy={42} r={42} fill={ui.indigoTint} />
          <Circle cx={42} cy={42} r={30} fill="#ffffff" opacity={0.55} />
        </Svg>
        <View style={styles.icon}>{icon}</View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {cta ? <View style={styles.cta}>{cta}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 28 },
  iconWrap: { width: 84, height: 84, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  icon: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16.5, fontWeight: '700', color: ui.title, textAlign: 'center' },
  body: { fontSize: 13.5, color: ui.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  cta: { marginTop: 18, alignSelf: 'stretch' },
});
