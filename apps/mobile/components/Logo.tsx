import { SvgXml } from 'react-native-svg';
import { logoXml } from './logo-xml';

/**
 * react-native-svg does NOT support <style> blocks / CSS classes (they render
 * as fill:none → an invisible logo). Rewrite the source SVG once at module
 * load: strip the stylesheet and expand each class into inline attributes.
 * Classes in the source: B = fill-rule:evenodd · C = #3c2e7e · D = #ffcb32.
 */
const nativeLogoXml = logoXml
  // The source svg has width/height but NO viewBox — react-native-svg then
  // CROPS instead of scaling when rendered smaller. Add the natural viewBox.
  .replace('<svg ', '<svg viewBox="0 0 221 39" ')
  .replace(/<style>[\s\S]*?<\/style>/, '')
  .replace(/class="([^"]*)"/g, (_m, cls: string) => {
    const parts = cls.split(/\s+/);
    let attrs = '';
    if (parts.includes('B')) attrs += ' fill-rule="evenodd"';
    if (parts.includes('C')) attrs += ' fill="#3c2e7e"';
    if (parts.includes('D')) attrs += ' fill="#ffcb32"';
    return attrs.trim();
  });

/** Investoyard wordmark (221×39 native ratio ≈ 5.67:1). */
export function Logo({ height = 24 }: { height?: number }) {
  const width = Math.round((221 / 39) * height);
  return <SvgXml xml={nativeLogoXml} width={width} height={height} />;
}
