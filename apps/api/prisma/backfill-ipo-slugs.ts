/**
 * One-shot migration — generates the SEO slug for every IPO in the
 * catalog (operator ask 2026-09-10). Reads name → runs the shared
 * `ipoSlug` helper → writes onto `Ipo.slug`. Skips rows that already
 * carry a slug so a second run is a no-op.
 *
 *   cd apps/api && npx ts-node prisma/backfill-ipo-slugs.ts        # dry-run
 *   cd apps/api && npx ts-node prisma/backfill-ipo-slugs.ts --write  # apply
 *
 * On a collision (two IPOs whose names shortName-normalise to the
 * same slug), the second one gets a numeric suffix -2, -3, … so the
 * @unique constraint doesn't refuse the write. Sample from a Sep-2026
 * dry-run: none of the 12 live IPOs collide, but the historical import
 * has a handful of name reuses (year-over-year rounds) that will use
 * the suffix path.
 */
import { PrismaClient } from '@prisma/client';
import { ipoSlug } from '@investoyard/shared-types';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function main() {
  const write = process.argv.includes('--write');
  if (!write) console.log('DRY RUN — pass --write to persist changes.\n');

  const ipos = await prisma.ipo.findMany({
    select: { id: true, symbol: true, name: true, slug: true, closeDate: true },
    orderBy: { closeDate: 'asc' },   // stable order for reproducible collision suffixes
  });

  const taken = new Set<string>(ipos.map((i) => i.slug).filter(Boolean) as string[]);
  let filled = 0;
  let skipped = 0;
  let collided = 0;

  for (const ipo of ipos) {
    if (ipo.slug) { skipped++; continue; }
    const base = ipoSlug(ipo.name);
    if (!base) {
      console.log(`  ${ipo.symbol.padEnd(14)} name '${ipo.name}' → EMPTY slug (skipped — fix the name)`);
      continue;
    }
    let slug = base;
    let n = 2;
    while (taken.has(slug)) { slug = `${base}-${n++}`; collided++; }
    taken.add(slug);
    console.log(`  ${ipo.symbol.padEnd(14)} ${ipo.name.slice(0, 44).padEnd(44)} → ${slug}`);
    if (write) await prisma.ipo.update({ where: { id: ipo.id }, data: { slug } });
    filled++;
  }

  console.log(`\nSummary`);
  console.log(`  Filled:   ${filled}`);
  console.log(`  Skipped:  ${skipped}   (already had a slug)`);
  console.log(`  Collided: ${collided}  (suffixed with -N to keep unique)`);
  if (!write && filled > 0) console.log(`\nRe-run with --write to persist.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
