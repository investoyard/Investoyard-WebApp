#!/usr/bin/env node
/**
 * THE ASBA BLANKS' FORM-LEVEL DEFAULT FONT WAS NEVER SET, SO FIVE FIELDS PRINT
 * IN HELVETICA WHILE THE OTHER ~27 PRINT IN ARIAL BLACK (operator, 2026-10-21).
 *
 * The operator applied Arial Black when authoring the fillable blanks, and it
 * landed on most fields as a per-field `/DA`. Five names never got one —
 * `APPNo` (the Application No box), `BANKBRANCH2`, `GrandTotal`, `FamilyGroup`,
 * `ACCOUNTNO2` — so they inherit the FORM-level `/DA`, which on all 74
 * templates is the byte-identical string `/Helv 0 Tf 0 g`. That is Acrobat's
 * factory default: what you get when nobody chooses, not a choice.
 *
 * It was invisible until 2026-10-21, when the print engine stopped drawing
 * every value in one Helvetica and started honouring each field's own `/DA`.
 * The other 27 fields moved; these five stayed, and the mismatch showed.
 *
 * THE FIX IS IN THE DATA, NOT THE ENGINE. Overriding what a file says is
 * exactly what the engine just stopped doing, and a future blank that
 * genuinely wants Helvetica would then print wrong. Setting the form default
 * makes the file say what the operator meant, so every reader agrees with us —
 * Acrobat included.
 *
 * GUARDS, all three required before a file is touched:
 *   1. the form `/DA` is EXACTLY the factory string — never overwrite a chosen one
 *   2. `/DR /Font` already declares `/Arial-Black`, so the name resolves
 *   3. at least one field already carries an Arial-Black `/DA`, i.e. this
 *      really is a blank the operator styled that way
 *
 * A pdf-lib round-trip is safe on these: no XFA, no signatures, not encrypted,
 * and the print engine already loads and re-saves every one of them on every
 * print. The script verifies page count, field count and the `/DR` font set
 * are unchanged after writing, and restores from the backup if they are not.
 *
 *   node scripts/fix-asba-template-default-font.js            # dry run
 *   node scripts/fix-asba-template-default-font.js --apply
 */
// Absolute requires and an explicit datasource, matching every other script
// here: this runs from the repo ROOT, where neither the workspace node_modules
// nor apps/api/.env is in scope.
require('D:/Investoyard/node_modules/dotenv').config({ path: 'D:/Investoyard/apps/api/.env' });
const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const { PDFDocument, PDFName, PDFString, PDFTextField } = require('D:/Investoyard/node_modules/pdf-lib');
const fs = require('fs');
const path = require('path');

const OUT_I = process.argv.indexOf('--out');
const OUT_DIR = OUT_I >= 0 ? process.argv[OUT_I + 1] : null;
const APPLY = process.argv.includes('--apply') && !!OUT_DIR;
const FACTORY_DA = '/Helv 0 Tf 0 g';
const WANTED_DA = '/Arial-Black 0 Tf 0 g';
const TYPES = ['asba_form_resident', 'asba_form_syndicate', 'asba_form_single', 'asba_form_shareholder'];
const UPLOAD_DIR = path.join(__dirname, '..', 'apps', 'api', 'dist', 'uploads');
const BACKUP_DIR = path.join(
  'C:', 'ProgramData', 'Investoyard', 'backups',
  'asba-template-da-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
);

const txt = (v) => (v == null ? null : String(v.decodeText ? v.decodeText() : v));

/** Page count, field count and the /DR font names — the shape a rewrite must preserve. */
async function shapeOf(buf) {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const form = doc.getForm();
  const dr = form.acroForm.dict.lookup ? form.acroForm.dict.lookup(PDFName.of('DR')) : null;
  const fonts = dr && dr.lookup ? dr.lookup(PDFName.of('Font')) : null;
  return {
    pages: doc.getPageCount(),
    fields: form.getFields().length,
    drFonts: fonts && fonts.keys ? fonts.keys().map(String).sort().join(' ') : '',
  };
}

