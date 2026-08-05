import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { LOGO_PATHS, LOGO_VIEWBOX, LOGO_INDIGO, LOGO_GOLD } from './logo-paths';

/** Brand + light neutral palette (colours taken from the logo). */
const INDIGO = LOGO_INDIGO;   // #3c2e7e — headings, accents, logo
const GOLD = LOGO_GOLD;       // #ffcb32 — thin accents
const INK = '#26242e';        // body values
const MUT = '#7c7c88';        // field labels
const LINE = '#e3e3ec';       // hairlines
const STRIP = '#f3f1fa';      // section header strip (light lavender)

const APPLICANT_TYPES = ['Individual', 'Sole Proprietor', 'Partnership', 'LLP', 'Company', 'HUF', 'Trust', 'Other'];
const PRODUCT_OPTIONS = ['Mutual Funds', 'Public Issues / IPOs', 'Bonds / NCDs', 'Fixed Deposits', 'Insurance', 'Loans', 'AIF & PMS', 'Others'];
const INDIVIDUAL_TYPES = new Set(['Individual', 'Sole Proprietor', 'HUF']);
const isIndividual = (t?: string) => !t || INDIVIDUAL_TYPES.has(t);

const DOC_FIELDS: { key: string; label: string }[] = [
  { key: 'docPan', label: 'PAN card' },
  { key: 'docAadhaar', label: 'Aadhaar' },
  { key: 'docAddressProof', label: 'Address proof' },
  { key: 'docCancelledCheque', label: 'Cancelled cheque' },
  { key: 'docArnCert', label: 'ARN / AMFI certificate' },
  { key: 'docNismCert', label: 'NISM certificate' },
  { key: 'docGst', label: 'GST certificate' },
  { key: 'docPhoto', label: 'Photograph' },
  { key: 'docCoi', label: 'Certificate of incorporation' },
  { key: 'docBoardResolution', label: 'Board resolution' },
  { key: 'docMoaAoa', label: 'MOA & AOA' },
  { key: 'docPartnershipDeed', label: 'Partnership deed' },
  { key: 'docAuthSignatories', label: 'Authorised signatories list' },
];

const DECLARATION =
  'I/We hereby apply to be empanelled as a Business Associate / Distributor of Investoyard for the distribution and ' +
  'facilitation of IPO applications and other permitted financial products. I/We declare that the particulars furnished ' +
  'above are true, accurate and complete to the best of my/our knowledge and belief, and I/We undertake to intimate ' +
  'Investoyard in writing of any change therein. I/We confirm that I/We are not disqualified under any law or regulation ' +
  'from acting as a distributor. I/We acknowledge that every IPO application is made using the applicant’s own PAN, demat ' +
  'and bank / UPI in accordance with SEBI norms (no third-party funding). I/We have read, understood and agree to be ' +
  'bound by the Terms & Conditions and the Code of Conduct set out in this form, as amended by Investoyard from time to time.';

