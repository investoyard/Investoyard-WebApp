#!/usr/bin/env node
/**
 * Import the bank + branch directory (BankMaster / BankBranch) from a CSV.
 *
 *   node scripts/import-ifsc.js <file.csv>            # DRY RUN — reports, writes nothing
 *   node scripts/import-ifsc.js <file.csv> --apply    # writes
 *   node scripts/import-ifsc.js <file.csv> --limit 500  # parse only the first N data rows
 *
 * DRY-RUN BY DEFAULT, IDEMPOTENT, RE-RUNNABLE — the house convention for every
 * data script here, and it matters more than usual at 1.7 lakh rows: a half-run
 * import that cannot be repeated is worse than no import.
 *
 * IT PRINTS THE FILE'S OWN HEADER ROW AND THE COLUMN MAPPING IT CHOSE, every
 * run. That is the lesson from the allotment importer: directories ship far
 * more columns than we map and name them differently from one another, so the
 * honest way to confirm a mapping is to read what the document actually says
 * rather than trust a candidate list. An unmatched optional column is left
 * null; an unmatched REQUIRED one aborts rather than importing blanks.
 *
 * WRITES THROUGH `INSERT … ON CONFLICT (ifsc) DO UPDATE`, in batches. A Prisma
 * `upsert` is one round trip per row — at 1.7 lakh that is hours — and
 * `createMany({ skipDuplicates })` cannot correct a branch that has been
 * renamed. Neither table is RLS-scoped (setup-rls.sql lists six tables and
 * these are not among them), so a raw statement here needs no tenant GUC.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const file = argv.find((a) => !a.startsWith('--'));
const limitArg = argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(argv[limitArg + 1]) : 0;
const BATCH = 2000;

/* Column candidates, lower-cased and stripped of non-letters before matching,
 * so `BRANCH NAME`, `Branch_Name` and `branchname` are one thing. Ordered: the
 * first header that matches wins. */
const CANDIDATES = {
  ifsc:     ['ifsc', 'ifsccode', 'ifsccodes'],
  bank:     ['bank', 'bankname'],
  branch:   ['branch', 'branchname', 'office', 'officename'],
  /* CENTRE BEFORE CITY, and that order is measured rather than guessed.
     The razorpay directory carries both and they differ on 54.5% of its
     183,214 rows — and its `CITY` is really the DISTRICT, mislabelled:
     MUMBAI/GREATER BOMBAY (the pre-1995 name), BANGALORE/BANGALORE URBAN,
     KOCHI/ERNAKULAM, NOIDA/GAUTAM BUDDHA NAGAR, VIJAYAWADA/KRISHNA. CENTRE
     is the town a person writes on a form, which is what this column is for. */
  city:     ['centre', 'center', 'city'],
  district: ['district'],
  state:    ['state', 'statename'],
};
const REQUIRED = ['ifsc', 'bank', 'branch'];

const norm = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');

