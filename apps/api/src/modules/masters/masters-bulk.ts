/**
 * Bulk upload for the masters that are worth loading in bulk — Registrars,
 * Lead Managers and Anchor Investors.
 *
 * Two steps, deliberately, and the same shape as the IPO catalog importer: the
 * upload PARSES and VALIDATES only, and nothing is written until the operator
 * confirms what they were shown. Unlike that importer the parsed rows come back
 * to the browser and are posted again to commit, so there is no temp file to
 * expire — these sheets are tens of rows, not thousands.
 *
 * Existing rows are SKIPPED, never updated (operator decision): an upload can
 * add to the masters but can never quietly rewrite a record someone typed.
 * Matching is on the field the database actually makes unique — `shortCode` for
 * the org kinds, `name` for anchors — not on a display name that legitimately
 * repeats.
 */
import { BadRequestException } from '@nestjs/common';

export type BulkKind = 'registrars' | 'lead-managers' | 'anchors';
export const BULK_KINDS = new Set<string>(['registrars', 'lead-managers', 'anchors']);

export interface BulkColumn { header: string; field: string; required?: boolean; bool?: boolean }

/** Column layout per kind. Headers are the operator's words, not field names. */
export function columnsFor(kind: string): BulkColumn[] {
  if (kind === 'anchors') {
    return [
      { header: 'Name *', field: 'name', required: true },
      { header: 'Type', field: 'type' },
      { header: 'Notes', field: 'notes' },
      { header: 'Active (Y/N)', field: 'active', bool: true },
    ];
  }
  const org: BulkColumn[] = [
    { header: 'Name *', field: 'name', required: true },
    { header: 'Short code *', field: 'shortCode', required: true },
    { header: 'Contact person', field: 'contactPerson' },
    { header: 'Mobile', field: 'mobile' },
    { header: 'Email', field: 'email' },
    { header: 'Phone', field: 'phone' },
    { header: 'GSTIN', field: 'gstin' },
    { header: 'Address 1', field: 'address1' },
    { header: 'Address 2', field: 'address2' },
    { header: 'City', field: 'city' },
    { header: 'State', field: 'state' },
    { header: 'Pincode', field: 'pincode' },
  ];
  if (kind === 'registrars') org.push({ header: 'Allotment URL', field: 'allotmentUrl' });
  org.push({ header: 'Active (Y/N)', field: 'active', bool: true });
  return org;
}

/** The field the database makes unique — what "already exists" actually means. */
export const uniqueFieldFor = (kind: string): 'shortCode' | 'name' =>
  (kind === 'anchors' ? 'name' : 'shortCode');

export interface ParsedRow {
  row: number;
  data: Record<string, any>;
  errors: string[];
}

const str = (v: any) => String(v ?? '').trim();
const truthy = (v: any) => {
  const s = str(v).toLowerCase();
  if (!s) return undefined;                       // blank means "unset", not "inactive"
  return ['y', 'yes', 'true', '1', 'active'].includes(s);
};

/**
 * Read the sheet. Row 1 is the header; data starts at row 2. A row where every
 * cell is blank is skipped silently — trailing blank rows are what spreadsheets
 * do, not something to report as an error.
 */
export function parseSheet(buf: Buffer, kind: string): { rows: ParsedRow[]; headerMissing: string[] } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  let wb: any;
  try {
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch (e: any) {
    throw new BadRequestException(`Could not read the file: ${String(e?.message ?? e).slice(0, 140)}`);
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new BadRequestException('The file has no sheets.');

  const cols = columnsFor(kind);
  const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const present = new Set(raw.length ? Object.keys(raw[0]).map((h) => h.trim().toLowerCase()) : []);
  const headerMissing = cols.filter((c) => c.required && !present.has(c.header.toLowerCase())).map((c) => c.header);
  if (headerMissing.length) return { rows: [], headerMissing };

  // header lookup is case- and space-insensitive; operators retype these by hand
  const pick = (r: any, header: string) => {
    const key = Object.keys(r).find((k) => k.trim().toLowerCase() === header.toLowerCase());
    return key ? r[key] : '';
  };

  const rows: ParsedRow[] = [];
  raw.forEach((r, i) => {
    if (cols.every((c) => str(pick(r, c.header)) === '')) return;   // blank row
    const data: Record<string, any> = {};
    const errors: string[] = [];
    for (const c of cols) {
      const v = pick(r, c.header);
      if (c.bool) { const b = truthy(v); if (b !== undefined) data[c.field] = b; continue; }
      const s = str(v);
      if (s) data[c.field] = s;
      else if (c.required) errors.push(`${c.header.replace(' *', '')} is required`);
    }
    if (typeof data.shortCode === 'string') data.shortCode = data.shortCode.toUpperCase();
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errors.push('Email looks wrong');
    if (data.pincode && !/^\d{6}$/.test(data.pincode)) errors.push('Pincode should be 6 digits');
    rows.push({ row: i + 2, data, errors });   // +2: row 1 is the header
  });
  return { rows, headerMissing: [] };
}

/** A blank workbook with the right headers — bulk upload is guesswork without one. */
export function templateBuffer(kind: string): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const cols = columnsFor(kind);
  const example: Record<string, any> = {};
  for (const c of cols) example[c.header] = '';
  example['Name *'] = kind === 'anchors' ? 'Example Mutual Fund' : 'Example Services Private Limited';
  if (kind !== 'anchors') example['Short code *'] = 'EXAMPLE';
  if (kind === 'anchors') example['Type'] = 'Mutual Fund';
  example['Active (Y/N)'] = 'Y';
  const ws = XLSX.utils.json_to_sheet([example], { header: cols.map((c) => c.header) });
  ws['!cols'] = cols.map((c) => ({ wch: Math.min(34, Math.max(12, c.header.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rows');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