/** Investoyard Business Associate Terms & Conditions (template — subject to legal review). */
const TERMS: string[] = [
  'Appointment. Investoyard appoints the Business Associate ("BA") on a non-exclusive basis to refer clients to, and facilitate applications for, IPOs (Mainboard & SME) and other permitted financial products distributed through Investoyard. This empanelment confers no authority to bind Investoyard or to act in its name beyond such facilitation.',
  'Independent relationship. The BA acts as an independent contractor and bears its own costs, taxes and statutory dues. Nothing herein creates any employment, partnership or joint-venture relationship between the BA and Investoyard.',
  'Regulatory compliance. The BA shall comply with all applicable laws and the regulations, circulars and guidelines of SEBI, the Stock Exchanges, the depositories, RBI and AMFI, and shall obtain and keep current every registration/certification (e.g. ARN, EUIN, NISM) required for the products it distributes.',
  'Own-account applications. Every IPO application, including those of family members, must be made using the applicant’s own PAN, demat account and bank/UPI. The BA shall never fund, route or submit an application from a third-party account (third-party ASBA is prohibited).',
  'KYC & anti-money-laundering. The BA shall follow applicable KYC and PMLA/AML norms, verify client identity, and shall not facilitate any transaction it knows or suspects to be for money-laundering, benami or fraudulent purposes.',
  'Data protection & consent. The BA shall collect, use and share client personal and financial data only with the client’s explicit, itemised consent and strictly in accordance with the Digital Personal Data Protection Act, 2023 and Investoyard’s privacy policy, solely for the permitted purpose, and shall keep such data confidential and secure.',
  'No unauthorised advice / no assured returns. The BA shall not provide investment advice unless duly registered to do so, shall not guarantee or indicate any returns, allotment or listing gains, and shall present grey-market premium (GMP) and similar data as unofficial and not investment advice.',
  'Fair dealing & disclosures. The BA shall deal fairly, make true and complete disclosures, not misrepresent any product, and make available to clients the relevant offer documents (DRHP/RHP/prospectus) and risk factors before an application is made.',
  'Confidentiality. The BA shall keep confidential all client data, pricing, commercial terms and non-public information of Investoyard, both during and after the term of this empanelment.',
  'Commission. Any commission or incentive is governed by a separate written arrangement and applicable regulations. Investoyard may withhold, set off or recover incentives paid on cancelled, rejected, withdrawn or clawed-back business.',
  'Indemnity & limitation of liability. The BA shall indemnify Investoyard against losses, claims, penalties and expenses arising from the BA’s breach, misrepresentation, negligence or non-compliance. Investoyard shall not be liable for allotment outcomes, exchange or depository actions, or market losses.',
  'Term, termination, amendment & governing law. This empanelment takes effect on acceptance by Investoyard and continues until terminated by either party on written notice, or immediately upon breach or loss of a required registration. Obligations relating to confidentiality, data protection and indemnity survive termination. Investoyard may amend these Terms & Conditions and the Code of Conduct with notice, and continued association constitutes acceptance. These terms are governed by the laws of India and subject to the jurisdiction of the competent courts in India.',
];

/** Investoyard Business Associate Code of Conduct (template — subject to legal review). */
const CODE_OF_CONDUCT: string[] = [
  'Place the client’s interest first and take all necessary steps to protect it in every dealing.',
  'Comply with the regulations, circulars and guidelines of SEBI, the Stock Exchanges, the depositories, RBI and AMFI applicable to the products distributed.',
  'Hold and keep current all registrations and certifications required (ARN, EUIN, NISM, etc.) and renew them on time.',
  'Ensure every IPO application uses the applicant’s own PAN, demat and bank/UPI — never fund, route or submit from a third-party account.',
  'Make full, fair and accurate disclosures; do not misrepresent, exaggerate or conceal any material fact about a product.',
  'Do not assure, guarantee or indicate returns, allotment or listing gains; treat GMP and other unofficial data as not investment advice.',
  'Make available the relevant offer documents (DRHP/RHP/prospectus) and highlight risk factors before a client applies.',
  'Do not provide investment advice or portfolio recommendations unless separately registered/authorised to do so.',
  'Obtain the client’s explicit, itemised consent before collecting or sharing personal/financial data; handle it under the DPDP Act, 2023 and keep it confidential and secure.',
  'Follow KYC/AML/PMLA norms, perform due diligence, and decline suspicious, benami or fraudulent transactions.',
  'Do not handle client money or securities outside authorised, regulated payment mechanisms (e.g. the client’s own UPI/ASBA mandate).',
  'Avoid conflicts of interest and any unfair, coercive or misleading sales practice; never split, tamper with or alter a client’s application.',
  'Maintain proper records and cooperate with Investoyard, the regulators and auditors, providing requested documents in a timely manner.',
  'Promptly inform Investoyard in writing of any change in status, constitution, address, contact details, registration or disqualification, and observe high standards of ethics, integrity and confidentiality at all times.',
];

interface Meta {
  name: string;
  code?: string | null;
  kind?: string;
  createdAt?: Date | string;
}

/**
 * Renders the Investoyard Business Associate Empanelment Form — a light, print-ready PDF
 * pre-filled from a partner's Tenant.profile. Uses the real Investoyard wordmark (vector,
 * drawn from logo-paths) and brand colours. Modelled on the JM Financial IFD and Nuvama
 * Business Associate forms, redesigned as our own.
 */
