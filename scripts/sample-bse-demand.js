#!/usr/bin/env node
/**
 * READ-ONLY sampler — logs in ONCE and re-reads BSE's demand schedule every
 * `--every` seconds for `--for` seconds, printing the QIB total each time.
 *
 *   node scripts/sample-bse-demand.js JPL --every 45 --for 420
 *
 * WHY: on 2026-10-23 NSE's catwise moved on consecutive minutes while BSE's
 * demand schedule returned byte-identical QIB figures for ten minutes on the
 * CLOSING DAY of a Rs 30,000 Cr issue. That is either a coarse refresh cycle
 * on BSE's side or a stalled feed, and the two are told apart only by watching
 * it. A single read cannot distinguish "not moving" from "not updating".
 *
 * One login, N reads. Writes NOTHING.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

const QIB_CATS = ['QIB', 'IC', 'FI', 'FII', 'OTH', 'MF'];
const inr = (n) => Number(n || 0).toLocaleString('en-IN');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const everyMs = arg('every', 45) * 1000;
  const forMs = arg('for', 420) * 1000;
  const symbol = (process.argv[2] || '').toUpperCase();
  if (!symbol || symbol.startsWith('--')) throw new Error('usage: sample-bse-demand.js SYMBOL [--every 45] [--for 420]');

  const prisma = new PrismaClient();
  try {
    const vault = new PiiVaultService();
    const row =
      (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true, subscriptionUse: true } })) ||
      (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true } }));
    if (!row) throw new Error('no active BSE_IBBS credential');
    const cred = {
      exchange: row.exchange, memberName: row.memberName, loginId: row.loginId,
      memberCode: row.memberCode, password: await vault.resolve(row.passwordRef),
      ibbsId: row.ibbsIdRef ? await vault.resolve(row.ibbsIdRef) : undefined,
      checksumKey: row.checksumKeyRef ? await vault.resolve(row.checksumKeyRef) : undefined,
      baseUrl: row.baseUrl, env: row.env,
    };
    const adapter = new RA.BseQueryAdapter();
    const token = await adapter.login(cred);

    const until = Date.now() + forMs;
    let prev = null;
    while (Date.now() < until) {
      const t = new Date().toISOString().slice(11, 19);
      let line;
      try {
        const rows = await adapter.getDemandSchedule(symbol, token, cred);
        let qib = 0;
        const per = {};
        for (const r of rows) {
          const c = String(r.category || '').toUpperCase();
          if (!QIB_CATS.includes(c)) continue;
          qib += r.quantity || 0;
          per[c] = (per[c] || 0) + (r.quantity || 0);
        }
        const delta = prev == null ? '' : (qib === prev ? '   (unchanged)' : '   +' + inr(qib - prev));
        line = `${t}Z  qib ${inr(qib).padStart(16)}${delta}   ` +
          QIB_CATS.filter((c) => per[c]).map((c) => c + ' ' + inr(per[c])).join('  ');
        prev = qib;
      } catch (e) {
        line = `${t}Z  read failed: ${e && e.message}`;
      }
      console.log(line);
      if (Date.now() + everyMs >= until) break;
      await sleep(everyMs);
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
