// Backfill IndustryMaster from existing IPO records' `extra.industry` values.
//
// Operator ask (2026-09-22): the Industry master was empty on ship because
// industries were previously a free-text field on the IPO form. This script
// walks every IPO, normalises + dedupes the industry values it finds, and
// creates a master row for each. Safe to re-run — uses upsert on `name` and
// never touches existing rows' description / sector.
//
// Reads DB via the compiled Prisma client. Run with:
//   cd apps/api && node ../../scripts/backfill-industries.js
//
// Reports: how many IPOs were scanned, how many distinct industries were
// found, how many were newly created vs already present.

const path = require('path');
const { PrismaClient } = require(path.join('D:/Investoyard/node_modules/@prisma/client'));

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

/**
 * Normalise an industry string for de-duplication:
 *   - trim whitespace
 *   - collapse internal whitespace to single spaces
 *   - preserve original casing (so "IT Services" and "It Services" stay distinct
 *     -- the operator can merge duplicates in the UI later; we don't guess)
 * Returns null when the input is empty / non-string.
 */
function normalise(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > 0 ? t : null;
}

(async () => {
  console.log('Reading all IPOs...');
  const ipos = await prisma.ipo.findMany({ select: { id: true, symbol: true, extra: true } });
  console.log(`  found ${ipos.length} IPO(s)`);

  const counts = new Map(); // name -> occurrences
  for (const ipo of ipos) {
    const ex = (ipo.extra ?? {});
    const raw = ex.industry;
    const name = normalise(raw);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  console.log(`\nDistinct industries found: ${counts.size}`);

  console.log('\nExisting industry master rows...');
  const existing = await prisma.industryMaster.findMany({ select: { name: true } });
  const existingSet = new Set(existing.map((r) => r.name));
  console.log(`  currently in master: ${existingSet.size}`);

  const toCreate = [...counts.entries()]
    .filter(([name]) => !existingSet.has(name))
    .map(([name, occ]) => ({ name, occ }));
  console.log(`  to create: ${toCreate.length}`);

  if (toCreate.length === 0) {
    console.log('\nNothing to do. Every industry from the IPO catalog is already in the master.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nCreating master rows...');
  let created = 0;
  for (const { name } of toCreate) {
    try {
      await prisma.industryMaster.create({
        data: { name, active: true },
      });
      created++;
    } catch (e) {
      // Unique constraint (someone added it while we were writing) -- benign.
      if (String(e?.message ?? e).includes('Unique')) continue;
      console.error(`  failed: ${name} -- ${e?.message ?? e}`);
    }
  }

  console.log(`\nDone. Created ${created} of ${toCreate.length} industry master rows.`);
  console.log('\nTop 10 by IPO occurrence:');
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([n, c]) => {
    console.log(`  ${String(c).padStart(4)} × ${n}`);
  });
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