/** Quote-aware CSV line split — bank names and branch names carry commas. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const clean = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s && s !== '-' && s.toUpperCase() !== 'NA' ? s : null;
};

/** An IFSC is 11 characters: 4 letters, a 0, then 6 alphanumerics. */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function main() {
  if (!file) {
    console.error('usage: node scripts/import-ifsc.js <file.csv> [--apply] [--limit N]');
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`not found: ${path.resolve(file)}`);
    process.exit(2);
  }

  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) { console.error('file is empty'); process.exit(2); }

  const headers = splitCsv(lines[0]).map((h) => h.trim());
  console.log(`file     : ${path.resolve(file)}`);
  console.log(`rows     : ${lines.length - 1} data rows`);
  console.log(`headers  : ${JSON.stringify(headers)}`);

  /* Resolve each logical field to a column index, and SAY what it picked. */
  const map = {};
  for (const [field, cands] of Object.entries(CANDIDATES)) {
    /* CANDIDATES ARE TRIED IN THEIR OWN ORDER, not the file’s.
       `headers.findIndex(h => cands.includes(h))` scans HEADERS and takes the
       first that matches anything, which silently discards the priority the
       candidate list was written to express — whichever column the file
       happens to put first wins. */
    let i = -1;
    for (const c of cands) { i = headers.findIndex((h) => norm(h) === c); if (i >= 0) break; }
    if (i >= 0) map[field] = i;
  }
  console.log('mapping  :');
  for (const field of Object.keys(CANDIDATES)) {
    const i = map[field];
    const req = REQUIRED.includes(field) ? ' (required)' : '';
    console.log(`  ${field.padEnd(9)} -> ${i >= 0 ? `[${i}] ${headers[i]}` : 'NOT FOUND'}${req}`);
  }
  const missing = REQUIRED.filter((f) => map[f] === undefined);
  if (missing.length) {
    console.error(`\nREFUSING: no column matched ${missing.join(', ')}. Add a candidate to CANDIDATES rather than renaming the file, so the next directory in this format imports too.`);
    process.exit(1);
  }

  /* ---- parse ---------------------------------------------------------- */
  const banks = new Map();            // name -> true
  const rows = [];                    // {ifsc, bank, branch, city, district, state}
  const badIfsc = [];
  const dupIfsc = new Map();
  const seen = new Set();
  const end = LIMIT > 0 ? Math.min(lines.length, LIMIT + 1) : lines.length;

  for (let n = 1; n < end; n++) {
    const c = splitCsv(lines[n]);
    const ifsc = (clean(c[map.ifsc]) ?? '').toUpperCase();
    const bank = clean(c[map.bank]);
    const branch = clean(c[map.branch]);
    if (!IFSC_RE.test(ifsc)) { if (badIfsc.length < 10) badIfsc.push(`row ${n + 1}: ${ifsc || '(blank)'}`); continue; }
    if (!bank || !branch) { continue; }
    if (seen.has(ifsc)) { dupIfsc.set(ifsc, (dupIfsc.get(ifsc) ?? 1) + 1); continue; }
    seen.add(ifsc);
    banks.set(bank, true);
    rows.push({
      ifsc, bank, branch,
      city: map.city !== undefined ? clean(c[map.city]) : null,
      district: map.district !== undefined ? clean(c[map.district]) : null,
      state: map.state !== undefined ? clean(c[map.state]) : null,
    });
  }

  console.log(`\nparsed   : ${rows.length} branches across ${banks.size} banks`);
  if (badIfsc.length) console.log(`skipped  : rows with a malformed IFSC (first few) — ${badIfsc.join(' · ')}`);
  if (dupIfsc.size) console.log(`skipped  : ${dupIfsc.size} duplicate IFSCs inside the file (first kept)`);
  if (!rows.length) { console.error('nothing usable to import'); process.exit(1); }

  /* ---- what would change --------------------------------------------- */
  /* RAW COUNTS, deliberately: a DRY RUN has to work BEFORE `prisma generate`
     has seen these models, and that generate needs the pool stopped. Checking
     a directory file is exactly what you want to do before deciding to take
     the API down, so the read-only path must not depend on the new client. */
  const [{ n: liveBranches }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankBranch"');
  const [{ n: liveBanks }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankMaster"');
  console.log(`\nlive now : ${liveBanks} banks, ${liveBranches} branches`);

  if (!APPLY) {
    const sample = rows.slice(0, 3).map((r) => `${r.ifsc}  ${r.bank} / ${r.branch} / ${r.city ?? '—'} / ${r.state ?? '—'}`);
    console.log('\nsample   :');
    for (const s of sample) console.log(`  ${s}`);
    console.log('\n--dry-run (default): nothing written. Re-run with --apply.');
    return;
  }

  /* ---- write ---------------------------------------------------------- */
  /* Banks first — the branch insert needs their ids.
   *
   * RAW SQL, NOT `prisma.bankMaster.upsert`, and the reason is scheduling: the
   * typed client only learns these models from `prisma generate`, which needs
   * the API pool stopped. Raw statements need no generate, so the DIRECTORY CAN
   * LAND BEFORE the pool is ever cycled — the import and the deploy stop being
   * one window. Neither table is RLS-scoped (setup-rls.sql names six tables and
   * these are not among them), so no tenant GUC is involved.
   *
   * ADD-ONLY on conflict: a bank row carries nothing the directory owns except
   * its name, and `active` may have been turned off by an operator.
   */
  const names = [...banks.keys()];
  for (let i = 0; i < names.length; i += 500) {
    const slice = names.slice(i, i + 500);
    const vals = slice.map((_, k) => `(gen_random_uuid(), $${k + 1}, true, now(), now())`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BankMaster" (id, name, active, "createdAt", "updatedAt")
       VALUES ${vals.join(',')} ON CONFLICT (name) DO NOTHING`,
      ...slice,
    );
  }
  const bankRows = await prisma.$queryRawUnsafe('SELECT id, name FROM "BankMaster"');
  const bankId = new Map(bankRows.map((b) => [b.name, b.id]));

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    slice.forEach((r, k) => {
      const b = k * 6;
      vals.push(`(gen_random_uuid(), $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, true, now(), now())`);
      params.push(bankId.get(r.bank), r.ifsc, r.branch, r.city, r.district, r.state);
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BankBranch" (id, "bankId", ifsc, branch, city, district, state, active, "createdAt", "updatedAt")
       VALUES ${vals.join(',')}
       ON CONFLICT (ifsc) DO UPDATE SET
         "bankId" = EXCLUDED."bankId", branch = EXCLUDED.branch, city = EXCLUDED.city,
         district = EXCLUDED.district, state = EXCLUDED.state, "updatedAt" = now()`,
      ...params,
    );
    written += slice.length;
    if (written % 20000 === 0 || written === rows.length) console.log(`  … ${written}/${rows.length}`);
  }

  console.log(`\nDONE     : ${banks.size} banks, ${written} branches upserted`);
  const [{ n: nb }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankMaster"');
  const [{ n: nbr }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankBranch"');
  console.log(`live now : ${nb} banks, ${nbr} branches`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
