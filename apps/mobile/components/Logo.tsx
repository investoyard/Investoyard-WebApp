import { SvgXml } from 'react-native-svg';
import { logoXml } from './logo-xml';

/** Investoyard wordmark (221×39 native ratio ≈ 5.67:1). */
export function Logo({ height = 24 }: { height?: number }) {
  const width = Math.round((221 / 39) * height);
  return <SvgXml xml={logoXml} width={width} height={height} />;
}