@Injectable()
export class EmpanelmentPdfService {
  private readonly M = 42;
  private readonly PW = 595.28; // A4 width (pt)
  private readonly PH = 841.89; // A4 height (pt)
  private readonly TOP = 46; // top of content on continuation pages
  private get CW() { return this.PW - this.M * 2; }
  private get BOTTOM() { return this.PH - 46; }

  async build(profileRaw: Record<string, any> | null | undefined, meta: Meta): Promise<Buffer> {
    const p = profileRaw ?? {};
    const doc = new PDFDocument({ size: 'A4', margin: this.M, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    let y = this.header(doc, meta);
    y = this.applicant(doc, y, p);
    y = this.contact(doc, y, p);
    y = this.registrations(doc, y, p);
    y = this.products(doc, y, p);
    y = this.bank(doc, y, p);
    y = this.business(doc, y, p);
    y = this.nomination(doc, y, p);
    y = this.documents(doc, y, p);
    y = this.terms(doc, y);
    y = this.codeOfConduct(doc, y);
    y = this.declaration(doc, y);
    this.signatureBlock(doc, y, meta);
    this.footers(doc, meta);

    doc.end();
    return done;
  }

  // ----------------------------------------------------------------- helpers
  private fmt(val: any): string {
    if (val == null || val === '') return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return val.name ? String(val.name) : '';
    const s = String(val);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  }
  private v(p: any, key: string): string { return this.fmt(p?.[key]); }
  private has(p: any, key: string): boolean {
    const val = p?.[key];
    return Array.isArray(val) ? val.length > 0 : val != null && val !== '';
  }

  /** Add a page only if `h` won't fit; returns the y to draw at. */
  private need(doc: PDFKit.PDFDocument, y: number, h: number): number {
    if (y + h > this.BOTTOM) { doc.addPage(); return this.TOP; }
    return y;
  }

  /** Draw the Investoyard wordmark (vector) at x,y scaled to targetW. Returns its height. */
  private logo(doc: PDFKit.PDFDocument, x: number, y: number, targetW: number): number {
    const s = targetW / LOGO_VIEWBOX.w;
    doc.save();
    doc.translate(x, y).scale(s);
    for (const p of LOGO_PATHS) {
      doc.path(p.d).fill(p.c === 'D' ? GOLD : INDIGO, p.r === 'eo' ? 'even-odd' : 'non-zero');
    }
    doc.restore();
    return LOGO_VIEWBOX.h * s;
  }

  private section(doc: PDFKit.PDFDocument, y: number, title: string): number {
    y = this.need(doc, y + 7, 46); // header strip + at least one row must fit
    doc.rect(this.M, y, this.CW, 16).fill(STRIP);
    doc.rect(this.M, y, 3, 16).fill(GOLD);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INDIGO).text(title.toUpperCase(), this.M + 10, y + 4.5, { lineBreak: false, characterSpacing: 0.4 });
    return y + 16 + 7;
  }

  /** A row of label/value cells with a fill-in hairline under each value. */
  private row(doc: PDFKit.PDFDocument, y: number, cells: { label: string; value: string; flex?: number; tall?: boolean }[], region?: { x: number; w: number }): number {
    const gap = 14;
    const X = region?.x ?? this.M;
    const W = region?.w ?? this.CW;
    const tall = cells.some((c) => c.tall);
    const rowH = tall ? 40 : 30;
    y = this.need(doc, y, rowH);
    const totalFlex = cells.reduce((s, c) => s + (c.flex ?? 1), 0);
    const usable = W - gap * (cells.length - 1);
    let x = X;
    for (const c of cells) {
      const w = (usable * (c.flex ?? 1)) / totalFlex;
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor(MUT).text(c.label.toUpperCase(), x, y, { width: w, lineBreak: false, ellipsis: true, characterSpacing: 0.3 });
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(c.value || ' ', x, y + 11, { width: w, height: c.tall ? 20 : 12, lineBreak: !!c.tall, ellipsis: true });
      doc.moveTo(x, y + rowH - 7).lineTo(x + w, y + rowH - 7).lineWidth(0.6).strokeColor(LINE).stroke();
      x += w + gap;
    }
    return y + rowH;
  }

  private checks(doc: PDFKit.PDFDocument, y: number, label: string, options: string[], selected: Set<string>, region?: { x: number; w: number }): number {
    const X = region?.x ?? this.M;
    const W = region?.w ?? this.CW;
    y = this.need(doc, y, 28);
    doc.font('Helvetica-Bold').fontSize(6.6).fillColor(MUT).text(label.toUpperCase(), X, y, { lineBreak: false, characterSpacing: 0.3 });
    const box = 8;
    let x = X;
    let ly = y + 11;
    doc.font('Helvetica').fontSize(8.5);
    for (const opt of options) {
      const itemW = box + 5 + doc.widthOfString(opt);
      if (x + itemW > X + W) { x = X; ly += 14; }
      doc.rect(x, ly, box, box).lineWidth(0.8).strokeColor(INDIGO).stroke();
      if (selected.has(opt)) doc.rect(x + 2, ly + 2, box - 4, box - 4).fill(INDIGO);
      doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(opt, x + box + 4, ly - 0.5, { lineBreak: false });
      x += itemW + 14;
    }
    return ly + box + 7;
  }

  /** Photograph box (affix + sign across), like the sample's Personal Details box. */
  private photoBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void {
    doc.roundedRect(x, y, w, h, 3).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(MUT).text('Please affix your\nphotograph &\nsign across it.', x + 5, y + 12, { width: w - 10, align: 'center', lineGap: 2 });
    // signature "x" marks (sign across the photo)
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUT);
    doc.text('x', x + w - 15, y + h - 44, { lineBreak: false });
    doc.text('x', x + 9, y + h - 18, { lineBreak: false });
  }

