import { SvgXml } from 'react-native-svg';

/**
 * The Investoyard IY mark used as a list bullet — parity with web's
 * /public/bullet-iy.svg. Rendered as the leading glyph for every <li>
 * that comes out of the operator's rich-text content on the IPO detail
 * page (company description, strengths, objects of issue).
 *
 * react-native-svg parses the same SVG the web serves; we inline the XML
 * here so no network fetch is needed and the mark survives offline.
 */
const BULLET_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(52,52) scale(0.80)">
    <path d="M62 10 L118 104 L6 104 Z" fill="#ffcb32" stroke="#ffcb32" stroke-width="16" stroke-linejoin="round"/>
    <rect x="14" y="132" width="96" height="368" rx="10" fill="#3c2e7e"/>
    <path d="M350 8 L500 8 L425 176 Z" fill="#3c2e7e" stroke="#3c2e7e" stroke-width="16" stroke-linejoin="round"/>
    <polyline points="150,22 402,250 220,498" fill="none" stroke="#ffcb32" stroke-width="100" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

export function BulletIY({ size = 12 }: { size?: number }) {
  return <SvgXml xml={BULLET_XML} width={size} height={size} />;
}
