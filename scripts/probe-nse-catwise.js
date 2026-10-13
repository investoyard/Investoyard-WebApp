#!/usr/bin/env node
/**
 * READ-ONLY probe of the NSE catwise feed — prints the RAW rows the exchange
 * sends for an open issue, category and sub-category.
 *
 *   node scripts/probe-nse-catwise.js HDFIRE LOANFRONT
 *   node scripts/probe-nse-catwise.js            # every issue open today
 *
 * One GET per symbol. Writes NOTHING — not to the database, not to disk.
 *
 * WHY THIS EXISTS: on 2026-10-13 this file claimed the QIB breakdown
 * "is not in our data at all". It is: the poller discards it at
 * `bucketNse(r.category)`, which is never passed the `subCategory` the adapter
 * has always parsed. This probe is how that was settled — and it also proved
 * the sub-rows sum EXACTLY to the `qib` figure we already store, i.e. they are
 * a partition of it with no double-count risk.
 *
 * TWO TRAPS IT ENCODES, both of which cost time the first time:
 *
 *  1. CWD DECIDES WHETHER THE CREDENTIAL OPENS AT ALL. The NSE credential is
 *     sealed under the key minted during the 2026-09-28 incident, which lives
 *     at `apps/api/dist/.pii-vault.key` and is picked up only as a
 *     cwd-relative legacy fallback. Run from the repo root or `apps/api` and
 *     every decrypt dies with "Unsupported state or unable to authenticate
 *     data" — which looks exactly like key loss. Hence the chdir below.
 *
 *  2. `catwise failed` ON A RECORD WITH A GOOD RESERVATION TABLE MEANS THE
 *     DATES, NOT THE FEED. The exchange refuses a symbol that is not open yet.
 *     That is how RAVITA's one-day-early dates were found. Compare against
 *     `scripts/probe-nse-ipomaster.js` before suspecting the adapter.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

/* The five QIB sub-category codes, and the four lines every information site
   prints them as. FI (financial institutions) + IC (insurance) are both
   DOMESTIC institutions, so they share one line. */
const QIB_SUB_LABEL = { FII: 'FIIs', FI: 'DIIs', IC: 'DIIs', MF: 'Mutual funds', OTH: 'Others' };

async function nseCredential(prisma) {
  const vault = new PiiVaultService();
  const row =
    (await prisma.memberCredential.findFirst({ where: { exchange: 'NSE_EIPO', active: true, subscriptionUse: true } })) ||
    (await prisma.memberCredential.findFirst({ where: { exchange: 'NSE_EIPO', active: true } }));
  if (!row) throw new Error('no active NSE_EIPO credential');
  return {
    id: row.id, exchange: row.exchange, memberName: row.memberName, loginId: row.loginId,
    memberCode: row.memberCode, password: await vault.resolve(row.passwordRef),
    ibbsId: row.ibbsIdRef ? await vault.resolve(row.ibbsIdRef) : undefined,
    checksumKey: row.checksumKeyRef ? await vault.resolve(row.checksumKeyRef) : undefined,
    subBrokerCode: row.subBrokerCode ?? undefined, baseUrl: row.baseUrl, env: row.env,
  };
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const cred = await nseCredential(prisma);
    console.log(`NSE member: ${cred.memberName} (${cred.env})`);

    let symbols = process.argv.slice(2).map((s) => s.toUpperCase());
    if (!symbols.length) {
      const now = new Date();
      const open = await prisma.ipo.findMany({
        where: { hidden: false, openDate: { lte: now }, closeDate: { gte: now } },
        select: { symbol: true },
      });
      symbols = open.map((i) => i.symbol);
      console.log(`no symbols given — using the ${symbols.length} open today`);
    }

    const q = new RA.NseQueryAdapter();
    for (const sym of symbols) {
      console.log(`\n===== ${sym} =====`);
      let rows;
      try {
        rows = await q.getCatwise(sym, cred);
      } catch (e) {
        console.log(`  ERROR: ${e.message}`);
        console.log('  ^ if this record HAS a reservation table, suspect the DATES first:');
        console.log('    the exchange refuses a symbol that is not open yet (see the docblock).');
        continue;
      }
      if (!rows.length) { console.log('  (no demand rows)'); continue; }
      console.log('  category      subCat   label           quantity      bidCount');
      for (const r of rows) {
        const lbl = String(r.category).toUpperCase() === 'QIB' ? (QIB_SUB_LABEL[String(r.subCategory).toUpperCase()] ?? '?') : '';
        console.log('  ' + String(r.category).padEnd(13) + String(r.subCategory ?? '—').padEnd(9) +
          lbl.padEnd(16) + String(r.quantity).padStart(10) + String(r.bidCount ?? '—').padStart(14));
      }

      /* The whole point: do the QIB sub-rows partition our stored total, or
         is there a parent row that would double-count if we summed them? */
      const qib = rows.filter((r) => String(r.category).toUpperCase() === 'QIB');
      if (!qib.length) continue;
      const bare = qib.filter((r) => !r.subCategory);
      const sub = qib.filter((r) => r.subCategory);
      const subSum = sub.reduce((a, r) => a + r.quantity, 0);
      console.log(`  --> QIB: ${qib.length} row(s) — bare ${bare.length}, sub-category ${sub.length}; sub-sum ${subSum}`);
      if (bare.length && sub.length) {
        console.log('  --> !! PARENT AND SUB BOTH PRESENT — do NOT sum blindly, reconcile first.');
      }
      const stored = await prisma.ipo.findFirst({ where: { symbol: sym }, select: { id: true } });
      if (stored) {
        const row = await prisma.ipoSubscription.findFirst({ where: { ipoId: stored.id, category: 'qib' }, select: { nseShares: true } });
        const have = row?.nseShares == null ? null : Number(row.nseShares);
        if (have !== null) {
          console.log(`  --> stored qib nseShares ${have} vs sub-sum ${subSum} — ` +
            (have === subSum ? 'EXACT MATCH: the sub-rows PARTITION what we already store.'
                             : `DIFFER by ${have - subSum} — investigate before storing a breakdown.`));
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
