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

/** An ISO date, but only if it lands within `days` after `after`. Else ''. */
function closeWithin(value, after, days) {
  const v = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !after) return '';
  const gap = (Date.parse(v) - Date.parse(after)) / 864e5;
  return gap >= 0 && gap <= days ? v : '';
}

/**
 * Final category-wise subscription from NSE's `activeCat` table.
 *
 * Row conventions, measured across 2016-2024 on both boards:
 *   - the first row is a HEADER (srNo === 'Sr.No.') — skip it
 *   - top-level categories carry an integer srNo: 1 QIB · 2 NII · 3 Retail · 4 reserved
 *   - '2.1' / '2.2' are the bNII (>₹10L) / sNII (>₹2L) split, present only from 2022
 *   - '1(a)', '2(b)' … are sub-details of the row above — skip
 *   - the trailing row has an EMPTY srNo and holds the totals
 *
 * Categories are matched by NAME rather than position: an issue with a
 * shareholder quota but no employee quota still puts it at srNo 4.
 *
 * Returns nothing when the offered column totals zero — many SME issues report
 * every category as 0 offered, which makes `noOfTotalMeant` a meaningless 0.00.
 * Writing those as a real 0× subscription would be a lie, not a gap.
 */
function subscriptionOf(activeCat) {
  const L = (activeCat && activeCat.dataList) || [];
  if (!L.length) return null;
  const out = {};
  let totalTimes = null, totalOffered = null;

  for (const c of L) {
    const sr = String(c.srNo ?? '').trim();
    if (sr === 'Sr.No.') continue;
    const times = numOf(c.noOfTotalMeant);
    if (!sr) {                                   // the totals row
      totalTimes = times;
      totalOffered = numOf(c.noOfShareOffered);
      continue;
    }
    if (sr.includes('(')) continue;              // a lettered sub-row
    // 0x means the category was either not offered or drew no bids. Neither is
    // worth a rendered row, and "QIB 0x" on an SME that has no QIB portion reads
    // as a real figure rather than an absence.
    if (times == null || times <= 0) continue;
    const name = String(c.category || '').toLowerCase();
    if (sr === '2.1') out.bnii = times;
    else if (sr === '2.2') out.snii = times;
    else if (name.includes('qualified institutional')) out.qib = times;
    else if (name.includes('non institutional')) out.nii = times;
    else if (name.includes('retail')) out.retail = times;
    else if (name.includes('employee')) out.employee = times;
    else if (name.includes('shareholder') || name.includes('policyholder')) out.shareholder = times;
  }
  if (!totalOffered || totalTimes == null || totalTimes <= 0) return null;
  out.total = totalTimes;
  return Object.keys(out).length > 1 ? out : null;
}

/** "Rs.938 to Rs.988" / "Rs. 750 to Rs. 788 per Equity Share" → [938, 988] */
const band = (s) => {
  const nums = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return [null, null];
  if (nums.length === 1) return [Number(nums[0]), Number(nums[0])];
  return [Number(nums[0]), Number(nums[1])];
};

/**
 * NSE writes the issue size as prose, in three units and two shapes. Two things
 * make it delicate: amounts are in MILLIONS (10 million = 1 crore), and each leg
 * is trailed by a parenthetical naming the anchor or employee portion whose
 * numbers must not be mistaken for the leg itself. The first version of this
 * parsed 0% by looking for "Cr".
 */
