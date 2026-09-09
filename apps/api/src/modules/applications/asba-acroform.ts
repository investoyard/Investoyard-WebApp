import { PDFDocument, PDFTextField, PDFName, PDFString, StandardFonts } from 'pdf-lib';

/**
 * AcroForm fill engine — used when the operator's uploaded ASBA blank is a
 * FILLABLE PDF (like the MANIPAL forms): values are set by FIELD NAME, so they
 * land pixel-perfect in every copy on the sheet (main form + counterfoils reuse
 * one field name per value). Non-fillable blanks fall back to the coordinate
 * overlay. Unknown/missing fields are skipped silently, so new form layouts
 * never break printing. NO validation here — values print verbatim (per the
 * operator's print-service policy); field maxLength is respected by truncation.
 *
 * Field map (agreed with the operator against MANIPAL_FILLFORM /
 * MANIPAL_SA_FILLFORM):
 *   APPNo                      form number (PDF series)
 *   SubBrokerCode(+2)          partner's 6-digit channel code (blank for direct)
 *   Name / NamePart2           applicant name split at a word boundary (14+17)
 *   ApplicantName, RecvFrom    full applicant name
 *   AddressFull, Pincode       address
 *   Email(+2), Mobile(+2)      contact
 *   PAN, PAN2, PAN5            PAN (all copies)
 *   CDSLORNSDL                 depository name
 *   CDSLNSDLMIX(+1)            16-char demat (CDSL number / NSDL INxxxxxx+client)
 *   SHARECOUNT(+2)             share quantity
 *   BIDPRICE1 / BIDPRICE2      bid price (main + slip)
 *   Amount, GrandTotal         amount in figures
 *   AmountInWord               amount in words (Indian system)
 *   ACCOUNTNO(+2/+3)           bank account number ONLY
 *   BANKBRANCH2                bank & branch
 *   FamilyGroup                grouping label (partner-supplied / account holder)
 *   BIDNO                      intentionally ignored
 */

export interface AsbaFormData {
  formNo: string | null;
  fullName: string;
  address?: string | null;
  pincode?: string | null;
  email?: string | null;
  mobile?: string | null;
  pan?: string | null;
  depository?: string | null; // 'NSDL' | 'CDSL'
  dpId?: string | null;
  clientId?: string | null;
  shares?: number | null;
  bidPrice?: number | null;
  amount?: number | null;
  bankAccount?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  familyGroup?: string | null;
  subBrokerCode?: string | null;
  /** For the PDF Title metadata line — e.g. "ARDEE". Optional; when
   *  missing the title falls back to the form number. */
  ipoSymbol?: string | null;
}

/** Plain integer digits — no thousands separators. The registrar prints
 *  "Amount Blocked (₹ in figures)" as a run of digits (operator ask,
 *  2026-09-08); locale grouping (`2,25,250`) reads as separator characters
 *  in some counterfoil layouts and can trip OCR at the banker. */
const inrDigits = (n?: number | null) => (n == null || !Number.isFinite(n) ? '' : String(Math.round(n)));

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

/** Indian-system amount in words, formatted for the ASBA "Amount Blocked
 *  (₹ in words)" field: prefixed RUPEES, suffixed ONLY, whole string
 *  uppercased — 225250 → "RUPEES TWO LAKH TWENTY FIVE THOUSAND TWO
 *  HUNDRED FIFTY ONLY". The form mandates block letters ("PLEASE FILL
 *  IN BLOCK LETTERS") and the printed field expects "RUPEES … ONLY"
 *  (operator spec 2026-09-09). */
export function amountInWordsInr(n?: number | null): string {
  const body = buildWords(n);
  return body ? `RUPEES ${body} ONLY`.toUpperCase() : '';
}

/** Internal — just the number as words, no RUPEES prefix / ONLY suffix.
 *  Kept separate so the recursive Crore branch can compose cleanly. */
function buildWords(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '';
  let v = Math.round(n);
  const parts: string[] = [];
  const crore = Math.floor(v / 10000000); v %= 10000000;
  const lakh = Math.floor(v / 100000); v %= 100000;
  const thousand = Math.floor(v / 1000); v %= 1000;
  const hundred = Math.floor(v / 100); v %= 100;
  if (crore) parts.push(`${buildWords(crore)} Crore`.trim());
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (v) parts.push(twoDigits(v));
  return parts.join(' ');
}

