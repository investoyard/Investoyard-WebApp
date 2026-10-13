/**
 * PDF → an ordered list of rows, each row a list of positioned text runs.
 *
 * We use pdfjs-dist because the file we care about (NSE PREANCHOR) is a
 * two-column table. Naive text extraction jumbles labels and values because it
 * reads left-to-right, top-to-bottom across BOTH columns as one flow. Grouping
 * items by y-coordinate first, then sorting by x within a row, reproduces the
 * layout well enough to parse with plain label-value logic — the same trick
 * `pdftotext -layout` uses, minus the shell dependency.
 *
 * We deliberately do NOT try to draw the PDF (no canvas). pdfjs prints a
 * DOMMatrix warning on the way in; it is cosmetic and text extraction still
 * works.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as {
  getDocument(src: { data: Uint8Array; disableFontFace?: boolean }): { promise: Promise<PdfDoc> };
};

interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfPage {
  getTextContent(): Promise<{ items: RawItem[] }>;
}
interface RawItem {
  str: string;
  /** [scaleX, skewY, skewX, scaleY, x, y] — we only need x (index 4) and y (index 5) */
  transform: number[];
  width: number;
  height: number;
}

export interface Run {
  /** the string, whitespace-collapsed but preserved when meaningful */
  s: string;
  x: number;
  y: number;
  /** width in PDF points as pdfjs reports it — how far this run occupies */
  w: number;
}
export interface Row {
  /** the y-coordinate every run in this row is bucketed around */
  y: number;
  /** every run on this row, sorted by x */
  runs: Run[];
  /** convenience: `runs.map(r => r.s).join(' ')` with column padding */
  text: string;
}

/**
 * Extract every page's rows in one flat list. Callers that care about page
 * boundaries can look at `pageIndex` on the returned rows; the PREANCHOR
 * parser walks the flat list because the tables it reads sometimes wrap
 * across pages.
 */
export interface ExtractedPage { pageIndex: number; rows: Row[] }
export interface ExtractedDoc { pages: ExtractedPage[]; flat: (Row & { pageIndex: number })[] }

export async function extractPdfText(buf: Uint8Array | Buffer): Promise<ExtractedDoc> {
  // pdfjs v3 refuses a Node Buffer explicitly, even though Buffer extends
  // Uint8Array. `instanceof Uint8Array` is true for a Buffer, so this cannot
  // be a simple conditional — always copy the bytes into a plain Uint8Array.
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;

  const pages: ExtractedPage[] = [];
  const flat: (Row & { pageIndex: number })[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rows = groupIntoRows(content.items);
    pages.push({ pageIndex: i, rows });
    for (const r of rows) flat.push({ ...r, pageIndex: i });
  }
  return { pages, flat };
}

/**
 * Bucket items into rows by y-coordinate.
 *
 * A single visual "row" in PREANCHOR is one line of text but pdfjs can emit
 * two or three items for it (one per font run — bold labels, italic values,
 * whitespace runs). Bucketing by an exact y match misses those because a font
 * change can shift the baseline by a fraction of a point. A 2-point tolerance
 * catches the drift without merging genuinely separate lines (10pt text is
 * spaced ~12pt).
 */
function groupIntoRows(items: RawItem[]): Row[] {
  const runs: Run[] = items
    .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 }))
    .filter((r) => r.s && r.s.trim());
  if (!runs.length) return [];

  runs.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Row[] = [];
  const TOL = 2;
  for (const r of runs) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - r.y) <= TOL) last.runs.push(r);
    else rows.push({ y: r.y, runs: [r], text: '' });
  }
  for (const row of rows) {
    row.runs.sort((a, b) => a.x - b.x);
    row.text = joinRow(row.runs);
  }
  return rows;
}

/**
 * Reconstruct the visual line as a string.
 *
 * pdfjs emits characters as separate runs in font-subset PDFs — the NSE
 * PREANCHOR emits "R" "e" "." "1" "0" as five items with adjacent x-values.
 * Joining every run with a single space produced "R e. 1 0". Keying off the
 * ACTUAL point gap (cur.x minus prev.x + prev.w) recovers word boundaries: a
 * gap under 1pt is within-word, 1-6pt is one space, more is a column
 * separator worth padding so downstream parsers can split on 2+ spaces.
 */
function joinRow(runs: Run[]): string {
  if (!runs.length) return '';
  let out = runs[0].s;
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const cur = runs[i];
    const gap = cur.x - (prev.x + prev.w);
    if (gap < 1) out += cur.s;                                         // same word
    else if (gap < 6) out += ' ' + cur.s;                              // word break
    else out += '  ' + ' '.repeat(Math.min(Math.round(gap / 3), 40)) + cur.s;  // column
  }
  return out.replace(/\s+$/g, '');
}

/* ── helpers a parser will reach for repeatedly ───────────────────────────── */

/** Find the first row whose text matches. `label` may be a plain string or a regex. */
export function findRow(rows: Row[], label: string | RegExp): Row | undefined {
  const test = typeof label === 'string'
    ? (s: string) => s.toLowerCase().includes(label.toLowerCase())
    : (s: string) => label.test(s);
  return rows.find((r) => test(r.text));
}

/**
 * Take the value that sits AFTER a label on the same row. Splits on 2+ spaces
 * so "Face Value    Re. 10 per Equity Share" gives "Re. 10 per Equity Share".
 */
export function valueAfterLabel(rowText: string, label: string | RegExp): string | undefined {
  const idx = typeof label === 'string'
    ? rowText.toLowerCase().indexOf(label.toLowerCase())
    : rowText.search(label);
  if (idx < 0) return undefined;
  const after = rowText.slice(idx + (typeof label === 'string' ? label.length : rowText.match(label)![0].length));
  // 2+ spaces = column boundary
  const m = after.match(/^\s{2,}(.+?)\s*$/);
  return (m ? m[1] : after.trim()) || undefined;
}
