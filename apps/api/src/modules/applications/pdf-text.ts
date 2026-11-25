/**
 * Make text safe to draw with a PDF standard font (Helvetica).
 *
 * The ASBA fillers draw with StandardFonts.Helvetica, which can only encode
 * WinAnsi (Windows-1252). One character outside it — a TAB pasted into a
 * partner's address, a ₹ sign, a zero-width space — makes pdf-lib throw
 * `WinAnsi cannot encode "…"` and the WHOLE print fails (MKSONS and SFCTECH,
 * 29–30 Oct 2026: six refused calls on a tab character).
 *
 * This cleans only what is DRAWN. The partner's payload is stored as it was
 * sent; nothing here touches it.
 *
 * Order matters:
 *  1. line breaks and tabs become ONE space, so "Flat 4\tMG Road" reads
 *     "Flat 4 MG Road" rather than "Flat 4MG Road";
 *  2. other control characters and zero-width marks are dropped;
 *  3. a few common characters get their plain equivalent (₹ → Rs., odd
 *     spaces → space, Unicode hyphens and minus → -);
 *  4. accented letters outside WinAnsi lose the accent (ā → a);
 *  5. anything still not encodable prints as "?", so a gap on paper is
 *     visible rather than silent.
 */

/** Windows-1252 printable code points: ASCII, Latin-1, and the 27 extras at 0x80–0x9F. */
const CP1252_EXTRAS = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
const EXTRAS = new Set([...CP1252_EXTRAS].map((c) => c.codePointAt(0)!));

export function winAnsiEncodable(cp: number): boolean {
  return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || EXTRAS.has(cp);
}

const BREAKS = /[ ]*[\t\n\r\v\f\u0085\u2028\u2029]+[ ]*/g;
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2060\ufeff]/g;
const SPACES = /[\u2000-\u200a\u202f\u205f\u3000]/g;
const HYPHENS = /[\u2010-\u2012\u2212]/g;

export function winAnsiText(value: string): string {
  const s = value
    .replace(BREAKS, ' ')
    .replace(INVISIBLE, '')
    .replace(SPACES, ' ')
    .replace(HYPHENS, '-')
    .replace(/\u20b9/g, 'Rs.')
    .replace(/[\u2032\u2035]/g, "'")
    .replace(/[\u2033\u2036]/g, '"');
  let out = '';
  for (const ch of s) {
    if (winAnsiEncodable(ch.codePointAt(0)!)) { out += ch; continue; }
    const plain = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    out += plain && [...plain].every((c) => winAnsiEncodable(c.codePointAt(0)!)) ? plain : '?';
  }
  return out;
}

/** Clean every string in a plain object or array (one level of nesting is
 *  all the fillers use, but this recurses). Numbers, booleans, null and any
 *  non-plain object are passed through untouched. */
export function winAnsiDeep<T>(value: T): T {
  if (typeof value === 'string') return winAnsiText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => winAnsiDeep(v)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = winAnsiDeep(v);
    return out as T;
  }
  return value;
}