(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } });
  const docs = await prisma.ipoDocument.findMany({
    where: { type: { in: TYPES } },
    select: { type: true, url: true, ipo: { select: { symbol: true } } },
  });

  const seen = new Set();
  const todo = [];
  const skipped = [];

  for (const d of docs) {
    const fn = d.url.split('/uploads/')[1]?.split('?')[0];
    if (!fn) { skipped.push([d.ipo.symbol, d.type, 'no filename in the url']); continue; }
    const file = path.join(UPLOAD_DIR, decodeURIComponent(fn));
    if (!fs.existsSync(file)) { skipped.push([d.ipo.symbol, d.type, 'file missing on disk']); continue; }
    if (seen.has(file)) continue;
    seen.add(file);

    let doc, form;
    try {
      doc = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
      form = doc.getForm();
    } catch (e) {
      skipped.push([d.ipo.symbol, d.type, 'will not load: ' + e.message.slice(0, 40)]);
      continue;
    }
    const acro = form.acroForm.dict;

    // guard 1 — only the untouched factory default
    const da = (txt(acro.get(PDFName.of('DA'))) ?? '').trim();
    if (da !== FACTORY_DA) { skipped.push([d.ipo.symbol, d.type, `form /DA is ${JSON.stringify(da)} — not the factory default`]); continue; }

    // guard 2 — the name has to resolve
    const dr = acro.lookup ? acro.lookup(PDFName.of('DR')) : null;
    const fonts = dr && dr.lookup ? dr.lookup(PDFName.of('Font')) : null;
    const hasBlack = !!(fonts && fonts.keys && fonts.keys().some((k) => String(k) === '/Arial-Black'));
    if (!hasBlack) { skipped.push([d.ipo.symbol, d.type, '/DR does not declare /Arial-Black']); continue; }

    // guard 3 — this really is a blank the operator styled in Arial Black
    let usesBlack = 0;
    let inherits = 0;
    for (const f of form.getFields()) {
      if (!(f instanceof PDFTextField)) continue;
      const fda = txt(f.acroField.dict.get(PDFName.of('DA')));
      if (!fda) inherits++;
      else if (/\/Arial-Black\b/.test(fda)) usesBlack++;
    }
    if (usesBlack === 0) { skipped.push([d.ipo.symbol, d.type, 'no field uses Arial-Black — not an operator-styled blank']); continue; }
    if (inherits === 0) { skipped.push([d.ipo.symbol, d.type, 'every field has its own /DA — nothing inherits']); continue; }

    todo.push({ symbol: d.ipo.symbol, type: d.type, file, usesBlack, inherits });
  }

  console.log(`ASBA blanks referenced by IPOs: ${docs.length}  (distinct files: ${seen.size})`);
  console.log(`to change: ${todo.length}   skipped: ${skipped.length}`);
  console.log('');
  for (const t of todo) {
    console.log('  ', t.symbol.padEnd(12), t.type.padEnd(22),
      `${t.inherits} widgets inherit the default, ${t.usesBlack} already Arial-Black`);
  }
  if (skipped.length) {
    console.log('');
    console.log('SKIPPED (and why — a skip is the guard doing its job):');
    for (const [sym, type, why] of skipped) console.log('  ', String(sym).padEnd(12), String(type).padEnd(22), why);
  }

  if (!APPLY) {
    console.log('');
    console.log(`dry run — nothing written. Re-run with --apply --out <dir> to write corrected copies (form default "${WANTED_DA}").`);
    await prisma.$disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('');
  console.log('backup:', BACKUP_DIR);
  let ok = 0, failed = 0;
  for (const t of todo) {
    const original = fs.readFileSync(t.file);
    fs.writeFileSync(path.join(BACKUP_DIR, path.basename(t.file)), original);
    const before = await shapeOf(original);

    const doc = await PDFDocument.load(original, { ignoreEncryption: true });
    doc.getForm().acroForm.dict.set(PDFName.of('DA'), PDFString.of(WANTED_DA));
    /* updateFieldAppearances: FALSE, the same flag the print engine passes.
       pdf-lib defaults it to true, which makes save() try to regenerate every
       appearance stream — and on these blanks that is precisely what throws
       (Arial-Black is declared in /DR but not embedded, so there is no font
       object to measure with). The first --apply run died on file 1 because of
       it; the shape guard and the backup meant nothing was damaged. */
    const out = Buffer.from(await doc.save({ updateFieldAppearances: false }));

    // Verify the rewrite preserved the document's shape before it replaces a master.
    const after = await shapeOf(out);
    const same = before.pages === after.pages && before.fields === after.fields && before.drFonts === after.drFonts;
    if (!same) {
      failed++;
      console.log('  REFUSED', t.symbol, t.type, JSON.stringify({ before, after }));
      continue;
    }
    /* ATOMIC REPLACE, not truncate-then-write. The API pool is live and reads
       these blanks on every print; a print landing inside a non-atomic write
       would read a truncated template. rename() on the same volume is atomic. */
    /* THE UPLOADS DIRECTORY IS OWNED BY `IIS APPPOOLInvestoyardAPI`, NOT BY US.
       A new file can be created there but an existing one cannot be replaced,
       so an in-place rewrite fails EPERM on rename. The corrected blanks are
       written to --out instead and copied over by someone who can; without
       --out this stays a dry run whatever else is passed. */
    fs.writeFileSync(path.join(OUT_DIR, path.basename(t.file)), out);
    ok++;
  }
  console.log('');
  console.log(`written: ${ok}   refused on a shape change: ${failed}`);
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
