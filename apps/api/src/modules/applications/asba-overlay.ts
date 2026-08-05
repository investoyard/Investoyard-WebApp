import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

/**
 * ASBA form overlay engine.
 * ---------------------------------------------------------------------------
 * The uploaded blank is the standard SEBI Common Bid-cum-Application form — a FLAT
 * PDF (no AcroForm fields). So we DRAW the applicant's data on top at fixed x/y
 * coordinates (origin bottom-left, matching pdf-lib + pdfjs).
 *
 * COORDS below are seeded from the real label positions of the Juniper Resident
 * form (page 594×774). They will be nudged during visual calibration — keep every
 * position in FIELDS so tuning is one-line edits.
 */

export interface AsbaOverlayData {
  formNo?: string | null;
  applicant: {
    fullName: string;
    pan: string;
    depository: string;          // 'NSDL' | 'CDSL'
    dpId: string;
    clientId: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    email?: string | null;
    mobile?: string | null;
  };
  bid: { shares: number; atCutoff: boolean; bidPrice?: number | null; amount: number };
  bank: { account?: string | null; ifsc?: string | null; bankName?: string | null; branchName?: string | null; upi?: string | null };
}

type Text = { kind: 'text'; x: number; y: number; size?: number; max?: number };
type Grid = { kind: 'grid'; x: number; y: number; step: number; size?: number; align?: 'left' };
type Tick = { kind: 'tick'; x: number; y: number; size?: number };
type Field = Text | Grid | Tick;

/**
 * Coordinate map for the standard SEBI Resident form (page 594×774).
 * grid.step = spacing between per-character boxes (PAN, DP/Client ID, UPI, digits).
 * ⚠️ CALIBRATE these against a printed test-fill.
 */
export const RESIDENT_FIELDS: Record<string, Field> = {
  formNo:        { kind: 'text', x: 425, y: 686, size: 9 },
  name:          { kind: 'text', x: 345, y: 664, size: 9, max: 235 },
  address:       { kind: 'text', x: 345, y: 636, size: 8, max: 235 },
  cityStatePin:  { kind: 'text', x: 345, y: 624, size: 8, max: 235 },
  email:         { kind: 'text', x: 445, y: 617, size: 8, max: 145 },
  mobile:        { kind: 'text', x: 345, y: 604, size: 8, max: 60 },
  pan:           { kind: 'grid', x: 345, y: 578, step: 14.5, size: 10 }, // 10 boxes
  depoNSDL:      { kind: 'tick', x: 232, y: 560 },
  depoCDSL:      { kind: 'tick', x: 264, y: 560 },
  dpClientId:    { kind: 'grid', x: 95, y: 540, step: 14.5, size: 10 }, // NSDL DP(8)+Client(8) / CDSL 16
  bidQty:        { kind: 'grid', x: 100, y: 465, step: 13, size: 10 },  // Option 1 qty
  bidPrice:      { kind: 'grid', x: 258, y: 465, step: 13, size: 10 },  // Option 1 price
  cutoffTick:    { kind: 'tick', x: 376, y: 465 },
  amountFig:     { kind: 'text', x: 145, y: 410, size: 9 },
  amountWords:   { kind: 'text', x: 300, y: 410, size: 7, max: 250 },
  bankAcNo:      { kind: 'text', x: 110, y: 389, size: 9, max: 140 },
  bankNameBranch:{ kind: 'text', x: 160, y: 380, size: 8, max: 380 },
  bankAcRef:     { kind: 'text', x: 210, y: 371, size: 8, max: 330 },
  upi:           { kind: 'grid', x: 110, y: 350, step: 11, size: 8 },  // UPI up to 45 boxes
};

