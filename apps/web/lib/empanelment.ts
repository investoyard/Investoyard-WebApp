/**
 * Partner empanelment field model — synthesised from the JM Financial IFD Profiling
 * Form and the Nuvama Business Associate Empanelment Form. Both partner and white-label
 * partners use the SAME registration; white-label only adds brand fields (asked separately).
 *
 * The registration form renders these sections generically and stores the answers in
 * Tenant.profile (a JSON blob). `doc` fields upload the actual document and store { url, name }.
 */
export type FieldType = 'text' | 'textarea' | 'date' | 'tel' | 'email' | 'number' | 'select' | 'products' | 'doc';

export interface EField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  hint?: string;
  span?: 2 | 3;
  full?: boolean;
  showFor?: 'individual' | 'entity'; // omitted → always shown
}
export interface ESection {
  key: string;
  title: string;
  desc?: string;
  fields: EField[];
}

export const APPLICANT_TYPES = ['Individual', 'Sole Proprietor', 'Partnership', 'LLP', 'Company', 'HUF', 'Trust', 'Other'];
export const PRODUCT_OPTIONS = ['Mutual Funds', 'Public Issues / IPOs', 'Bonds / NCDs', 'Fixed Deposits', 'Insurance', 'Loans', 'AIF & PMS', 'Others'];
const INDIVIDUAL_TYPES = new Set(['Individual', 'Sole Proprietor', 'HUF']);

/** Is this applicant type an individual (vs a non-individual entity)? */
export const isIndividual = (t?: string) => !t || INDIVIDUAL_TYPES.has(t);

