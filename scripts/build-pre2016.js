/**
 * Extract the pre-2016 slice of the operator's pre-filled workbook into an
 * importer-ready sheet, and report what it is actually worth.
 *
 * NSE's public-past-issues feed carries NOTHING before 2016 (12 SME rows, zero
 * mainboard) and BSE's API is WAF-blocked from this server, so this workbook is
 * the only available source for 2010-2015. It is aggregator-derived rather than
 * primary-source, which is why every row it produces is reported, validated and
 * lands hidden for review rather than being trusted silently.
 *
 *   node scripts/build-pre2016.js [cutoffISO]     default cutoff 2016-01-01
 */
const XLSX = require('xlsx');
const path = require('path');
const SRC = 'C:/Users/finwave/Desktop/Investoyard-Data-Prefilled.xlsx';
const CUTOFF = process.argv[2] || '2016-01-01';

/** Excel serial (1900 system) or a text date → ISO. */
const iso = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[-/]([A-Za-z]{3,})[-/](\d{4})$/.exec(s);
  if (m) {
    const M = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[m[2].slice(0, 3).toLowerCase()];
    if (M) return `${m[3]}-${String(M).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
};

/** ISIN check digit: expand letters to two digits, then Luhn over the result. */
function isinValid(s) {
  const v = String(s || '').trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) return false;
  let digits = '';
  for (const ch of v.slice(0, 11)) digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  let sum = 0, dbl = true;                       // rightmost body digit is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10 === Number(v[11]);
}

const wb = XLSX.readFile(SRC);
const sheet = wb.Sheets['IPO'];
const head = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 })[0]; // row 2 = headers
const all = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '' });

const dateOf = (r) => iso(r['Open date *']) || iso(r['Listing date']) || iso(r['Close date *']);
const pre = all.filter((r) => { const d = dateOf(r); return d && d < CUTOFF; });

/* ── quality report ── */
const stat = { rows: pre.length, isin: 0, isinBad: [], price: 0, size: 0, lot: 0, resv: 0, dateOrder: 0, badOrder: [] };
const boards = {}, years = {};
for (const r of pre) {
  const d = dateOf(r);
  years[d.slice(0, 4)] = (years[d.slice(0, 4)] || 0) + 1;
  boards[String(r['Board *'] || '?')] = (boards[String(r['Board *'] || '?')] || 0) + 1;
  const isinV = String(r['ISIN'] || '').trim();
  if (isinV) { stat.isin++; if (!isinValid(isinV)) stat.isinBad.push(`${r['Symbol *']}:${isinV}`); }
  if (r['Price band max (₹) *'] !== '') stat.price++;
  if (r['Total issue size (₹ Cr) *'] !== '') stat.size++;
  if (r['Lot size (shares) *'] !== '') stat.lot++;
  if (r['Retail reservation (%)'] !== '') stat.resv++;
  const o = iso(r['Open date *']), c = iso(r['Close date *']), l = iso(r['Listing date']);
  if (o && c && l) { if (o <= c && c <= l) stat.dateOrder++; else stat.badOrder.push(r['Symbol *']); }
}

console.log(`pre-${CUTOFF.slice(0, 4)} rows: ${stat.rows}`);
console.log('boards :', JSON.stringify(boards));
console.log('years  :', Object.keys(years).sort().map((y) => `${y}:${years[y]}`).join('  '));
console.log(`filled : ISIN ${stat.isin}/${stat.rows}  price ${stat.price}  issueSize ${stat.size}  lot ${stat.lot}  reservations ${stat.resv}`);
console.log(`ISIN check digit: ${stat.isin - stat.isinBad.length}/${stat.isin} valid${stat.isinBad.length ? '  BAD: ' + stat.isinBad.slice(0, 8).join(' ') : ''}`);
console.log(`date order open<=close<=listing: ${stat.dateOrder} verified${stat.badOrder.length ? '  OUT OF ORDER: ' + stat.badOrder.slice(0, 8).join(' ') : ''}`);

/* ── write the importer-ready sheet, preserving the source's exact columns ── */
const aoa = [
  new Array(head.length).fill(''),                       // band row (row 1)
  head,                                                  // headers (row 2)
  new Array(head.length).fill(''),                       // example row (row 3, skipped by the importer)
  ...pre.map((r) => head.map((h) => {
    const v = r[h];
    // dates must reach the importer as ISO text, not as 1900-system serials
    if (/date/i.test(h)) return iso(v) || '';
    return v === '' ? '' : v;
  })),
];
aoa[0][0] = `Pre-${CUTOFF.slice(0, 4)} slice of Investoyard-Data-Prefilled.xlsx — aggregator-derived, NOT exchange primary source`;
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = head.map((h) => ({ wch: Math.min(30, Math.max(11, String(h).length + 2)) }));
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, ws, 'IPO');

/* carry the financial rows for just these symbols */
const wanted = new Set(pre.map((r) => String(r['Symbol *']).toUpperCase()));
if (wb.Sheets['IPO_Financials']) {
  const fh = XLSX.utils.sheet_to_json(wb.Sheets['IPO_Financials'], { header: 1, range: 1 })[0];
  const fr = XLSX.utils.sheet_to_json(wb.Sheets['IPO_Financials'], { range: 1, defval: '' })
    .filter((r) => wanted.has(String(r['Symbol *']).toUpperCase()));
  const fa = [new Array(fh.length).fill(''), fh, new Array(fh.length).fill(''),
    ...fr.map((r) => fh.map((h) => (/period/i.test(h) ? (iso(r[h]) || r[h]) : r[h])))];
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(fa), 'IPO_Financials');
  console.log(`financial rows carried: ${fr.length}`);
}

const file = path.join(require('os').homedir(), 'Desktop', `Investoyard-pre${CUTOFF.slice(0, 4)}.xlsx`);
XLSX.writeFile(out, file);
console.log('\nwritten:', file);
