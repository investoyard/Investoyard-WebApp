/** Tiny svg sparkline — real data only (day-wise GMP / subscription logs). */
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ui } from '../../lib/theme';

export function Sparkline({ values, width = 84, height = 30, color = ui.indigo }: {
  values: number[]; width?: number; height?: number; color?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lx, ly] = pts[pts.length - 1].split(',').map(Number);
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts.join(' ')} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={2.4} fill={color} />
    </Svg>
  );
}