  /** A numbered clause list (Terms / Code of Conduct), small type, manual pagination. */
  private clauseList(doc: PDFKit.PDFDocument, y: number, items: string[]): number {
    const numW = 15;
    items.forEach((t, i) => {
      const h = doc.font('Helvetica').fontSize(7.6).heightOfString(t, { width: this.CW - numW, lineGap: 1 });
      y = this.need(doc, y, h + 5);
      doc.font('Helvetica-Bold').fontSize(7.6).fillColor(INDIGO).text(`${i + 1}.`, this.M, y, { width: numW, lineBreak: false });
      doc.font('Helvetica').fontSize(7.6).fillColor(INK).text(t, this.M + numW, y, { width: this.CW - numW, lineGap: 1, align: 'justify' });
      y += h + 5;
    });
    return y;
  }

  // ----------------------------------------------------------------- header
  private header(doc: PDFKit.PDFDocument, meta: Meta): number {
    const logoH = this.logo(doc, this.M, 40, 150);
    // Title
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INDIGO).text('Business Associate Empanelment Form', this.M, 40 + logoH + 8, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(MUT).text('For distribution & facilitation of IPO applications', this.M, 40 + logoH + 22, { lineBreak: false });
    // Gold accent rule
    let y = 40 + logoH + 36;
    doc.rect(this.M, y, this.CW, 2).fill(GOLD);
    y += 12;
    // Meta strip
    const created = meta.createdAt ? this.fmt(new Date(meta.createdAt).toISOString().slice(0, 10)) : '';
    const formNo = meta.code ? `EMP/${meta.code}/${new Date(meta.createdAt ?? Date.now()).getFullYear()}` : '';
    y = this.row(doc, y, [
      { label: 'Business associate', value: meta.name ?? '', flex: 2 },
      { label: 'Channel code', value: meta.code ?? '' },
      { label: 'Form no.', value: formNo },
      { label: 'Date', value: created },
    ]);
    return y + 2;
  }