export const EMPANELMENT: ESection[] = [
  {
    key: 'applicant', title: 'Applicant', desc: 'Who is being empanelled.',
    fields: [
      { key: 'applicantType', label: 'Applicant type', type: 'select', options: APPLICANT_TYPES, required: true, span: 2 },
      { key: 'title', label: 'Title', type: 'select', options: ['Mr', 'Mrs', 'Ms', 'Dr'], showFor: 'individual' },
      { key: 'fullName', label: 'Full name', type: 'text', required: true, span: 2, showFor: 'individual' },
      { key: 'entityName', label: 'Entity / firm name', type: 'text', required: true, span: 3, showFor: 'entity' },
      { key: 'fatherName', label: "Father's / spouse's name", type: 'text', span: 2, showFor: 'individual' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], showFor: 'individual' },
      { key: 'dob', label: 'Date of birth', type: 'date', showFor: 'individual' },
      { key: 'incorporationDate', label: 'Date of incorporation', type: 'date', showFor: 'entity' },
      { key: 'pan', label: 'PAN', type: 'text', required: true },
      { key: 'aadhaar', label: 'Aadhaar', type: 'text', showFor: 'individual' },
      { key: 'gstin', label: 'GSTIN', type: 'text' },
      { key: 'cin', label: 'CIN / registration no.', type: 'text', showFor: 'entity' },
    ],
  },
  {
    key: 'contact', title: 'Contact & address', desc: 'Correspondence and permanent address, and who we deal with.',
    fields: [
      { key: 'corrAddress', label: 'Correspondence address', type: 'textarea', full: true, required: true },
      { key: 'corrCity', label: 'City', type: 'text' },
      { key: 'corrState', label: 'State', type: 'text' },
      { key: 'corrPincode', label: 'PIN code', type: 'text' },
      { key: 'permAddress', label: 'Permanent address (if different)', type: 'textarea', full: true },
      { key: 'permCity', label: 'City', type: 'text' },
      { key: 'permState', label: 'State', type: 'text' },
      { key: 'permPincode', label: 'PIN code', type: 'text' },
      { key: 'phoneOffice', label: 'Phone (office)', type: 'tel' },
      { key: 'phoneResidence', label: 'Phone (residence)', type: 'tel' },
      { key: 'website', label: 'Website', type: 'text' },
      { key: 'contactPerson', label: 'Primary contact person', type: 'text', span: 2 },
      { key: 'contactDesignation', label: 'Designation', type: 'text' },
      { key: 'contactMobile', label: 'Contact mobile', type: 'tel' },
      { key: 'contactEmail', label: 'Contact email', type: 'email', span: 2 },
      { key: 'altContactPerson', label: 'Alternate contact person', type: 'text', span: 2 },
      { key: 'altContactMobile', label: 'Alternate mobile', type: 'tel' },
    ],
  },
  {
    key: 'registrations', title: 'Registrations & codes', desc: 'AMFI / NISM / SEBI credentials and validity.',
    fields: [
      { key: 'arn', label: 'AMFI ARN', type: 'text' },
      { key: 'arnValidity', label: 'ARN valid till', type: 'date' },
      { key: 'euin', label: 'EUIN', type: 'text' },
      { key: 'amfiRegDate', label: 'AMFI registration date', type: 'date' },
      { key: 'nism', label: 'NISM certificate no.', type: 'text' },
      { key: 'nismValidity', label: 'NISM valid till', type: 'date' },
      { key: 'sebiRegistration', label: 'SEBI registration (if any)', type: 'text', span: 2 },
      { key: 'msmeUdyam', label: 'MSME / Udyam no.', type: 'text' },
    ],
  },
  {
    key: 'products', title: 'Products distributed', desc: 'What the associate distributes today.',
    fields: [
      { key: 'products', label: 'Products', type: 'products', full: true },
      { key: 'otherProducts', label: 'Other products (specify)', type: 'text', full: true },
    ],
  },
  {
    key: 'bank', title: 'Bank / direct credit', desc: 'Where brokerage / incentives are credited.',
    fields: [
      { key: 'bankAccountName', label: 'Account holder name', type: 'text', span: 2 },
      { key: 'bankAccountType', label: 'Account type', type: 'select', options: ['Savings', 'Current'] },
      { key: 'bankName', label: 'Bank name', type: 'text', span: 2 },
      { key: 'bankBranch', label: 'Branch', type: 'text' },
      { key: 'bankAccountNo', label: 'Account number', type: 'text' },
      { key: 'ifsc', label: 'IFSC', type: 'text' },
      { key: 'micr', label: 'MICR', type: 'text' },
    ],
  },
  {
    key: 'business', title: 'Business profile', desc: 'Scale and references.',
    fields: [
      { key: 'engagement', label: 'Engagement', type: 'select', options: ['Full-time', 'Part-time'] },
      { key: 'yearsInBusiness', label: 'Years in business', type: 'number' },
      { key: 'branchCount', label: 'No. of branches', type: 'number' },
      { key: 'employeeCount', label: 'No. of employees', type: 'number' },
      { key: 'aum', label: 'Approx. AUM (₹ cr)', type: 'number' },
      { key: 'clientBase', label: 'Approx. client base', type: 'number' },
      { key: 'reference1', label: 'Reference 1 — name & contact', type: 'text', span: 2 },
      { key: 'reference2', label: 'Reference 2 — name & contact', type: 'text', span: 2 },
    ],
  },
  {
    key: 'nomination', title: 'Nomination', desc: 'Nominee for brokerage dues (guardian if minor).',
    fields: [
      { key: 'nomineeName', label: 'Nominee name', type: 'text', span: 2 },
      { key: 'nomineeRelationship', label: 'Relationship', type: 'text' },
      { key: 'nomineeDob', label: 'Nominee DOB', type: 'date' },
      { key: 'nomineePan', label: 'Nominee PAN', type: 'text' },
      { key: 'nomineeAadhaar', label: 'Nominee Aadhaar', type: 'text' },
      { key: 'guardianName', label: 'Guardian (if minor)', type: 'text', span: 2 },
      { key: 'guardianRelationship', label: 'Guardian relationship', type: 'text' },
    ],
  },
  {
    key: 'documents', title: 'Documents', desc: 'Upload the actual documents (PDF or image, up to 8 MB each).',
    fields: [
      { key: 'docPan', label: 'PAN card', type: 'doc' },
      { key: 'docAadhaar', label: 'Aadhaar', type: 'doc', showFor: 'individual' },
      { key: 'docAddressProof', label: 'Address proof', type: 'doc' },
      { key: 'docCancelledCheque', label: 'Cancelled cheque', type: 'doc' },
      { key: 'docArnCert', label: 'ARN / AMFI certificate', type: 'doc' },
      { key: 'docNismCert', label: 'NISM certificate', type: 'doc' },
      { key: 'docGst', label: 'GST certificate', type: 'doc' },
      { key: 'docPhoto', label: 'Photograph', type: 'doc' },
      { key: 'docCoi', label: 'Certificate of incorporation', type: 'doc', showFor: 'entity' },
      { key: 'docBoardResolution', label: 'Board resolution', type: 'doc', showFor: 'entity' },
      { key: 'docMoaAoa', label: 'MOA & AOA', type: 'doc', showFor: 'entity' },
      { key: 'docPartnershipDeed', label: 'Partnership deed', type: 'doc', showFor: 'entity' },
      { key: 'docAuthSignatories', label: 'Authorised signatories list', type: 'doc', showFor: 'entity' },
    ],
  },
];
