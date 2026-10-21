import { readFileSync, existsSync } from 'fs';
import type { PDFDocument, PDFFont } from 'pdf-lib';

/**
 * The font, size and colour a filled ASBA field is supposed to be drawn in —
 * read off the blank's own `/DA` (Default Appearance) rather than chosen by us.
 *
 * WHY THIS EXISTS. The burn-in path drew every value in embedded Helvetica at a
 * size derived from the box height, in a dark navy. The operator's blanks ask
 * for **Arial Black, at a stated size, in black**, and had done all along —
 * reported 2026-10-21 as "font change not as per I set".
 *
 * Measured across all 74 ASBA blanks the catalogue references, every field of
 * every one: exactly TWO fonts are ever named — `Arial-Black` (1,990 fields)
 * and `Helv` (802, which is the form-level default inherited by fields that
 * declare nothing). Sizes run 5 to 18 plus 0 for auto. Colour is black on all
 * 2,792. So the map below needs exactly one entry and nothing is guessed: any
 * other name falls back to Helvetica, which is what every field got before.
 *
 * WHY THE BURN-IN RUNS AT ALL, since it is what substitutes the font: pdf-lib
 * can only build an appearance stream from a `/DA` whose font it can measure,
 * and `Arial-Black` is declared in these blanks' `/DR /Font` WITHOUT being
 * embedded — a bare TrueType reference relying on the reader having the font
 * installed. `defaultUpdateAppearances()` therefore throws
 * "font must be of type PDFFont" on 38 of 38 fields, every blank takes the
 * burn-in, and the burn-in used the only font it had. Flattening is not
 * optional: WhatsApp's viewer ignores `/NeedAppearances`, so an unflattened
 * form reaches the customer blank.
 */

/** A parsed `/DA` string. Defaults are the PDF ones: no font, auto size, black. */
export interface DefaultAppearance {
  /** The resource name as written, without the leading slash — e.g. `Arial-Black`. */
  fontName: string | null;
  /** Points. **0 means AUTO** — the viewer picks to fit, and so do we. */
  size: number;
  color: { r: number; g: number; b: number };
}

const BLACK = { r: 0, g: 0, b: 0 };

/**
 * Parse `/Arial-Black 9 Tf 0 0 0 rg` into its three parts.
 *
 * Deliberately tolerant: a `/DA` is a content-stream fragment and a blank may
 * carry operators we do not care about. Anything unparseable falls back to the
 * PDF default rather than throwing — a malformed appearance string must never
 * stop a form reaching a customer.
 */
export function parseDefaultAppearance(da: string | null | undefined): DefaultAppearance {
  const s = String(da ?? '');
  const out: DefaultAppearance = { fontName: null, size: 0, color: { ...BLACK } };
  if (!s.trim()) return out;

  /* `/Name size Tf`. The name may contain anything but whitespace and a
     delimiter; PDF escapes it as #xx, which none of these blanks use. */
  const tf = /\/([^\s/<>[\]()]+)\s+(-?[\d.]+)\s+Tf/.exec(s);
  if (tf) {
    out.fontName = tf[1];
    const n = Number(tf[2]);
    if (Number.isFinite(n) && n > 0) out.size = n;
  }

  /* Colour: the LAST colour operator wins, as it would when the stream runs.
     `g` is grayscale (1 operand), `rg` RGB (3), `k` CMYK (4). */
  const ops = [...s.matchAll(/((?:-?[\d.]+\s+){1,4})(rg|g|k)\b/g)];
  const last = ops[ops.length - 1];
  if (last) {
    const nums = last[1].trim().split(/\s+/).map(Number);
    if (nums.every((v) => Number.isFinite(v))) {
      const c = (v: number) => Math.min(1, Math.max(0, v));
      if (last[2] === 'g' && nums.length >= 1) {
        out.color = { r: c(nums[0]), g: c(nums[0]), b: c(nums[0]) };
      } else if (last[2] === 'rg' && nums.length >= 3) {
        out.color = { r: c(nums[0]), g: c(nums[1]), b: c(nums[2]) };
      } else if (last[2] === 'k' && nums.length >= 4) {
        const [cy, m, y, k] = nums.map(c);
        out.color = { r: (1 - cy) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k) };
      }
    }
  }
  return out;
}