  // ----------------------------------------------------------------- sections
  private applicant(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Applicant Details');
    // Photograph box on the right; applicant fields flow in the reduced left region.
    const boxW = 92;
    const boxH = 104;
    const gap = 16;
    const boxTop = y - 2;
    const bx = this.M + this.CW - boxW;
    this.need(doc, y, boxH + 6); // keep the box + fields together on one page
    this.photoBox(doc, bx, boxTop, boxW, boxH);
    const region = { x: this.M, w: this.CW - boxW - gap };
    y = this.checks(doc, y, 'Applicant type', APPLICANT_TYPES, new Set([p.applicantType].filter(Boolean)), region);
    if (isIndividual(p.applicantType)) {
      y = this.row(doc, y, [
        { label: 'Title', value: this.v(p, 'title'), flex: 0.7 },
        { label: 'Full name', value: this.v(p, 'fullName'), flex: 2.4 },
      ], region);
      y = this.row(doc, y, [
        { label: "Father's / spouse's name", value: this.v(p, 'fatherName'), flex: 2 },
        { label: 'Gender', value: this.v(p, 'gender') },
        { label: 'Date of birth', value: this.v(p, 'dob') },
      ], region);
      y = this.row(doc, y, [
        { label: 'PAN', value: this.v(p, 'pan') },
        { label: 'Aadhaar', value: this.v(p, 'aadhaar') },
        { label: 'GSTIN', value: this.v(p, 'gstin') },
      ], region);
    } else {
      y = this.row(doc, y, [
        { label: 'Entity / firm name', value: this.v(p, 'entityName'), flex: 2.2 },
        { label: 'Date of incorporation', value: this.v(p, 'incorporationDate'), flex: 1.2 },
      ], region);
      y = this.row(doc, y, [
        { label: 'PAN', value: this.v(p, 'pan') },
        { label: 'GSTIN', value: this.v(p, 'gstin') },
      ], region);
      y = this.row(doc, y, [
        { label: 'CIN / registration no.', value: this.v(p, 'cin') },
      ], region);
    }
    return Math.max(y, boxTop + boxH) + 4;
  }

  private contact(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Contact & Address');
    y = this.row(doc, y, [{ label: 'Correspondence address', value: this.v(p, 'corrAddress'), tall: true }]);
    y = this.row(doc, y, [
      { label: 'City', value: this.v(p, 'corrCity') },
      { label: 'State', value: this.v(p, 'corrState') },
      { label: 'PIN code', value: this.v(p, 'corrPincode') },
    ]);
    y = this.row(doc, y, [{ label: 'Permanent address (if different)', value: this.v(p, 'permAddress'), tall: true }]);
    y = this.row(doc, y, [
      { label: 'City', value: this.v(p, 'permCity') },
      { label: 'State', value: this.v(p, 'permState') },
      { label: 'PIN code', value: this.v(p, 'permPincode') },
    ]);
    y = this.row(doc, y, [
      { label: 'Phone (office)', value: this.v(p, 'phoneOffice') },
      { label: 'Phone (residence)', value: this.v(p, 'phoneResidence') },
      { label: 'Website', value: this.v(p, 'website'), flex: 1.6 },
    ]);
    y = this.row(doc, y, [
      { label: 'Primary contact person', value: this.v(p, 'contactPerson'), flex: 1.6 },
      { label: 'Designation', value: this.v(p, 'contactDesignation') },
      { label: 'Contact mobile', value: this.v(p, 'contactMobile') },
      { label: 'Contact email', value: this.v(p, 'contactEmail'), flex: 1.8 },
    ]);
    y = this.row(doc, y, [
      { label: 'Alternate contact person', value: this.v(p, 'altContactPerson'), flex: 2 },
      { label: 'Alternate mobile', value: this.v(p, 'altContactMobile') },
    ]);
    return y + 3;
  }

  private registrations(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Registrations & Codes');
    y = this.row(doc, y, [
      { label: 'AMFI ARN', value: this.v(p, 'arn') },
      { label: 'ARN valid till', value: this.v(p, 'arnValidity') },
      { label: 'EUIN', value: this.v(p, 'euin') },
      { label: 'AMFI reg. date', value: this.v(p, 'amfiRegDate') },
    ]);
    y = this.row(doc, y, [
      { label: 'NISM certificate no.', value: this.v(p, 'nism') },
      { label: 'NISM valid till', value: this.v(p, 'nismValidity') },
      { label: 'SEBI registration', value: this.v(p, 'sebiRegistration') },
      { label: 'MSME / Udyam no.', value: this.v(p, 'msmeUdyam') },
    ]);
    return y + 3;
  }