export async function fillAsbaForm(templateBytes: Uint8Array | ArrayBuffer, d: AsbaOverlayData, fields = RESIDENT_FIELDS): Promise<Buffer> {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  // Preferred path: the template has AcroForm fields → fill by name.
  const form = pdf.getForm();
  if (form.getFields().length > 0) {
    // FLATTEN by drawing each value at its field's own widget rectangle (positions come
    // from the PDF), then drop the AcroForm. This renders identically everywhere and merges
    // cleanly for family batches — pdf-lib's own flatten/appearance generator crashes on
    // these SEBI templates (some widgets lack /Rect), which is why we do it by hand.
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    flattenAcroForm(pdf, d, font);
    try { pdf.catalog.delete(PDFName.of('AcroForm')); } catch { /* leave form if removal unsupported */ }
    return Buffer.from(await pdf.save({ updateFieldAppearances: false }));
  }

  // Fallback: flat PDF → draw text at mapped coordinates.
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];
  const ink = rgb(0.05, 0.05, 0.2);

  const draw = (key: string, raw: string | null | undefined) => {
    const f = fields[key];
    if (!f || raw == null || raw === '') return;
    const s = String(raw);
    if (f.kind === 'text') {
      page.drawText(clip(s, f.max, font, f.size ?? 9), { x: f.x, y: f.y, size: f.size ?? 9, font, color: ink });
    } else if (f.kind === 'grid') {
      for (let i = 0; i < s.length; i++) {
        page.drawText(s[i], { x: f.x + i * f.step, y: f.y, size: f.size ?? 10, font, color: ink });
      }
    }
  };
  const tick = (key: string, on: boolean) => {
    const f = fields[key];
    if (!f || f.kind !== 'tick' || !on) return;
    page.drawText('X', { x: f.x, y: f.y, size: f.size ?? 10, font, color: ink });
  };

  const a = d.applicant;
  draw('formNo', d.formNo);
  draw('name', a.fullName?.toUpperCase());
  draw('address', a.address?.toUpperCase());
  draw('cityStatePin', [a.city, a.state, a.pincode].filter(Boolean).join('  ').toUpperCase());
  draw('email', a.email);
  draw('mobile', a.mobile);
  draw('pan', a.pan?.toUpperCase());
  tick('depoNSDL', a.depository === 'NSDL');
  tick('depoCDSL', a.depository === 'CDSL');
  draw('dpClientId', a.depository === 'CDSL' ? a.clientId : `${a.dpId}${a.clientId}`);

  draw('bidQty', String(d.bid.shares));
  if (d.bid.atCutoff) tick('cutoffTick', true);
  else draw('bidPrice', d.bid.bidPrice != null ? String(Math.round(Number(d.bid.bidPrice))) : '');
  draw('amountFig', d.bid.amount.toLocaleString('en-IN'));
  draw('amountWords', `Rupees ${amountInWords(d.bid.amount)} only`);

  const b = d.bank;
  draw('bankAcNo', b.account);
  draw('bankNameBranch', [b.bankName, b.branchName].filter(Boolean).join(', '));
  draw('bankAcRef', b.ifsc ? `IFSC ${b.ifsc}` : '');
  draw('upi', b.upi);

  const out = await pdf.save();
  return Buffer.from(out);
}

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

/**
 * Value per AcroForm field name (Manipal-style SEBI templates). Same-named fields
 * (APPNo, PAN, BANKBRANCH2 …) repeat the value across the main form, acknowledgement
 * slip and agent copy. Fields with no DB value (SubBrokerCode, FamilyGroup) stay blank.
 */