/**
 * Where a `/DA` font name's file might be found, in order.
 *
 * WE READ THE MACHINE'S OWN LICENSED COPY AT RUNTIME AND DO NOT CHECK THE FONT
 * INTO THE REPO, and the distinction is a real one rather than caution.
 * `ariblk.ttf` declares `fsType = 0x8` — editable embedding, subsetting
 * allowed — which is the font permitting a SUBSET to be embedded in a document
 * we distribute. Committing the 167 KB binary to a git repository is
 * redistribution of the font itself, a different act with a different answer.
 * So: read it from the OS, embed a subset, ship the PDF.
 *
 * A missing file is not an error. It falls back to Helvetica, which is exactly
 * what every form printed before this existed.
 */
export const BURN_IN_FONT_FILES: Record<string, string[]> = {
  'Arial-Black': [
    process.env.ASBA_FONT_ARIAL_BLACK ?? '',
    'C:\\Windows\\Fonts\\ariblk.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf',
  ].filter(Boolean),
};

/**
 * A per-document font resolver: `/DA` name in, embedded font out, Helvetica
 * when we have nothing better.
 *
 * EMBEDS ONCE PER DOCUMENT AND CACHES. A form has 38 fields and embedding per
 * field would put 38 copies of the face in one PDF. Subsetted, Arial Black adds
 * tens of KB to a document these partners forward over WhatsApp.
 *
 * `registerFontkit` is lazy and happens at most once per document — pdf-lib
 * cannot embed a real TrueType without it, and loading it for a form that only
 * ever asks for Helvetica would be work for nothing.
 */
export function createFontResolver(
  doc: PDFDocument,
  fallback: PDFFont,
  onWarn?: (msg: string) => void,
): (name: string | null | undefined) => Promise<PDFFont> {
  const cache = new Map<string, PDFFont>();
  let fontkitReady = false;

  return async (name) => {
    const key = String(name ?? '');
    if (!key) return fallback;
    const hit = cache.get(key);
    if (hit) return hit;

    const candidates = BURN_IN_FONT_FILES[key];
    if (!candidates?.length) {
      cache.set(key, fallback);
      return fallback;
    }
    const file = candidates.find((f) => { try { return existsSync(f); } catch { return false; } });
    if (!file) {
      onWarn?.(`[asba] ${key} not found on this machine — falling back to Helvetica`);
      cache.set(key, fallback);
      return fallback;
    }
    try {
      if (!fontkitReady) {
        // require, not import: the module is CommonJS and this path is cold.
        const fontkit = require('@pdf-lib/fontkit');
        (doc as any).registerFontkit(fontkit.default ?? fontkit);
        fontkitReady = true;
      }
      const embedded = await doc.embedFont(readFileSync(file), { subset: true });
      cache.set(key, embedded);
      return embedded;
    } catch (e: any) {
      /* A font that will not embed must not fail the print. */
      onWarn?.(`[asba] could not embed ${key} (${e?.message ?? e}) — falling back to Helvetica`);
      cache.set(key, fallback);
      return fallback;
    }
  };
}

/**
 * The size to actually draw at.
 *
 * A stated size is honoured, but still CAPPED TO THE BOX: these blanks declare
 * up to 18pt, and a widget whose rectangle is shorter than that would have the
 * glyphs running out of their own box. `0` means auto in a `/DA`, which is
 * what the form-level default says on 802 of the 2,792 fields — there the
 * height-derived figure is the honest answer and is what shipped before.
 */
export function burnInFontSize(daSize: number, boxHeight: number): number {
  const auto = Math.max(6, Math.min(10, boxHeight * 0.55));
  if (!(daSize > 0)) return auto;
  return Math.max(4, Math.min(daSize, boxHeight * 0.85));
}