/** Split a name at a word boundary into the two name boxes (14 + 17 chars). */
function splitName(full: string, max1 = 14, max2 = 17): [string, string] {
  const s = (full ?? '').trim();
  if (s.length <= max1) return [s, ''];
  let cut = s.lastIndexOf(' ', max1);
  if (cut <= 0) cut = max1; // one long word — hard split
  return [s.slice(0, cut).trim(), s.slice(cut).trim().slice(0, max2)];
}

/**
 * Fill the template's AcroForm with the applicant data and flatten it.
 * Returns null when the PDF has no form fields (caller falls back to overlay).
 */
export async function fillAsbaAcroForm(template: Buffer, d: AsbaFormData, flatten = true): Promise<Buffer | null> {
  const doc = await PDFDocument.load(template, { ignoreEncryption: true });
  let fields;
  try { fields = doc.getForm().getFields(); } catch { return null; }
  if (!fields.length) return null;
  const form = doc.getForm();

  // Some uploaded blanks carry a malformed widget (no /Rect) that crashes
  // pdf-lib's appearance/flatten passes. Drop those fields — one broken box
  // must never kill the whole print.
  for (const f of [...form.getFields()]) {
    const bad = f.acroField.getWidgets().some((w) => {
      try { w.getRectangle(); return false; } catch { return true; }
    });
    if (bad) { try { form.removeField(f); } catch { /* leave it unset */ } }
  }

  // A blank uploaded without a form-level /DA (Default Appearance) and /DR
  // (Default Resources /Font) prints COMPLETELY BLANK — pdf-lib can't
  // regenerate appearance streams without a font in scope, and viewers
  // won't either. That happened to ARDEE: `defaultUpdateAppearances()` throws
  // "font must be of type PDFFont", flatten falls back to enableReadOnly,
  // every field lands on paper without a stroke. Install Helvetica on the
  // form + /DA "/Helv 10 Tf 0 g", flag /NeedAppearances so viewers rebuild
  // the appearance streams at display time.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const acroDict = (form as any).acroForm.dict;
  if (!acroDict.get(PDFName.of('DR'))) {
    const dr = doc.context.obj({});
    const fnt = doc.context.obj({});
    fnt.set(PDFName.of('Helv'), font.ref);
    dr.set(PDFName.of('Font'), fnt);
    acroDict.set(PDFName.of('DR'), dr);
  }
  if (!acroDict.get(PDFName.of('DA'))) {
    acroDict.set(PDFName.of('DA'), PDFString.of('/Helv 10 Tf 0 g'));
  }
  acroDict.set(PDFName.of('NeedAppearances'), doc.context.obj(true));

  // These forms define SAME-NAMED fields as separate objects (one per counterfoil
  // copy) — form.getTextField(name) throws on that, so index every text field by
  // name and set ALL matches. Field maxLength is respected by truncation.
  const byName = new Map<string, PDFTextField[]>();
  for (const f of form.getFields()) {
    if (f instanceof PDFTextField) {
      const arr = byName.get(f.getName()) ?? [];
      arr.push(f);
      byName.set(f.getName(), arr);
    }
  }
  const set = (name: string, value?: string | null) => {
    for (const f of byName.get(name) ?? []) {
      let v = (value ?? '').trim();
      const max = f.getMaxLength();
      if (max != null && v.length > max) v = v.slice(0, max);
      try { f.setText(v); } catch { /* combed/odd field — leave blank rather than fail the print */ }
    }
  };
  /** UPPERCASE the value before writing — used for the block-letter fields
   *  the form demands ("PLEASE FILL IN BLOCK LETTERS"). Email is
   *  deliberately NOT routed through this — RFC 5321 keeps the local part
   *  case-preserving and "KARISHMA@EXAMPLE.COM" reads wrong. Digits and
   *  already-uppercase inputs (PAN, demat, form number) skip this too. */
  const setUpper = (name: string, value?: string | null) =>
    set(name, value == null ? value : String(value).toUpperCase());

  const [name1, name2] = splitName(d.fullName);
  const demat = d.depository === 'CDSL'
    ? (d.clientId ?? '')
    : `${d.dpId ?? ''}${d.clientId ?? ''}`;
  const bankBranch = [d.bankName, d.branchName].filter(Boolean).join(' — ');

  set('APPNo', d.formNo ?? '');
  set('SubBrokerCode', d.subBrokerCode);
  set('SubBrokerCode2', d.subBrokerCode);
  setUpper('Name', name1);
  setUpper('NamePart2', name2);
  setUpper('ApplicantName', d.fullName);
  setUpper('RecvFrom', d.fullName);
  setUpper('AddressFull', d.address);
  set('Pincode', d.pincode);
  set('Email', d.email);   // case-preserved (see setUpper comment)
  set('Email2', d.email);
  set('Mobile', d.mobile);
  set('Mobile2', d.mobile);
  set('PAN', d.pan);
  set('PAN2', d.pan);
  set('PAN5', d.pan);
  set('CDSLORNSDL', d.depository);
  set('CDSLNSDLMIX', demat);
  set('CDSLNSDLMIX1', demat);
  set('SHARECOUNT', d.shares != null ? String(d.shares) : '');
  set('SHARECOUNT2', d.shares != null ? String(d.shares) : '');
  set('BIDPRICE1', d.bidPrice != null ? String(Math.round(d.bidPrice)) : '');
  set('BIDPRICE2', d.bidPrice != null ? String(Math.round(d.bidPrice)) : '');
  set('Amount', inrDigits(d.amount));
  set('GrandTotal', inrDigits(d.amount));
  set('AmountInWord', amountInWordsInr(d.amount));   // already RUPEES … ONLY + UPPER
  set('ACCOUNTNO', d.bankAccount);
  set('ACCOUNTNO2', d.bankAccount);
  set('ACCOUNTNO3', d.bankAccount);
  setUpper('BANKBRANCH2', bankBranch);
  setUpper('FamilyGroup', d.familyGroup);
  // BIDNO — intentionally left untouched

  // Metadata cleanup — clear whatever the printer's tool baked in (Producer,
  // Creator, inherited Title/Author often carry the previous IPO's name)
  // and stamp our own identity. Keeps the printed sheet from advertising a
  // stale tool chain and gives file-managers a meaningful filename hint.
  const title = d.ipoSymbol && d.formNo ? `${d.ipoSymbol} — ASBA Application ${d.formNo}`
    : d.ipoSymbol ? `${d.ipoSymbol} — ASBA Application`
    : d.formNo ? `ASBA Application ${d.formNo}`
    : 'ASBA Application';
  doc.setTitle(title);
  doc.setAuthor('Investoyard');
  doc.setCreator('Investoyard');
  doc.setProducer('Investoyard');
  doc.setSubject('ASBA / UPI Bid cum Application Form');
  // Keywords intentionally minimal — the sheet's own text carries the specifics.
  doc.setKeywords(['ASBA', 'IPO', d.ipoSymbol].filter(Boolean) as string[]);

  // appearances: per-field best effort — one odd field must not block the rest.
  // On blanks with /DR properly declared, this succeeds and lets us flatten.
  // On the ARDEE-style blanks it throws; /NeedAppearances above then carries
  // the render on the viewer side.
  let appearancesOk = 0;
  for (const f of form.getFields()) {
    try { (f as any).defaultUpdateAppearances?.(); appearancesOk++; } catch { /* viewer regenerates via /NeedAppearances */ }
  }
  // Only flatten when appearances actually built — flattening without them
  // paints empty boxes over the values. Falling back to a read-only form
  // still prints correctly because viewers honour /NeedAppearances.
  if (flatten && appearancesOk === form.getFields().length) {
    try { form.flatten({ updateFieldAppearances: false }); }
    catch {
      for (const f of form.getFields()) { try { (f as any).enableReadOnly(); } catch { /* best effort */ } }
    }
  } else {
    for (const f of form.getFields()) { try { (f as any).enableReadOnly(); } catch { /* best effort */ } }
  }
  return Buffer.from(await doc.save({ updateFieldAppearances: false }));
}
