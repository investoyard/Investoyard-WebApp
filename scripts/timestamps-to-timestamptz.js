// Convert every naive `timestamp without time zone` column to `timestamptz`.
//
// The whole database stored IST WALL-CLOCK in naive columns: the connection
// runs at Asia/Calcutta, so the driver sends `…T14:51:42+05:30` and the cast to
// a naive column drops the offset. Prisma then reads the value back as if it
// were UTC and `.toISOString()` labels it Z — so every timestamp reached the UI
// 5h30m in the future. The subscription card read "Updated 8:19 PM" at 2:49 PM.
//
// `AT TIME ZONE 'Asia/Kolkata'` reads each stored value AS IST — which is what
// it actually is — and yields the true instant, so the type change CORRECTS
// every existing row as it converts. There is no separate backfill, and no
// window in which some rows are converted and others are not.
//
// Reversible: ALTER ... TYPE timestamp USING col AT TIME ZONE 'Asia/Kolkata'.
//
// Usage:
//   node scripts/timestamps-to-timestamptz.js           report only (default)
//   node scripts/timestamps-to-timestamptz.js --apply    convert

const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const DRY = !process.argv.includes('--apply');
const ZONE = 'Asia/Kolkata';

(async () => {
  console.log(`Mode: ${DRY ? 'REPORT ONLY (no writes)' : 'APPLY'}\n`);

  const cols = await prisma.$queryRawUnsafe(`
    select c.table_name, c.column_name
      from information_schema.columns c
      join pg_class pc on pc.relname = c.table_name
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
     where c.table_schema = 'public'
       and c.data_type = 'timestamp without time zone'
       and pc.relkind = 'r'
     order by c.table_name, c.column_name`);

  if (!cols.length) { console.log('Nothing to convert — every timestamp column is already timestamptz.'); return; }
  console.log(`${cols.length} naive timestamp column(s):\n`);
  for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

  if (DRY) { console.log('\nREPORT ONLY — re-run with --apply.'); return; }

  // One transaction: either the whole database speaks instants or none of it
  // does. A half-converted schema is the exact trap that bit the poller on
  // 2026-09-25, where two branches wrote the same column in two timezones.
  let done = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of cols) {
      await tx.$executeRawUnsafe(
        `ALTER TABLE "${c.table_name}" ALTER COLUMN "${c.column_name}" `
        + `TYPE timestamptz USING "${c.column_name}" AT TIME ZONE '${ZONE}'`,
      );
      done++;
    }
  }, { timeout: 120_000 });

  const left = await prisma.$queryRawUnsafe(`
    select count(*)::int as n from information_schema.columns c
      join pg_class pc on pc.relname = c.table_name
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
     where c.table_schema='public' and c.data_type='timestamp without time zone' and pc.relkind='r'`);
  console.log(`\nconverted : ${done}`);
  console.log(`remaining naive columns : ${left[0].n}`);
})().catch((e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
