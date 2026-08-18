import { PDFDocument, PDFTextField } from 'pdf-lib';

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
}

/** "12,34,567" style Indian digit grouping (figures fields). */
const inrDigits = (n?: number | null) => (n == null || !Number.isFinite(n) ? '' : Math.round(n).toLocaleString('en-IN'));

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

/** Indian-system amount in words: 12,34,567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only". */
export function amountInWordsInr(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '';
  let v = Math.round(n);
  const parts: string[] = [];
  const crore = Math.floor(v / 10000000); v %= 10000000;
  const lakh = Math.floor(v / 100000); v %= 100000;
  const thousand = Math.floor(v / 1000); v %= 1000;
  const hundred = Math.floor(v / 100); v %= 100;
  if (crore) parts.push(`${amountInWordsInr(crore).replace(/ Only$/, '')} Crore`.trim());
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (v) parts.push(twoDigits(v));
  return parts.length ? `${parts.join(' ')} Only` : '';
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

  const [name1, name2] = splitName(d.fullName);
  const demat = d.depository === 'CDSL'
    ? (d.clientId ?? '')
    : `${d.dpId ?? ''}${d.clientId ?? ''}`;
  const bankBranch = [d.bankName, d.branchName].filter(Boolean).join(' — ');

  set('APPNo', d.formNo ?? '');
  set('SubBrokerCode', d.subBrokerCode);
  set('SubBrokerCode2', d.subBrokerCode);
  set('Name', name1);
  set('NamePart2', name2);
  set('ApplicantName', d.fullName);
  set('RecvFrom', d.fullName);
  set('AddressFull', d.address);
  set('Pincode', d.pincode);
  set('Email', d.email);
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
  set('AmountInWord', amountInWordsInr(d.amount));
  set('ACCOUNTNO', d.bankAccount);
  set('ACCOUNTNO2', d.bankAccount);
  set('ACCOUNTNO3', d.bankAccount);
  set('BANKBRANCH2', bankBranch);
  set('FamilyGroup', d.familyGroup);
  // BIDNO — intentionally left untouched

  // appearances: per-field best effort — one odd field must not block the rest
  for (const f of form.getFields()) {
    try { (f as any).defaultUpdateAppearances?.(); } catch { /* viewer regenerates */ }
  }
  if (flatten) {
    try { form.flatten({ updateFieldAppearances: false }); }
    catch {
      // flatten refused (odd form structure) — lock the fields instead
      for (const f of form.getFields()) { try { (f as any).enableReadOnly(); } catch { /* best effort */ } }
    }
  }
  return Buffer.from(await doc.save({ updateFieldAppearances: false }));
}