function acroValueMap(d: AsbaOverlayData): Record<string, string | undefined> {
  const a = d.applicant;
  const depoId = a.depository === 'CDSL' ? a.clientId : `${a.dpId}${a.clientId}`;
  const priceStr = d.bid.atCutoff ? 'CUTOFF' : (d.bid.bidPrice != null ? String(Math.round(Number(d.bid.bidPrice))) : '');
  const amountFig = String(Math.round(d.bid.amount));
  const addressFull = [a.address, a.city, a.state].filter(Boolean).join(', ').toUpperCase();
  const bankBranch = [d.bank.bankName, d.bank.branchName].filter(Boolean).join(', ').toUpperCase();
  const formNo = d.formNo ?? '';
  const up = (s?: string | null) => (s ? s.toUpperCase() : undefined);
  return {
    APPNo: formNo, BIDNO: formNo,
    Name: up(a.fullName), ApplicantName: up(a.fullName), RecvFrom: up(a.fullName),
    AddressFull: addressFull || undefined,
    Pincode: a.pincode ?? undefined,
    Email: a.email ?? undefined, Email2: a.email ?? undefined,
    Mobile: a.mobile ?? undefined, Mobile2: a.mobile ?? undefined,
    PAN: up(a.pan), PAN2: up(a.pan), PAN5: up(a.pan),
    CDSLORNSDL: a.depository,
    CDSLNSDLMIX: depoId, CDSLNSDLMIX1: depoId,
    SHARECOUNT: String(d.bid.shares), SHARECOUNT2: String(d.bid.shares),
    BIDPRICE1: priceStr, BIDPRICE2: priceStr,
    Amount: amountFig, GrandTotal: amountFig,
    AmountInWord: `${amountInWords(d.bid.amount)} Only`.toUpperCase(),
    ACCOUNTNO: d.bank.account ?? undefined, ACCOUNTNO2: d.bank.account ?? undefined, ACCOUNTNO3: d.bank.account ?? undefined,
    BANKBRANCH2: bankBranch || undefined,
  };
}

/** Draw each field's value at its widget rectangle(s), then the caller drops the AcroForm. */
function flattenAcroForm(pdf: any, d: AsbaOverlayData, font: any): void {
  const form = pdf.getForm();
  const map = acroValueMap(d);

  // long Name overflows into NamePart2 (each has its own boxes) — split by Name's box count
  const nameMax = safe(() => form.getTextField('Name')?.getMaxLength() as number, 0);
  const full = (d.applicant.fullName ?? '').toUpperCase();
  if (nameMax > 0 && full.length > nameMax) { map.Name = full.slice(0, nameMax); map.NamePart2 = full.slice(nameMax); }

  const pageByRef = new Map<string, any>();
  for (const pg of pdf.getPages()) pageByRef.set(pg.ref.toString(), pg);
  const ink = rgb(0.05, 0.05, 0.2);

  for (const field of form.getFields()) {
    if (field.constructor.name !== 'PDFTextField') continue;
    const val = map[field.getName()];
    if (val == null || val === '') continue;
    const comb = safe(() => field.isCombed(), false);
    const maxLen = safe(() => field.getMaxLength() || 0, 0);
    for (const w of safe(() => field.acroField.getWidgets(), [] as any[])) {
      let r: any; try { r = w.getRectangle(); } catch { continue; }
      if (!r || !r.width || !r.height) continue;
      const pref = safe(() => w.dict.get(PDFName.of('P')), undefined);
      const page = (pref && pageByRef.get(pref.toString())) || pdf.getPages()[0];
      const size = Math.max(6, Math.min(10, r.height * 0.55));
      const y = r.y + (r.height - size) / 2 + size * 0.12;
      if (comb && maxLen > 0) {
        const cw = r.width / maxLen;
        const s = String(val).slice(0, maxLen);
        for (let i = 0; i < s.length; i++) {
          const chw = font.widthOfTextAtSize(s[i], size);
          page.drawText(s[i], { x: r.x + i * cw + Math.max(0, (cw - chw) / 2), y, size, font, color: ink });
        }
      } else {
        let t = String(val);
        while (t.length && font.widthOfTextAtSize(t, size) > r.width - 3) t = t.slice(0, -1);
        page.drawText(t, { x: r.x + 2, y, size, font, color: ink });
      }
    }
  }
}

/** Merge several filled (flattened) PDFs into one multi-page file — for family batches. */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

function clip(s: string, max: number | undefined, font: any, size: number): string {
  if (!max) return s;
  let t = s;
  while (t.length && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
  return t;
}

/** Indian-English amount in words (integer rupees). */
export function amountInWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number): string => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(' ');
}
