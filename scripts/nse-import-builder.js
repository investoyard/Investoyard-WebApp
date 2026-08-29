/**
 * Build an importer-ready workbook from NSE's own published issue data.
 *
 *   node scripts/nse-import-builder.js 2025 2026
 *
 * Two NSE endpoints, both public:
 *   public-past-issues        the list of issues, with dates and price band
 *   ipo-detail?symbol=&series= per-issue facts — lot size, face value, tick,
 *                             registrar, lead managers, UPI mandate cut-off
 *
 * Output matches apps/api/src/modules/ipo-import/workbook-map.ts exactly:
 * row 1 section bands, row 2 headers, row 3 a grey EXAMPLE row the importer
 * skips, data from row 4.
 *
 * WHAT THIS DOES NOT DO. Reservation percentages are not in NSE's payload and
 * are left EMPTY rather than inferred. 75/15/10 is the usual ICDR 6(2) shape
 * but "usual" is not "accurate", and a guessed split publishes wrong share
 * counts on every derived figure. The RHP link is carried through instead so
 * the real numbers can be read off the source document.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx'); // hoisted to the workspace root

const YEARS = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
if (!YEARS.length) { console.error('usage: node nse-import-builder.js 2025 2026'); process.exit(1); }

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  accept: 'application/json',
  referer: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
              JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
/** "24-AUG-2026" and "27-July-2026" both appear in NSE's payloads. */
const iso = (v) => {
  const m = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(String(v || '').trim());
  if (!m) return '';
  const mm = MON[m[2].slice(0, 3).toUpperCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : '';
};
const numOf = (s) => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** the same fact carries different titles on the two boards */
const fact = (list, ...names) => {
  for (const n of names) {
    const hit = list.find((x) => String(x.title || '').toLowerCase().trim() === n);
    if (hit && clean(hit.value)) return clean(hit.value);
  }
  return '';
};

/** "Rs.938 to Rs.988" / "Rs. 750 to Rs. 788 per Equity Share" → [938, 988] */
const band = (s) => {
  const nums = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return [null, null];
  if (nums.length === 1) return [Number(nums[0]), Number(nums[0])];
  return [Number(nums[0]), Number(nums[1])];
};

/** pull "Fresh Issue ... ₹X Cr" / "Offer for Sale ... N shares" out of the prose */
const legs = (text) => {
  const t = String(text || '');
  const cr = (re) => { const m = re.exec(t); return m ? Number(String(m[1]).replace(/,/g, '')) : null; };
  return {
    freshCr: cr(/fresh\s+issue[^₹\d]{0,40}(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*cr/i),
    ofsCr: cr(/offer\s+for\s+sale[^₹\d]{0,40}(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*cr/i),
    freshSh: cr(/fresh\s+issue[^\d]{0,40}([\d,]{5,})\s*(?:equity\s*)?shares/i),
    ofsSh: cr(/offer\s+for\s+sale[^\d]{0,40}([\d,]{5,})\s*(?:equity\s*)?shares/i),
  };
};

(async () => {
  console.log('fetching NSE past-issues list…');
  const listRes = await fetch('https://www.nseindia.com/api/public-past-issues', { headers: H, signal: AbortSignal.timeout(40000) });
  if (!listRes.ok) { console.error('list HTTP ' + listRes.status); process.exit(1); }
  const all = await listRes.json();

  const wanted = all.filter((r) =>
    YEARS.includes(String(r.ipoStartDate || '').slice(-4)) && ['EQ', 'SME'].includes(r.securityType));
  console.log(`${wanted.length} equity issues across ${YEARS.join(', ')}\n`);

  const out = [];
  let done = 0, noDetail = 0;
  for (const r of wanted) {
    let L = [];
    try {
      const res = await fetch(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(r.symbol)}&series=${r.securityType}`,
        { headers: H, signal: AbortSignal.timeout(20000) });
      if (res.ok) { const d = await res.json(); L = (d && d.issueInfo && d.issueInfo.dataList) || []; }
    } catch { /* falls through as a detail-less row */ }
    if (!L.length) noDetail++;

    const [pmin, pmax] = band(fact(L, 'price range') || r.priceRange);
    const sizeText = fact(L, 'issue size');
    const lg = legs(sizeText);
    const lot = numOf(fact(L, 'lot size', 'bid lot', 'minimum order quantity'));

    out.push({
      symbol: r.symbol,
      name: clean(r.company),
      board: r.securityType === 'SME' ? 'SME' : 'Mainboard',
      exchanges: r.securityType === 'SME' ? 'NSE SME' : 'NSE',
      faceValue: numOf(fact(L, 'face value')),
      issueType: fact(L, 'issue type') || 'Book-built',
      pmin, pmax,
      lot,
      minAmount: lot && pmax ? lot * pmax : null,
      freshCr: lg.freshCr, ofsCr: lg.ofsCr, freshSh: lg.freshSh, ofsSh: lg.ofsSh,
      openDate: iso(r.ipoStartDate),
      closeDate: iso(r.ipoEndDate),
      listingDate: iso(r.listingDate),
      upiCutoff: fact(L, 'cut-off time for upi mandate confirmation'),
      leads: fact(L, 'book running lead managers', 'lead manager'),
      registrar: fact(L, 'name of the registrar'),
      tick: numOf(fact(L, 'tick size')),
      issuePrice: numOf(r.issuePrice),
      rhp: fact(L, 'red herring prospectus'),
      sizeText,
    });

    if (++done % 25 === 0) console.log(`  …${done}/${wanted.length}`);
    await sleep(850); // polite
  }

  /* ── build the sheet in the importer's exact shape ── */
  const headers = [
    'Symbol *', 'Company name *', 'Board *', 'Exchanges * (comma-sep)', 'ISIN', 'Logo URL',
    'Issue type *', 'Face value (₹)', 'Price band min (₹) *', 'Price band max (₹) *',
    'Lot size (shares) *', 'Min amount (₹)', 'Total issue size (₹ Cr) *',
    'Fresh issue (₹ Cr)', 'Fresh issue (shares)', 'OFS portion (₹ Cr)', 'OFS portion (shares)',
    'QIB reservation (%)', 'NII reservation (%)', 'Retail reservation (%)',
    'Open date *', 'Close date *', 'Listing date',
    'Lead managers (comma-sep)', 'Registrar', 'Objects of the issue',
  ];
  const bands = ['Identity', '', '', '', '', '', 'Issue structure', '', '', '', '', '', '', '', '', '', '',
                 'Reservation (from RHP — NOT in NSE data)', '', '', 'Timetable', '', '',
                 'Intermediaries', '', 'Documents'];
  const example = ['EXAMPLE', 'Example Industries Limited', 'Mainboard', 'NSE', '', '',
    'Book-built', 10, 100, 105, 100, 10500, 250, 200, '', 50, '', '', '', '',
    '2026-01-01', '2026-01-03', '2026-01-08', 'Example Capital', 'Example Registrar', ''];

  const rows = out.map((o) => [
    o.symbol, o.name, o.board, o.exchanges, '', '',
    o.issueType, o.faceValue, o.pmin, o.pmax,
    o.lot, o.minAmount,
    (o.freshCr != null && o.ofsCr != null) ? o.freshCr + o.ofsCr : (o.freshCr ?? o.ofsCr ?? null),
    o.freshCr, o.freshSh, o.ofsCr, o.ofsSh,
    '', '', '',                                   // reservations: from the RHP, never guessed
    o.openDate, o.closeDate, o.listingDate,
    o.leads, o.registrar, '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([bands, headers, example, ...rows]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(30, Math.max(11, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'IPO');

  /* a second sheet holding what NSE gave us but the importer has no column for */
  const refHead = ['Symbol', 'UPI mandate cut-off', 'Tick size', 'Final issue price', 'RHP link', 'Issue size (NSE text)'];
  const refRows = out.map((o) => [o.symbol, o.upiCutoff, o.tick, o.issuePrice, o.rhp, o.sizeText]);
  const ws2 = XLSX.utils.aoa_to_sheet([refHead, ...refRows]);
  ws2['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 60 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'NSE_REFERENCE');

  const file = path.join(require('os').homedir(), 'Desktop', `Investoyard-NSE-${YEARS.join('-')}.xlsx`);
  XLSX.writeFile(wb, file);

  const pc = (f) => Math.round((out.filter(f).length / out.length) * 100) + '%';
  console.log('\nwritten: ' + file);
  console.log('rows            : ' + out.length +
    '  (Mainboard ' + out.filter((o) => o.board === 'Mainboard').length +
    ' · SME ' + out.filter((o) => o.board === 'SME').length + ')');
  console.log('no detail page  : ' + noDetail);
  console.log('\nfill rate:');
  console.log('  lot size      ' + pc((o) => o.lot));
  console.log('  price band    ' + pc((o) => o.pmin && o.pmax));
  console.log('  face value    ' + pc((o) => o.faceValue));
  console.log('  registrar     ' + pc((o) => o.registrar));
  console.log('  lead managers ' + pc((o) => o.leads));
  console.log('  listing date  ' + pc((o) => o.listingDate));
  console.log('  issue size Cr ' + pc((o) => o.freshCr != null || o.ofsCr != null));
  console.log('  UPI cut-off   ' + pc((o) => o.upiCutoff));
})();