  private products(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Products Distributed');
    const selected = new Set<string>(Array.isArray(p.products) ? p.products : []);
    y = this.checks(doc, y, 'Products distributed today', PRODUCT_OPTIONS, selected);
    if (this.has(p, 'otherProducts')) y = this.row(doc, y, [{ label: 'Other products (specify)', value: this.v(p, 'otherProducts') }]);
    return y + 3;
  }

  private bank(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Bank Details (for direct credit of brokerage / incentives)');
    y = this.row(doc, y, [
      { label: 'Account holder name', value: this.v(p, 'bankAccountName'), flex: 2 },
      { label: 'Account type', value: this.v(p, 'bankAccountType') },
      { label: 'Account number', value: this.v(p, 'bankAccountNo'), flex: 1.6 },
    ]);
    y = this.row(doc, y, [
      { label: 'Bank name', value: this.v(p, 'bankName'), flex: 1.6 },
      { label: 'Branch', value: this.v(p, 'bankBranch'), flex: 1.6 },
      { label: 'IFSC', value: this.v(p, 'ifsc') },
      { label: 'MICR', value: this.v(p, 'micr') },
    ]);
    return y + 3;
  }

  private business(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Business Profile');
    y = this.row(doc, y, [
      { label: 'Engagement', value: this.v(p, 'engagement') },
      { label: 'Years in business', value: this.v(p, 'yearsInBusiness') },
      { label: 'No. of branches', value: this.v(p, 'branchCount') },
      { label: 'No. of employees', value: this.v(p, 'employeeCount') },
      { label: 'Approx. AUM (Rs cr)', value: this.v(p, 'aum') },
      { label: 'Client base', value: this.v(p, 'clientBase') },
    ]);
    y = this.row(doc, y, [
      { label: 'Reference 1 — name & contact', value: this.v(p, 'reference1') },
      { label: 'Reference 2 — name & contact', value: this.v(p, 'reference2') },
    ]);
    return y + 3;
  }

  private nomination(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Nomination');
    y = this.row(doc, y, [
      { label: 'Nominee name', value: this.v(p, 'nomineeName'), flex: 2 },
      { label: 'Relationship', value: this.v(p, 'nomineeRelationship') },
      { label: 'Nominee DOB', value: this.v(p, 'nomineeDob') },
    ]);
    y = this.row(doc, y, [
      { label: 'Nominee PAN', value: this.v(p, 'nomineePan') },
      { label: 'Nominee Aadhaar', value: this.v(p, 'nomineeAadhaar') },
      { label: 'Guardian (if minor)', value: this.v(p, 'guardianName'), flex: 1.6 },
      { label: 'Guardian relationship', value: this.v(p, 'guardianRelationship') },
    ]);
    return y + 3;
  }

  private documents(doc: PDFKit.PDFDocument, y: number, p: any): number {
    y = this.section(doc, y, 'Documents Submitted');
    // Reserve the whole checklist so it never splits into a blank tail.
    const rows = Math.ceil(DOC_FIELDS.length / 2);
    y = this.need(doc, y, rows * 15 + 4);
    const box = 8;
    const colW = this.CW / 2;
    let rowY = y;
    DOC_FIELDS.forEach((d, idx) => {
      const col = idx % 2;
      if (col === 0 && idx > 0) rowY += 15;
      const x = this.M + col * colW;
      doc.rect(x, rowY, box, box).lineWidth(0.8).strokeColor(INDIGO).stroke();
      if (this.has(p, d.key)) doc.rect(x + 2, rowY + 2, box - 4, box - 4).fill(INDIGO);
      doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(d.label, x + box + 5, rowY - 0.5, { width: colW - box - 12, lineBreak: false, ellipsis: true });
    });
    return rowY + 15 + 4;
  }

  private terms(doc: PDFKit.PDFDocument, y: number): number {
    y = this.section(doc, y, 'Terms & Conditions');
    y = this.need(doc, y, 14);
    doc.font('Helvetica').fontSize(7.6).fillColor(MUT).text('As a Business Associate of Investoyard, I/We agree to abide by the following Terms & Conditions:', this.M, y, { width: this.CW });
    y += 14;
    return this.clauseList(doc, y, TERMS) + 3;
  }

