/**
 * Classify Anchor Investors by type — conservatively.
 *
 *   node scripts/anchor-types.js            report only
 *   node scripts/anchor-types.js --apply    set the confident ones + write the review sheet
 *   node scripts/anchor-types.js --load     read the filled review sheet back
 *
 * Only three patterns are safe to infer from a name:
 *   "… Mutual Fund" / AMC        → Mutual Fund
 *   "… Insurance" / LIC          → Insurance
 *   explicit AIF / Alternative   → AIF
 *
 * FPI is deliberately NOT inferred. Measured over the real 500 rows, a rule
 * keyed on "capital"/"partners"/"fund" matched 201 names — including HDFC Bank,
 * ICICI Bank, SBI, Kotak and Societe Generale, none of which are FPIs, while
 * plenty of domestic AIFs carry exactly those words. Whether an entity is
 * foreign-registered is not knowable from its name, so those rows stay Other
 * and go to the operator on a sheet.
 */
const XLSX = require('xlsx');
const path = require('path');
const { PrismaService } = require('D:/Investoyard/apps/api/dist/prisma/prisma.service.js');

const TYPES = ['Mutual Fund', 'FPI', 'Insurance', 'AIF', 'Other'];
const SHEET = path.join(require('os').homedir(), 'Desktop', 'Investoyard-Anchor-Types.xlsx');

/** Confident rules only — these are WRITTEN. Order matters, first match wins. */
function inferType(name) {
  const n = String(name || '');
  if (/\bmutual fund\b/i.test(n)) return 'Mutual Fund';
  if (/\binsurance\b|\bassurance\b|\blife insurance corporation\b|\bLIC\b/i.test(n)) return 'Insurance';
  if (/\bAIF\b|\balternat\w+ investment\b/i.test(n)) return 'AIF';
  return null;                                     // not knowable from the name
}

/**
 * Softer signals — offered as a SUGGESTION in the sheet, never written.
 *
 * The master names AMCs by house ("Tata Asset Management"), not by fund, so
 * "asset management" is the strongest hint available that a row is a mutual
 * fund. It is only a hint: Carnelian Asset Management is a PMS/AIF house and
 * Jupiter Asset Management is a UK manager, so a rule that wrote this value
 * would mislabel both. The operator confirms.
 */
function suggestType(name) {
  const n = String(name || '');
  if (/\basset manage\w*\b|\bAMC\b|\basset managers\b/i.test(n)) return 'Mutual Fund';
  if (/\bpension\b|\bprovident\b/i.test(n)) return 'Other';
  if (/\bbank\b/i.test(n)) return 'Other';
  return '';
}

(async () => {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const rows = await prisma.anchorMaster.findMany({ orderBy: { name: 'asc' } });
    const mode = process.argv.includes('--load') ? 'load' : process.argv.includes('--apply') ? 'apply' : 'report';

    if (mode === 'load') {
      if (!require('fs').existsSync(SHEET)) { console.log('No sheet at', SHEET); return; }
      const wb = XLSX.readFile(SHEET);
      const data = XLSX.utils.sheet_to_json(wb.Sheets['Anchors'], { defval: '' });
      let n = 0, bad = [];
      for (const r of data) {
        const name = String(r['Name'] ?? '').trim();
        const type = String(r['Type'] ?? '').trim();
        if (!name || !type) continue;
        if (!TYPES.includes(type)) { bad.push(`${name} → "${type}"`); continue; }
        const hit = rows.find((x) => x.name === name);
        if (!hit || hit.type === type) continue;
        await prisma.anchorMaster.update({ where: { id: hit.id }, data: { type } });
        n++;
      }
      console.log(`updated ${n} anchors from the sheet`);
      if (bad.length) console.log(`ignored ${bad.length} rows with a type outside ${TYPES.join(' / ')}:`, bad.slice(0, 5).join(' | '));
      const after = await prisma.anchorMaster.groupBy({ by: ['type'], _count: true });
      console.log('types now:', after.map((t) => `${t.type ?? 'null'}:${t._count}`).join('  '));
      return;
    }

    /* --apply-suggested: the operator accepted the soft hints wholesale, so write
       them too. Kept as its own mode rather than folded into inferType(), because
       these are still SUGGESTIONS — the distinction between what a name proves and
       what it merely hints at is the whole point of this script. */
    if (process.argv.includes('--apply-suggested')) {
      let n = 0; const by = {};
      for (const r of rows) {
        const t = inferType(r.name) || suggestType(r.name);
        if (!t || r.type === t) continue;
        await prisma.anchorMaster.update({ where: { id: r.id }, data: { type: t } });
        by[t] = (by[t] || 0) + 1; n++;
      }
      console.log(`updated ${n} anchors:`, Object.entries(by).map(([k, v]) => `${k} ${v}`).join('  '));
      const after = await prisma.anchorMaster.groupBy({ by: ['type'], _count: true });
      console.log('types now:', after.map((t) => `${t.type ?? 'null'}:${t._count}`).join('  '));
      return;
    }

    const confident = [], unknown = [];
    for (const r of rows) { const t = inferType(r.name); if (t) confident.push({ r, t }); else unknown.push(r); }

    const byType = {};
    for (const c of confident) byType[c.t] = (byType[c.t] || 0) + 1;
    console.log(`anchors ${rows.length}`);
    console.log('  confidently typed:', Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('  ') || 'none');
    console.log('  left as Other    :', unknown.length);
    console.log('\nsample of what would be set:');
    for (const c of confident.slice(0, 8)) console.log(`   ${c.t.padEnd(12)} ${c.r.name}`);

    if (mode !== 'apply') { console.log('\nREPORT ONLY — re-run with --apply'); return; }

    let n = 0;
    for (const c of confident) {
      if (c.r.type === c.t) continue;
      await prisma.anchorMaster.update({ where: { id: c.r.id }, data: { type: c.t } });
      n++;
    }
    console.log(`\nupdated ${n} anchors`);

    /* the rest go to the operator — one sheet, a Type column, a dropdown of the valid values */
    const aoa = [['Name', 'Type', 'Suggested', 'Notes']];
    for (const r of unknown) aoa.push([r.name, '', suggestType(r.name), '']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 52 }, { wch: 16 }, { wch: 16 }, { wch: 40 }];
    // a real dropdown, so the sheet can only come back with valid values
    ws['!dataValidation'] = [{ sqref: `B2:B${aoa.length}`, type: 'list', formula1: `"${TYPES.join(',')}"` }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Anchors');
    const help = [['How to use this sheet'], [''],
      ['1. Fill the Type column for each anchor.'],
      [`2. Valid values: ${TYPES.join(' / ')}`],
      ['3. Save the file in place, then tell Claude to load it back.'], [''],
      ['Only names that could be typed from the name alone were set automatically'],
      ['(Mutual Fund, Insurance, explicit AIF). FPI was NOT guessed: whether an'],
      ['entity is foreign-registered cannot be read off its name, and guessing it'],
      ['would have mislabelled Indian banks and domestic AIFs.']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), 'Read me');
    XLSX.writeFile(wb, SHEET);
    console.log('review sheet:', SHEET, `(${unknown.length} rows)`);
  } finally { await prisma.$disconnect(); }
  process.exit(0);
})();
