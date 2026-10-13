/**
 * Export the whole IPO catalog to Excel for review.
 *
 * Columns come from CATALOG_FIELDS in the API — the SAME map the update reads
 * back through — so the sheet and the importer can never disagree about what a
 * column means.
 *
 * Three sheets:
 *   IPO          every row, every reviewable field, blanks left blank
 *   Gaps         per FIELD: how many rows have it, how many do not
 *   Missing      per ROW: only the core fields that are empty
 *
 *   node scripts/export-catalog.js
 */
const XLSX = require('xlsx');
const path = require('path');
const API = 'D:/Investoyard/apps/api';
const { PrismaService } = require(`${API}/dist/prisma/prisma.service.js`);
const { CATALOG_FIELDS } = require(`${API}/dist/modules/ipo-import/catalog-fields.js`);

(async () => {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const ipos = await prisma.ipo.findMany({
      include: { documents: true },
      orderBy: [{ closeDate: 'desc' }, { openDate: 'desc' }],
    });
    console.log('catalog rows:', ipos.length);

    // Symbol leads (the match key) and Published trails; neither is updatable.
    const headers = ['Symbol *', 'Board *', ...CATALOG_FIELDS.map((f) => f.header), 'Published (Y/N)'];
    const rows = ipos.map((i) => {
      const x = i.extra ?? {};
      return [
        i.symbol,
        i.type === 'sme' ? 'SME' : 'Mainboard',
        ...CATALOG_FIELDS.map((f) => { try { const v = f.read(i, x); return v == null ? '' : v; } catch { return ''; } }),
        i.hidden ? 'N' : 'Y',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(30, Math.max(11, h.length + 2)) }));
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'IPO');

    /* per-field completeness */
    const core = new Set(CATALOG_FIELDS.filter((f) => f.core).map((f) => f.header));
    const gaps = [['Field', 'Filled', 'Missing', '% filled', 'Core field']];
    headers.forEach((h, c) => {
      const filled = rows.filter((r) => r[c] !== '' && r[c] != null).length;
      gaps.push([h, filled, rows.length - filled, Math.round((filled / rows.length) * 100), core.has(h) ? 'Y' : '']);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(gaps);
    ws2['!cols'] = [{ wch: 30 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Gaps');

    /* per-row missing core fields */
    const miss = [['Symbol', 'Company', 'Board', 'Close date', 'Missing core fields', 'How many']];
    const coreIdx = [...core].map((h) => headers.indexOf(h)).filter((i) => i >= 0);
    const nameIdx = headers.indexOf('Company name *');
    const closeIdx = headers.indexOf('Close date *');
    rows.forEach((r) => {
      const gone = coreIdx.filter((c) => r[c] === '' || r[c] == null).map((c) => headers[c]);
      if (gone.length) miss.push([r[0], r[nameIdx], r[1], r[closeIdx], gone.join(', '), gone.length]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(miss);
    ws3['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 10 }, { wch: 12 }, { wch: 90 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Missing');

    /* how to hand it back */
    const help = [['Filling this workbook'], [''],
      ['Fill blanks on the IPO sheet and give the file back — nothing else needs changing.'], [''],
      ['1. Do NOT edit the Symbol column. It is the key each row is matched on.'],
      ['2. Do NOT add or reorder columns. Extra rows for new IPOs are fine.'],
      ['3. Leave unknown cells BLANK. A blank never clears a stored value.'], [''],
      ['Dates as YYYY-MM-DD. Percentages as plain numbers (50, not 50%).'],
      ['Issue size in Rs Crore. Lead managers comma-separated.'], [''],
      ['On upload you get a preview first: blanks are filled automatically, and'],
      ['any cell that disagrees with stored data is listed for you to approve.'],
      ['Board and Published are shown for context and are never updated here.']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), 'Read me');

    const file = path.join(require('os').homedir(), 'Desktop', 'Investoyard-Catalog-Review.xlsx');
    XLSX.writeFile(wb, file);
    console.log('written:', file);
    console.log(`rows missing at least one core field: ${miss.length - 1} of ${rows.length}`);
    console.log('\nleast-complete core fields:');
    gaps.slice(1).filter((g) => g[4] === 'Y').sort((a, b) => a[3] - b[3]).slice(0, 8)
      .forEach((g) => console.log(`   ${String(g[3]).padStart(3)}%  ${g[0]}  (${g[2]} missing)`));
  } finally { await prisma.$disconnect(); }
  process.exit(0);
})();
