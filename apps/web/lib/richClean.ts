/**
 * Clean operator-entered rich HTML before injection so pasted content can never
 * override the site's design. Inline styles are FILTERED, not stripped wholesale:
 * declarations the admin editor itself produces (color, highlight background,
 * text-align, font-size) are kept; everything else (font-family, widths, margins —
 * the junk that rides along with pasted content) is dropped. Event handlers,
 * legacy <font> markup, pasted column sizing and hyperlinks are removed.
 */
const KEEP_STYLE = /^(color|background-color|text-align|font-size)\s*:/i;

function filterStyle(css: string): string {
  return css
    .split(';')
    .map((d) => d.trim())
    .filter((d) => KEEP_STYLE.test(d))
    .join('; ');
}

export function cleanRich(html?: string | null): string {
  if (!html) return '';
  return String(html)
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')      // event handlers
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_, css) => {
      const kept = filterStyle(css);
      return kept ? ` style="${kept}"` : '';
    })
    .replace(/\sstyle\s*=\s*'([^']*)'/gi, (_, css) => {
      const kept = filterStyle(css);
      return kept ? ` style="${kept}"` : '';
    })
    .replace(/\s(width|height|bgcolor|color|face|size|align)\s*=\s*"[^"]*"/gi, '') // legacy attrs
    .replace(/<\/?font[^>]*>/gi, '')                 // <font> tags
    .replace(/<colgroup[\s\S]*?<\/colgroup>/gi, '')  // pasted column sizing
    .replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, ''); // unwrap pasted hyperlinks (keep the text)
}
