#!/usr/bin/env node
/**
 * READ-ONLY — dumps the RAW BSE /demandschedule response, unmapped.
 *
 *   node scripts/probe-bse-demand-raw.js JPL
 *
 * WHY: `BseQueryAdapter.getDemandSchedule` keeps four fields per row
 * (category, subcategory, qty, totalapplication, type) and DISCARDS everything
 * else. If the envelope or the rows carry an as-of / timestamp field, that
 * settles in one call what sampling can only infer — whether the figures we
 * are serving are the exchange's current book or a snapshot it took earlier.
 * This is the same lesson as the QIB split: before concluding a figure is
 * unavailable, look at what the adapter is throwing away.
 *
 * Writes NOTHING. Runs from apps/api/dist so the vault key resolves.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const { bseChecksum } = require('../packages/rail-adapters/dist/bse-checksum.js');

(async () => {
  const symbol = (process.argv[2] || 'JPL').toUpperCase();
  const prisma = new PrismaClient();
  try {
    const vault = new PiiVaultService();
    const row =
      (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true, subscriptionUse: true } })) ||
      (await prisma.memberCredential.findFirst({ where: { exchange: 'BSE_IBBS', active: true } }));
    if (!row) throw new Error('no active BSE_IBBS credential');
    const password = await vault.resolve(row.passwordRef);
    const ibbsId = row.ibbsIdRef ? await vault.resolve(row.ibbsIdRef) : undefined;
    const checksumKey = row.checksumKeyRef ? await vault.resolve(row.checksumKeyRef) : '';
    const base = row.baseUrl.replace(/\/$/, '')
      .replace(/\/ibbsapi\/ibbsapiservice\.svc$/i, '/ibbsmsgapi/iBBSWebBroadcastApi.svc');

    const loginBody = { membercode: row.memberCode, loginid: row.loginId, password, ibbsid: ibbsId };
    const lr = await fetch(`${base}/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Membercode: row.memberCode, Login: row.loginId,
        Checksum: bseChecksum(JSON.stringify(loginBody), checksumKey),
      },
      body: JSON.stringify(loginBody),
    });
    const lj = await lr.json();
    if (!lj || !lj.token) throw new Error('login failed: ' + JSON.stringify(lj));
    console.log('login ok   envelope keys:', Object.keys(lj).join(', '));

    const body = { symbol, issuetype: 'BB' };
    const payload = JSON.stringify(body);
    const dr = await fetch(`${base}/v1/demandschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Membercode: row.memberCode, Login: row.loginId, Token: String(lj.token),
        Checksum: bseChecksum(payload, checksumKey),
      },
      body: payload,
    });
    console.log('read at   ', new Date().toISOString());
    console.log('http      ', dr.status);
    /* Response headers can carry a Date / cache age that says the same thing. */
    for (const [k, v] of dr.headers.entries()) console.log('  hdr ' + k + ': ' + v);
    const text = await dr.text();
    let j;
    try { j = JSON.parse(text); } catch { console.log('body (not json):', text.slice(0, 2000)); return; }

    if (!Array.isArray(j)) {
      console.log('\nenvelope keys:', Object.keys(j).join(', '));
      for (const k of Object.keys(j)) {
        if (k === 'data') continue;
        console.log('  ' + k + ' =', JSON.stringify(j[k]));
      }
    } else {
      console.log('\nresponse is a bare array (no envelope)');
    }
    const rows = Array.isArray(j) ? j : (j.data ?? []);
    console.log('\nrows:', rows.length);
    if (rows.length) {
      console.log('row keys:', Object.keys(rows[0]).join(', '));
      console.log('\nfirst 3 rows verbatim:');
      for (const r of rows.slice(0, 3)) console.log('  ' + JSON.stringify(r));
      /* Name any key the adapter does not map — that is where a timestamp would be. */
      const mapped = new Set(['category', 'subcategory', 'subCategory', 'qty', 'totalapplication', 'type', 'symbol']);
      const extra = Object.keys(rows[0]).filter((k) => !mapped.has(k));
      console.log('\nkeys the adapter DISCARDS:', extra.length ? extra.join(', ') : '(none)');
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
