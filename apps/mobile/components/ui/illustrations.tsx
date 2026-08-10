import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { ui } from '../../lib/theme';

/**
 * Branded empty-state illustrations — indigo line-art with ONE gold accent each
 * (the celebration/brand color). 132×96 scenes, drawn in code (no assets).
 */
const GOLD = '#FFCB32';
const stroke = { stroke: ui.indigo, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Stacked application sheets + gold check badge — IPOs / applications. */
export function IllusDocs() {
  return (
    <Svg width={132} height={96} viewBox="0 0 132 96">
      <Circle cx={66} cy={48} r={44} fill={ui.indigoTint} />
      <Rect x={38} y={26} width={44} height={54} rx={8} fill="#ffffff" {...stroke} transform="rotate(-6 60 53)" />
      <Rect x={52} y={22} width={44} height={54} rx={8} fill="#ffffff" {...stroke} />
      <Line x1={61} y1={36} x2={87} y2={36} {...stroke} fill="none" />
      <Line x1={61} y1={45} x2={87} y2={45} {...stroke} fill="none" />
      <Line x1={61} y1={54} x2={78} y2={54} {...stroke} fill="none" />
      <Circle cx={92} cy={68} r={13} fill={GOLD} />
      <Path d="M86.5 68 l3.6 3.6 L97.5 64" stroke="#3C2E7E" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Two applicants + gold star — family/profiles. */
export function IllusUsers() {
  return (
    <Svg width={132} height={96} viewBox="0 0 132 96">
      <Circle cx={66} cy={48} r={44} fill={ui.indigoTint} />
      <Circle cx={55} cy={42} r={11} fill="#ffffff" {...stroke} />
      <Path d="M36 76 c2 -13 9 -19 19 -19 s17 6 19 19" fill="#ffffff" {...stroke} />
      <Circle cx={82} cy={46} r={9} fill="#ffffff" {...stroke} />
      <Path d="M68 76 c1.6 -10 7 -15 14 -15 s12.4 5 14 15" fill="#ffffff" {...stroke} />
      <Path d="M94 22 l2.6 5.3 5.9 .9 -4.3 4.1 1 5.9 -5.2 -2.8 -5.2 2.8 1 -5.9 -4.3 -4.1 5.9 -.9 z" fill={GOLD} />
    </Svg>
  );
}

/** Bell with gold dot — notifications/alerts. */
export function IllusBell() {
  return (
    <Svg width={132} height={96} viewBox="0 0 132 96">
      <Circle cx={66} cy={48} r={44} fill={ui.indigoTint} />
      <Path d="M66 26 c-10 0 -16 8 -16 18 v8 l-5 8 h42 l-5 -8 v-8 c0 -10 -6 -18 -16 -18 z" fill="#ffffff" {...stroke} />
      <Path d="M60 62 a6 6 0 0 0 12 0" {...stroke} fill="none" />
      <Circle cx={82} cy={30} r={7} fill={GOLD} />
    </Svg>
  );
}