  private codeOfConduct(doc: PDFKit.PDFDocument, y: number): number {
    y = this.section(doc, y, 'Code of Conduct');
    return this.clauseList(doc, y, CODE_OF_CONDUCT) + 3;
  }

  private declaration(doc: PDFKit.PDFDocument, y: number): number {
    y = this.section(doc, y, 'Declaration & Acceptance');
    const h = doc.font('Helvetica').fontSize(8).heightOfString(DECLARATION, { width: this.CW, lineGap: 1.5 });
    y = this.need(doc, y, h + 4);
    doc.fillColor(INK).font('Helvetica').fontSize(8).text(DECLARATION, this.M, y, { width: this.CW, lineGap: 1.5, align: 'justify' });
    return y + h + 8;
  }

  /** Signature + office-use, drawn as one reserved block (no internal page breaks). */
  private signatureBlock(doc: PDFKit.PDFDocument, y: number, meta: Meta): void {
    const H = 138;
    y = this.need(doc, y + 6, H);
    const half = (this.CW - 24) / 2;

    // Signature line (left) + stamp box (right)
    const sigY = y + 30;
    doc.moveTo(this.M, sigY).lineTo(this.M + half, sigY).lineWidth(0.7).strokeColor(INK).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUT).text('SIGNATURE OF BUSINESS ASSOCIATE', this.M, sigY + 3, { lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(MUT).text('(For entities: authorised signatory with rubber stamp)', this.M, sigY + 13, { lineBreak: false });
    doc.roundedRect(this.M + half + 24, y, half - 24, 44, 3).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUT).text('Stamp (Sole Prop. / Partnership / Company / HUF / Trust)', this.M + half + 30, y + 4, { width: half - 36 });

    // Name / Place / Date line
    let ny = sigY + 26;
    const third = (this.CW - 28) / 3;
    const nameCells = [
      { label: 'Name', value: meta.name ?? '', w: third + 40 },
      { label: 'Place', value: '', w: third - 20 },
      { label: 'Date', value: '', w: third - 20 },
    ];
    let nx = this.M;
    for (const c of nameCells) {
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor(MUT).text(c.label.toUpperCase(), nx, ny, { lineBreak: false });
      doc.moveTo(nx, ny + 18).lineTo(nx + c.w, ny + 18).lineWidth(0.6).strokeColor(LINE).stroke();
      if (c.value) doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(c.value, nx, ny + 8, { width: c.w, lineBreak: false, ellipsis: true });
      nx += c.w + 14;
    }

    // For office use only
    const oy = ny + 30;
    doc.rect(this.M, oy, this.CW, 15).fill(STRIP);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INDIGO).text('FOR OFFICE USE ONLY', this.M + 8, oy + 4, { lineBreak: false, characterSpacing: 0.4 });
    const fy = oy + 22;
    const officeCells = [
      { label: 'Code allotted', value: meta.code ?? '' },
      { label: 'Accepted on', value: '' },
      { label: 'RM name', value: '' },
      { label: 'Authorised signatory', value: '' },
    ];
    const ow = (this.CW - 14 * 3) / 4;
    let ox = this.M;
    for (const c of officeCells) {
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor(MUT).text(c.label.toUpperCase(), ox, fy, { width: ow, lineBreak: false, ellipsis: true });
      if (c.value) doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(c.value, ox, fy + 11, { width: ow, lineBreak: false, ellipsis: true });
      doc.moveTo(ox, fy + 23).lineTo(ox + ow, fy + 23).lineWidth(0.6).strokeColor(LINE).stroke();
      ox += ow + 14;
    }
  }

  private footers(doc: PDFKit.PDFDocument, meta: Meta): void {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Footer sits below the bottom margin — zero the margin while drawing so pdfkit
      // doesn't treat it as text overflow and auto-append a blank page.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = this.PH - 30;
      doc.font('Helvetica').fontSize(7).fillColor(MUT)
        .text(`Investoyard · Business Associate Empanelment Form${meta.code ? `  ·  Code ${meta.code}` : ''}`, this.M, fy, { lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, this.PW - this.M - 90, fy, { width: 90, align: 'right', lineBreak: false });
      doc.page.margins.bottom = savedBottom;
    }
  }
}
