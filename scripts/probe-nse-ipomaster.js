#!/usr/bin/env node
/**
 * READ-ONLY probe of NSE's ipomaster — lists every issue the exchange knows
 * about and DIFFS its dates against ours.
 *
 *   node scripts/probe-nse-ipomaster.js
 *
 * Writes NOTHING. One login + one GET.
 *
 * WHY THIS EXISTS: on 2026-10-13 RAVITA was stored as 13→15 Oct while NSE said
 * 14→16. Its `catwise` therefore failed (the exchange refuses a symbol that is
 * not open yet) and it had zero subscription rows while our own site published
 * it as OPEN. Of the six records both we and the master carried, it was the
 * ONLY one that disagreed — which is what made the diagnosis certain rather
 * than a guess.
 *
 * THE CLOSE DATE IS THE EXPENSIVE END. The poller's window is gated on it, so
 * a close date one day early stops polling while the exchange is still taking
 * bids on the real final day — normally the heaviest — and that day is gone for
 * good (the W-SUB class of permanent loss).
 *
 * TWO TRAPS:
 *  1. `ipomaster` ships dates as DD-MM-YYYY. A string compare against our
 *     YYYY-MM-DD is garbage; the first pass of this very check produced a
 *     nonsense "open today" list that way. Hence `ymd()`.
 *  2. CWD decides whether the credential decrypts at all — see the docblock on
 *     scripts/probe-nse-catwise.js. Hence the chdir.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

/** DD-MM-YYYY (what the exchange sends) → YYYY-MM-DD (what we compare on). */
const ymd = (d) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(d ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (d ? String(d) : '?');
};

(async () => {
  const prisma = new PrismaClient();
  try {
    const vault = new PiiVaultService();
    const row =
      (await prisma.memberCredential.findFirst({ where: { exchange: 'NSE_EIPO', active: true, subscriptionUse: true } })) ||
      (await prisma.memberCredential.findFirst({ where: { exchange: 'NSE_EIPO', active: true } }));
    if (!row) throw new Error('no active NSE_EIPO credential');
    const cred = {
      id: row.id, exchange: row.exchange, memberName: row.memberName, loginId: row.loginId,
      memberCode: row.memberCode, password: await vault.resolve(row.passwordRef),
      ibbsId: row.ibbsIdRef ? await vault.resolve(row.ibbsIdRef) : undefined,
      checksumKey: row.checksumKeyRef ? await vault.resolve(row.checksumKeyRef) : undefined,
      subBrokerCode: row.subBrokerCode ?? undefined, baseUrl: row.baseUrl, env: row.env,
    };

    const a = new RA.NseEipoAdapter();
    const session = await a.login(cred);
    const all = await a.getIpoMaster(session, cred);
    console.log(`NSE member: ${cred.memberName} (${cred.env}) — ${all.length} ipomaster entries\n`);
    console.log('  SYMBOL        TYPE      NSE open -> close         OURS open -> close        VERDICT');

    const disagree = [], missing = [];
    for (const e of all.sort((x, y) => (ymd(x.openDate) < ymd(y.openDate) ? -1 : 1))) {
      const ours = await prisma.ipo.findFirst({ where: { symbol: e.symbol }, select: { openDate: true, closeDate: true, hidden: true } });
      const no = ymd(e.openDate), nc = ymd(e.closeDate);
      const oo = ours?.openDate?.toISOString().slice(0, 10) ?? null;
      const oc = ours?.closeDate?.toISOString().slice(0, 10) ?? null;
      let verdict;
      if (!ours) { verdict = 'not in our catalogue'; if (String(e.issueType).toUpperCase() === 'EQUITY') missing.push(e.symbol); }
      else if (oo === no && oc === nc) verdict = 'ok';
      else { verdict = '*** DISAGREES ***'; disagree.push({ sym: e.symbol, no, nc, oo, oc }); }
      console.log('  ' + String(e.symbol).padEnd(14) + String(e.issueType ?? '-').padEnd(10) +
        `${no} -> ${nc}`.padEnd(26) + (ours ? `${oo} -> ${oc}`.padEnd(26) : '—'.padEnd(26)) + verdict);
    }

    console.log('');
    if (!disagree.length) console.log('No date disagreements.');
    for (const d of disagree) {
      console.log(`DATE FAULT  ${d.sym}: exchange says ${d.no} -> ${d.nc}, we say ${d.oo} -> ${d.oc}`);
      if (d.oc && d.oc < d.nc) console.log(`  !! our close date is EARLY — the poller would stop before the real final bidding day (${d.nc}).`);
    }
    /* Only EQUITY is flagged: we deliberately do not carry the RIGHTS and DEBT
       entries the master also lists. */
    if (missing.length) console.log(`\nEQUITY issues on the master but NOT in our catalogue: ${missing.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