const parseSize = (raw) => {
  const t = String(raw || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  const cut = t.search(/offer\s+for\s+sale/i);
  const freshPart = cut >= 0 ? t.slice(0, cut) : t;
  const ofsPart = cut >= 0 ? t.slice(cut) : '';
  const leg = (part) => {
    if (!part) return { cr: null, shares: null };
    const n = (s) => Number(String(s).replace(/,/g, ''));
    let m;
    if ((m = /(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*million/i.exec(part))) return { cr: n(m[1]) / 10, shares: null };
    if ((m = /(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(?:crore|cr\b)/i.exec(part))) return { cr: n(m[1]), shares: null };
    if ((m = /(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(?:lakh|lac)/i.exec(part))) return { cr: n(m[1]) / 100, shares: null };
    if ((m = /([\d,]{5,})\s*(?:\w+\s+){0,2}(?:equity\s*)?shares/i.exec(part))) return { cr: null, shares: n(m[1]) };
    return { cr: null, shares: null };
  };
  const f = leg(freshPart), o = leg(ofsPart);
  return { freshCr: f.cr, freshSh: f.shares, ofsCr: o.cr, ofsSh: o.shares };
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
    let L = [], D = null;
    try {
      const res = await fetch(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(r.symbol)}&series=${r.securityType}`,
        { headers: H, signal: AbortSignal.timeout(20000) });
      if (res.ok) { D = await res.json(); L = (D && D.issueInfo && D.issueInfo.dataList) || []; }
    } catch { /* falls through as a detail-less row */ }
    if (!L.length) noDetail++;

    const meta = (D && D.metaInfo) || {};
    const sub = subscriptionOf(D && D.activeCat);

    const [pmin, pmax] = band(fact(L, 'price range') || r.priceRange);
    const sizeText = fact(L, 'issue size');
    const lg = parseSize(sizeText);
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
      // NSE's own security master — more reliable than anything in the fact list
      isin: meta.isin || '',
      sector: meta.industry || '',
      // metaInfo.listingDate is the SECURITY's listing date, NOT the IPO's. For a
      // fresh IPO they are the same day; for an FPO or an SME that later migrated
      // to the mainboard they are years apart — RUCHISOYA's 2022 FPO reports 2003,
      // AGROPHOS's 2016 SME issue reports its 2019 migration. Measured over 891
      // dated rows the real gap after close is 3-14 days and the next value in the
      // whole distribution is 864, so this only fills genuinely fresh listings.
      metaListing: closeWithin(meta.listingDate, iso(r.ipoEndDate), 30),
      sub,
    });

    if (++done % 25 === 0) console.log(`  …${done}/${wanted.length}`);
    await sleep(850); // polite
  }

  /* ── build the sheet in the importer's exact shape ── */
  const headers = [
    'Symbol *', 'Company name *', 'Board *', 'Exchanges * (comma-sep)', 'ISIN', 'Sector / Industry', 'Logo URL',
    'Issue type *', 'Face value (₹)', 'Price band min (₹) *', 'Price band max (₹) *',
    'Lot size (shares) *', 'Min amount (₹)', 'Total issue size (₹ Cr) *',
    'Fresh issue (₹ Cr)', 'Fresh issue (shares)', 'OFS portion (₹ Cr)', 'OFS portion (shares)',
    'QIB reservation (%)', 'NII reservation (%)', 'Retail reservation (%)',
    'QIB (×)', 'NII total (×)', 'bNII (×)', 'sNII (×)', 'Retail (×)', 'Employee (×)', 'Shareholder (×)', 'Total (×)',
    'Open date *', 'Close date *', 'Listing date',
    'Lead managers (comma-sep)', 'Registrar', 'Objects of the issue', 'RHP URL',
  ];
  const bands = ['Identity', '', '', '', '', '', '', 'Issue structure', '', '', '', '', '', '', '', '', '', '',
                 'Reservation (from RHP — NOT in NSE data)', '', '',
                 'Final subscription (NSE activeCat)', '', '', '', '', '', '', '',
                 'Timetable', '', '',
                 'Intermediaries', '', 'Documents', ''];
  const example = ['EXAMPLE', 'Example Industries Limited', 'Mainboard', 'NSE', '', 'Pharmaceuticals', '',
    'Book-built', 10, 100, 105, 100, 10500, 250, 200, '', 50, '', '', '', '',
    '', '', '', '', '', '', '', '',
    '2026-01-01', '2026-01-03', '2026-01-08', 'Example Capital', 'Example Registrar', '', ''];

  const rows = out.map((o) => [
    o.symbol, o.name, o.board, o.exchanges, o.isin, o.sector, '',
    o.issueType, o.faceValue, o.pmin, o.pmax,
    o.lot, o.minAmount,
    (() => {
      // A share-denominated leg becomes rupees at the CAP price — the same
      // convention the prospectus uses when it quotes the issue size at the
      // upper band. Most SME issues quote shares, so without this the total
      // is blank for two rows in three.
      const legCr = (cr, sh) => (cr != null ? cr : (sh != null && o.pmax ? (sh * o.pmax) / 1e7 : null));
      const t = (legCr(o.freshCr, o.freshSh) ?? 0) + (legCr(o.ofsCr, o.ofsSh) ?? 0);
      return t > 0 ? Math.round(t * 100) / 100 : null;
    })(),
    o.freshCr, o.freshSh, o.ofsCr, o.ofsSh,
    // Reservations stay blank. NSE's activeCat DOES carry shares-offered per
    // category, but those are NET OF ANCHOR: a plain 50/15/35 issue with a 60%
    // anchor reads back as 28.57/21.43/50, which would fail the ICDR checks in
    // computeIssue() and publish a wrong table. The RHP is the only honest source.
    '', '', '',
    ...['qib', 'nii', 'bnii', 'snii', 'retail', 'employee', 'shareholder', 'total']
      .map((k) => (o.sub && o.sub[k] != null ? Math.round(o.sub[k] * 100) / 100 : '')),
    o.openDate, o.closeDate, o.listingDate || o.metaListing,
    o.leads, o.registrar, '', o.rhp,
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
