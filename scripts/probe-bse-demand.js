#!/usr/bin/env node
/**
 * READ-ONLY probe of the BSE demand-schedule feed — the mirror of
 * `probe-nse-catwise.js`, and it exists because CLAUDE.md has carried the
 * caveat "ONLY NSE WAS PROBED ... BSE's live shape is UNVERIFIED" since the
 * QIB split shipped on 2026-10-13.
 *
 *   node scripts/probe-bse-demand.js JPL
 *   node scripts/probe-bse-demand.js            # every issue open today
 *
 * One login + one POST per symbol. Writes NOTHING.
 *
 * WHAT IT IS LOOKING FOR. `bucketBse` returns NULL for a category it does not
 * recognise, and the caller then adds nothing — so an unrecognised CATEGORY
 * does not land in Others the way an unrecognised SUB-category does, it is
 * DROPPED FROM THE TOTAL ENTIRELY. That asymmetry is invisible from our own
 * data (the stored rows look internally consistent) and is only visible
 * against the raw feed, which is what this prints. Any row marked DROPPED is
 * demand the exchange reported and we are not counting.
 *
 * SAME TWO TRAPS AS THE NSE PROBE:
 *   1. CWD decides whether the credential opens at all — the vault key sits at
 *      `apps/api/dist/.pii-vault.key` and is a cwd-relative legacy fallback,
 *      so a run from the repo root dies with "Unsupported state or unable to
 *      authenticate data", which looks exactly like key loss. Hence the chdir.
 *   2. An error on a record with good data usually means the DATES, not the
 *      feed — the exchange refuses a symbol that is not open yet.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

/* A verbatim copy of the poller's own map (subscription.service.ts). Copied
   rather than imported because the service pulls in Prisma's Decimal and the
   whole Nest graph; the point of the probe is to show what the SHIPPED rule
   does with the SHIPPED feed, so any drift between the two would itself be a
   finding — diff them if this ever disagrees with production. */
function bucketBse(cat, subCat) {
  const c = String(cat || '').toUpperCase();
  const s = String(subCat || '').toUpperCase();
  if (['QIB', 'IC', 'FI', 'FII', 'OTH', 'MF'].includes(c)) return 'qib';
  if ((c === 'CO' || c === 'NOH') && s === 'BT') return 'hni2';
  if ((c === 'CO' || c === 'NOH') && s === 'AT') return 'hni';
  if (c === 'IND' && s === 'OTHERBT') return 'hni2';
  if (c === 'IND' && s === 'OTHERAT') return 'hni';
  if (c === 'IND' && (s === 'RII' || s === '')) return 'retail';
  if (c === 'RII') return 'retail';
  if (c === 'EMP' || c === 'EMPLOYEE') return 'employee';
  if (c === 'SHA') return 'shareholder';
  if (c === 'POL') return 'policyholder';
  return null;
}
const QIB_SUB = { FII: 'fii', MF: 'mf', FI: 'dii', IC: 'dii', OTH: 'oth' };
const qibSubKey = (code) => QIB_SUB[String(code || '').toUpperCase()] || 'oth';

const inr = (n) => Number(n || 0).toLocaleString('en-IN');

async function bseCredential(prisma) {
  const vault = new PiiVaultService();
  const row =
    (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true, subscriptionUse: true } })) ||
    (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true } }));
  if (!row) throw new Error('no active BSE_IBBS credential');
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
    const cred = await bseCredential(prisma);
    console.log(`BSE member: ${cred.memberName} (${cred.env})`);

    let symbols = process.argv.slice(2).map((s) => s.toUpperCase());
    if (!symbols.length) {
      const now = new Date();
      const open = await prisma.ipo.findMany({
        where: { hidden: false, openDate: { lte: now }, closeDate: { gte: now } },
        select: { symbol: true },
      });
      symbols = open.map((i) => i.symbol);
    }
    if (!symbols.length) { console.log('no open issues'); return; }

    const adapter = new RA.BseQueryAdapter();
    const token = await adapter.login(cred);
    console.log('login ok');

    for (const symbol of symbols) {
      console.log(`\n===== ${symbol} =====`);
      let rows;
      try {
        rows = await adapter.getDemandSchedule(symbol, token, cred);
      } catch (e) {
        console.log(`  demandschedule failed: ${e && e.message}`);
        console.log('  (an issue that is not open yet is refused — check the dates first)');
        continue;
      }
      if (!rows.length) { console.log('  no rows'); continue; }

      console.log('  category  subCat     cut        quantity   -> bucket        split');
      const perBucket = new Map();
      const split = new Map();
      let dropped = 0;
      const droppedRows = [];
      for (const r of rows) {
        const b = bucketBse(r.category, r.subCategory);
        const k = b === 'qib' ? qibSubKey(r.category) : '';
        console.log(
          '  ' + String(r.category).padEnd(9) + String(r.subCategory || '-').padEnd(10) +
          (r.atCutoff ? 'C' : 'P').padEnd(4) + inr(r.quantity).padStart(14) +
          '   -> ' + (b || 'DROPPED').padEnd(13) + k,
        );
        if (!b) { dropped += r.quantity || 0; droppedRows.push(r); continue; }
        perBucket.set(b, (perBucket.get(b) || 0) + (r.quantity || 0));
        if (b === 'qib') split.set(k, (split.get(k) || 0) + (r.quantity || 0));
      }

      console.log('\n  bucketed:');
      for (const [b, q] of [...perBucket].sort()) console.log('    ' + b.padEnd(13) + inr(q).padStart(16));
      if (split.size) {
        console.log('  qib split:');
        for (const [k, q] of [...split].sort()) console.log('    ' + k.padEnd(13) + inr(q).padStart(16));
      }

      /* The headline. Shares the exchange reported that we are not counting. */
      if (dropped > 0) {
        console.log(`\n  *** ${inr(dropped)} SHARES DROPPED — bucketBse does not recognise:`);
        for (const r of droppedRows) {
          console.log(`        category=${r.category}  subCategory=${r.subCategory || '-'}  qty=${inr(r.quantity)}`);
        }
      } else {
        console.log('\n  every row bucketed — nothing dropped');
      }

      /* Cross-check against what we have stored, the way the NSE probe does. */
      const ipo = await prisma.ipo.findFirst({ where: { symbol }, select: { id: true } });
      if (ipo) {
        const stored = await prisma.ipoSubscription.findMany({
          where: { ipoId: ipo.id },
          select: { category: true, bseShares: true },
        });
        console.log('  stored bseShares vs this feed:');
        for (const s of stored.sort((a, b) => a.category.localeCompare(b.category))) {
          const mine = perBucket.get(s.category) || 0;
          const have = Number(s.bseShares || 0);
          const mark = have === mine ? 'match' : `DIFF ${inr(mine - have)}`;
          console.log('    ' + s.category.padEnd(13) + inr(have).padStart(16) + inr(mine).padStart(16) + '   ' + mark);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
