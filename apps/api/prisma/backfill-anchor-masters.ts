/**
 * One-shot migration — retro-fits every IPO's stored anchor roster to the
 * Anchor Investors master (operator ask 2026-09-10). Idempotent set-union:
 * running twice makes no change on the second pass.
 *
 *   cd apps/api && npx ts-node prisma/backfill-anchor-masters.ts        # dry-run
 *   cd apps/api && npx ts-node prisma/backfill-anchor-masters.ts --write  # apply
 *
 * Rules:
 *   - For each row in `ipo.extra.anchors`, run the parser's own resolveMaster
 *     (case + alias + suffix-aware) against the active AnchorMaster rows.
 *   - When matched, replace `name` with the master's canonical text.
 *   - When unmatched, leave the row untouched (report as "still free-text").
 *   - Never invents rows, never drops rows, never touches shares/pct/amount.
 *   - Never runs against an IPO whose extra.anchors is absent or empty.
 */
import { PrismaClient } from '@prisma/client';
import { normalise, MASTER_ALIASES } from '@investoyard/shared-types';

/**
 * STRICT resolver — exact normalise match OR alias only. Deliberately skips
 * the containment fallback that `resolveMaster` (the interactive one) uses,
 * because an unreviewed backfill can't be trusted to guess. A dry run showed
 * containment linking "ICICI PRUDENTIAL SMALLCAP" → "Integrated Core
 * Strategies" and "IDPITER INDIA FUND" → "Morgan Stanley" via short-prefix
 * matches. Those are the interactive path's problem to flag; migration
 * refuses to guess. Unmatched rows stay as free text.
 */
function strictResolve<T extends { id: string; name: string }>(stored: string, masters: T[]): T | null {
  const want = normalise(stored);
  if (!want) return null;
  const byNorm = new Map<string, T>();
  for (const m of masters) byNorm.set(normalise(m.name), m);
  const exact = byNorm.get(want);
  if (exact) return exact;
  const aliased = MASTER_ALIASES[want];
  if (aliased && byNorm.get(aliased)) return byNorm.get(aliased)!;
  return null;
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function main() {
  const write = process.argv.includes('--write');
  if (!write) console.log('DRY RUN — pass --write to persist changes.\n');

  const masters = await prisma.anchorMaster.findMany({
    where: { active: true }, select: { id: true, name: true },
  });
  if (!masters.length) {
    console.log('No active anchor masters — nothing to match against. Seed the master first.');
    return;
  }
  console.log(`Loaded ${masters.length} anchor master row(s).`);

  // Prisma's JSON filters require a scalar predicate to key off, and there's
  // no cheap "is present" one — so we fetch every IPO and filter in JS.
  // The catalog is small enough (<3K rows even at full historical import)
  // for this to be fine as a one-shot migration.
  const ipos = await prisma.ipo.findMany({
    select: { id: true, symbol: true, name: true, extra: true },
  });

  let touched = 0;
  let renamed = 0;
  let unchanged = 0;
  let stillFree = 0;

  for (const ipo of ipos) {
    const extra: any = (ipo.extra ?? {}) as any;
    const list: any[] = Array.isArray(extra.anchors) ? extra.anchors : [];
    if (!list.length) continue;

    let changed = false;
    const next = list.map((row: any) => {
      if (!row || typeof row.name !== 'string' || !row.name.trim()) return row;
      const m = strictResolve(row.name, masters);
      if (!m) { stillFree++; return row; }
      if (m.name === row.name) { unchanged++; return row; }
      renamed++;
      changed = true;
      return { ...row, name: m.name };
    });

    if (changed) {
      touched++;
      console.log(`  ${ipo.symbol.padEnd(14)} ${next.filter((r: any, i: number) => r.name !== list[i].name)
        .map((r: any, i: number) => `${list[i].name} → ${r.name}`).join(' · ')}`);
      if (write) {
        await prisma.ipo.update({
          where: { id: ipo.id },
          data: { extra: { ...extra, anchors: next } },
        });
      }
    }
  }

  console.log(`\nSummary`);
  console.log(`  IPOs touched:       ${touched}`);
  console.log(`  Anchor rows renamed: ${renamed}`);
  console.log(`  Already canonical:   ${unchanged}`);
  console.log(`  Still free-text:     ${stillFree}   (no master match)`);
  if (!write && touched > 0) console.log(`\nRe-run with --write to persist.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
