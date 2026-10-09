/**
 * Remove the stored QIB "applications" multiple, which the system's own rules
 * say cannot be computed.
 *
 * DRY RUN BY DEFAULT — pass --apply to write.
 *
 * WHY. An Application-wise multiple is `bids ÷ applications-needed-for-1×`, and
 * that needs a MINIMUM BID. QIB has none — institutional bids vary without
 * limit — which is why `minApplicationLots('qib')` returns 0 and why
 * `APP_WISE_ORDER` leaves QIB out of the Application-wise panel entirely.
 *
 * The poller disagreed with itself: its docblock said "QIB — no per-application
 * ratio meaningful (institutional)" while `sharesPerApp` had no QIB branch and
 * fell through to `lotSize`, pricing an institutional bid as one retail lot.
 * Fixed in `subscription.service.ts` on 2026-10-09; this clears what it wrote.
 *
 * THE BID COUNT IS KEPT. The exchange really did report N QIB applications —
 * that figure is real and the day-wise table renders it beside a dash
 * (`AppCellView` already handles a null multiple with a present count). Only
 * the multiple goes.
 *
 * MOST OF THE STORED VALUES ARE `0`, and those are the dangerous ones: a 0.12
 * looks odd enough to question, while `0×` reads as a real measurement of no
 * demand. 18 of the 22 rows stored 0.
 *
 * `extra` is written with a JSONB MERGE, never a read-modify-write — the poller
 * rewrites that column every 60s on a live issue (every 5s after 15:30). All
 * the affected issues are closed today, but the rule does not depend on that.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = 'C:/ProgramData/Investoyard/backups';

(async () => {
  console.log(APPLY ? 'APPLYING\n' : 'DRY RUN — pass --apply to write\n');

  const rows = await p.ipoSubscription.findMany({
    where: { category: 'qib', NOT: { applicationsSubscribed: null } },
    select: { id: true, ipoId: true, bidCount: true, applicationsSubscribed: true },
  });
  const ipos = await p.ipo.findMany({ select: { id: true, symbol: true, extra: true } });
  const byId = new Map(ipos.map((i) => [i.id, i]));

  console.log(`IpoSubscription — ${rows.length} qib row(s) carrying a multiple:`);
  for (const r of rows) {
    console.log(`  ${(byId.get(r.ipoId)?.symbol ?? '?').padEnd(12)} bids=${String(r.bidCount ?? '—').padStart(5)}  x=${r.applicationsSubscribed} → null`);
  }

  /* Day-wise history: clear apps.qib.x, keep apps.qib.n. */
  const logEdits = [];
  for (const i of ipos) {
    const e = i.extra ?? {};
    let touched = 0;
    const strip = (arr) => {
      if (!Array.isArray(arr)) return arr;
      return arr.map((entry) => {
        const q = entry?.apps?.qib;
        if (!q || q.x == null) return entry;
        touched++;
        return { ...entry, apps: { ...entry.apps, qib: { ...q, x: null } } };
      });
    };
    const subLog = strip(e.subLog);
    const subLogHour = strip(e.subLogHour);
    if (touched > 0) logEdits.push({ id: i.id, symbol: i.symbol, touched, subLog, subLogHour });
  }

  console.log(`\nDay-wise logs — ${logEdits.length} record(s), ${logEdits.reduce((n, l) => n + l.touched, 0)} entr(ies):`);
  for (const l of logEdits) console.log(`  ${l.symbol.padEnd(12)} ${l.touched} entries · apps.qib.x cleared, n kept`);

  if (!APPLY) { await p.$disconnect(); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const file = path.join(BACKUP_DIR, `qib-application-multiple-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    subscriptionRows: rows.map((r) => ({ id: r.id, symbol: byId.get(r.ipoId)?.symbol, before: r.applicationsSubscribed })),
    dayWise: logEdits.map((l) => ({ symbol: l.symbol, entries: l.touched })),
  }, null, 2), 'utf8');
  console.log(`\nbackup written: ${file}`);

  for (const r of rows) {
    await p.ipoSubscription.update({ where: { id: r.id }, data: { applicationsSubscribed: null } });
  }
  for (const l of logEdits) {
    await p.$executeRawUnsafe(
      `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify({ subLog: l.subLog, subLogHour: l.subLogHour }),
      l.id,
    );
  }
  console.log(`\ncleared ${rows.length} subscription row(s) and ${logEdits.length} day-wise log(s).`);
  await p.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await p.$disconnect(); process.exit(1); });
