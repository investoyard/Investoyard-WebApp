#!/usr/bin/env node
/**
 * Repair JPL's BSE demand columns from the exchanges' OWN published final
 * subscription table.
 *
 *   node scripts/repair-jpl-bse-final.js            # dry run (default)
 *   node scripts/repair-jpl-bse-final.js --apply    # write
 *
 * WHY. BSE's member /demandschedule API froze at ~18:54 on 2026-10-23 and
 * never resumed — byte-identical figures across six fresh logins spanning
 * 18:54 to 19:16, with `totalapplication` frozen too, through the 19:00 close.
 * NSE's member feed is exact and final (verified to the share three times).
 * So every category is short by whatever BSE's book did in its last six
 * minutes, which on QIB is 10.2% of their book.
 *
 * THE METHOD IS `published consolidated - our NSE`, and it is not a guess:
 * it reproduces our FROZEN Mutual Funds figure EXACTLY (25,01,55,108), which
 * it could not do if the published table were on a different basis. NSE and
 * BSE publish byte-identical tables, so there is no third opinion to weigh.
 *
 * THE PROOF IS BUILT IN. After the repair, six stored multiples must equal
 * the exchange's published ones (NII 14.00, NII>10L 15.89, NII 2-10L 10.22,
 * Retail 2.72, Employee 2.93, Shareholder 7.60) and the QIB multiple the site
 * DISPLAYS must read 70.55x. The script asserts all of it and refuses to
 * write if any of it fails — so a wrong constant cannot land quietly.
 *
 * RUN IT AFTER 20:00 IST. JPL carries a per-issue poll window to 20:00 and
 * the poller's write is DESTRUCTIVE (deleteMany + createMany). `keepKnownFigures`
 * only carries a category forward on an EMPTY read, so a stale-but-non-empty
 * BSE read would overwrite this repair inside the minute. The script refuses
 * to --apply inside the window unless --force-in-window is given.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

const APPLY = process.argv.includes('--apply');
const FORCE_WINDOW = process.argv.includes('--force-in-window');
const SYMBOL = 'JPL';

/* ------------------------------------------------------------------ *
 * THE PUBLISHED TABLE. Transcribed from BOTH exchanges' own final
 * subscription pages (they are identical), 23 Oct 2026, 19:00 IST:
 *   BSE  /markets/publicissues/cummdemandschedule?ID=8047&status=L
 *   NSE  its own final subscription page, same figures.
 * `bidFor` is "No. of shares bid for"; `offered` is the published
 * "No. of shares offered/reserved", kept ONLY as a cross-check that we
 * are reading the same issue - it is never written.
 * ------------------------------------------------------------------ */
const PUBLISHED = {
  qib:         { bidFor: 3457557456, offered: 49007827,  times: 70.55 },
  hni:         { bidFor:  386167752, offered: 24296380,  times: 15.89 }, // NII > 10L
  hni2:        { bidFor:  124187376, offered: 12148189,  times: 10.22 }, // NII 2-10L
  retail:      { bidFor:  231162888, offered: 85037327,  times: 2.72 },
  employee:    { bidFor:   13743348, offered: 4694835,   times: 2.93 },
  shareholder: { bidFor:  169796748, offered: 22341376,  times: 7.60 },
};
const PUBLISHED_NII_BIDFOR = 510355128;     // row 2, must equal hni + hni2
const PUBLISHED_TOTAL_BIDFOR = 4382615568;  // the Total row
/* The QIB institutional split, rows 1(a)-1(d). FI and IC share the DIIs line
   on the published table exactly as our `dii` key does, so these map 1:1. */
const PUBLISHED_QIB_SPLIT = { fii: 1239271008, dii: 1524975360, mf: 357074628, oth: 336236460 };

const CATS = Object.keys(PUBLISHED);
const inr = (n) => Number(n || 0).toLocaleString('en-IN');
const fail = (m) => { console.error('\nREFUSED: ' + m); process.exit(1); };

(async () => {
  const prisma = new PrismaClient();
  try {
    /* ---------- 0. the poll window ---------- */
    const istMin = (() => {
      const d = new Date(Date.now() + 330 * 60000);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    })();
    const inWindow = istMin >= 9 * 60 && istMin < 20 * 60;
    console.log(`IST minute-of-day ${istMin} (${String(Math.floor(istMin / 60)).padStart(2, '0')}:${String(istMin % 60).padStart(2, '0')}) — poll window ${inWindow ? 'OPEN' : 'closed'}`);
    if (inWindow && APPLY && !FORCE_WINDOW) {
      fail('the poll window is still open; the poller would overwrite this within a minute. Re-run after 20:00 IST, or pass --force-in-window if you have stopped polling.');
    }

    const ipo = await prisma.ipo.findFirst({
      where: { symbol: SYMBOL },
      select: { id: true, symbol: true, extra: true, priceBandMax: true },
    });
    if (!ipo) fail(`${SYMBOL} not in the catalogue`);

    const rows = await prisma.ipoSubscription.findMany({ where: { ipoId: ipo.id } });
    const by = new Map(rows.map((r) => [r.category, r]));
    for (const c of [...CATS, 'nii', 'total']) if (!by.has(c)) fail(`no stored row for "${c}"`);

    /* ---------- 1. NSE must be final AND match what we store ---------- */
    const vault = new PiiVaultService();
    const cr = await prisma.memberCredential.findFirst({ where: { exchange: 'NSE_EIPO', active: true } });
    if (!cr) fail('no active NSE_EIPO credential');
    const cred = {
      exchange: cr.exchange, loginId: cr.loginId, memberCode: cr.memberCode,
      password: await vault.resolve(cr.passwordRef),
      ibbsId: cr.ibbsIdRef ? await vault.resolve(cr.ibbsIdRef) : undefined,
      checksumKey: cr.checksumKeyRef ? await vault.resolve(cr.checksumKeyRef) : undefined,
      baseUrl: cr.baseUrl, env: cr.env,
    };
    const NSE_CAT = { QIB: 'qib', NIBAT: 'hni', NIBBT: 'hni2', RETAIL: 'retail', EMPRET: 'employee', SHARET: 'shareholder' };
    const liveNse = {};
    const feed = await new RA.NseQueryAdapter().getCatwise(SYMBOL, cred);
    for (const r of feed) {
      const k = NSE_CAT[String(r.category || '').toUpperCase()];
      if (k) liveNse[k] = (liveNse[k] || 0) + (r.quantity || 0);
    }
    console.log('\n1. NSE live feed vs our stored NSE column');
    for (const c of CATS) {
      const stored = Number(by.get(c).nseShares || 0);
      const live = liveNse[c] || 0;
      console.log(`   ${c.padEnd(13)}${inr(live).padStart(16)}${inr(stored).padStart(16)}  ${live === stored ? 'match' : 'DIFFERS'}`);
      if (live !== stored) fail(`NSE ${c}: live feed ${inr(live)} != stored ${inr(stored)}. The NSE half must be final and exact before BSE can be inferred from it.`);
    }

    /* ---------- 2. derive BSE, with the guards ---------- */
    console.log('\n2. derived BSE final  (published - our NSE)');
    const newBse = {};
    for (const c of CATS) {
      const pub = PUBLISHED[c].bidFor;
      const nse = Number(by.get(c).nseShares || 0);
      const curBse = Number(by.get(c).bseShares || 0);
      const curTot = nse + curBse;
      if (pub < curTot) fail(`${c}: published ${inr(pub)} is BELOW our current total ${inr(curTot)}. A frozen feed can only be SHORT — this is a different fault and must not be "repaired" blindly.`);
      const b = pub - nse;
      if (b < curBse) fail(`${c}: derived BSE ${inr(b)} is below the stored BSE ${inr(curBse)}; subscription is cumulative and cannot shrink.`);
      if (b <= 0) fail(`${c}: derived BSE ${inr(b)} is not positive.`);
      newBse[c] = b;
      console.log(`   ${c.padEnd(13)}${inr(curBse).padStart(16)} -> ${inr(b).padStart(16)}   +${inr(b - curBse)}`);
    }
    const niiBse = newBse.hni + newBse.hni2;
    const totBse = CATS.reduce((a, c) => a + newBse[c], 0);
    const niiNse = Number(by.get('hni').nseShares) + Number(by.get('hni2').nseShares);
    const totNse = CATS.reduce((a, c) => a + Number(by.get(c).nseShares || 0), 0);

    /* ---------- 3. the published table must reconcile with itself ---------- */
    if (PUBLISHED.hni.bidFor + PUBLISHED.hni2.bidFor !== PUBLISHED_NII_BIDFOR) fail('published NII row does not equal its two bands — transcription error.');
    const pubSum = CATS.reduce((a, c) => a + PUBLISHED[c].bidFor, 0);
    if (pubSum !== PUBLISHED_TOTAL_BIDFOR) fail(`published categories sum to ${inr(pubSum)} but the Total row says ${inr(PUBLISHED_TOTAL_BIDFOR)} — transcription error.`);
    const splitSum = Object.values(PUBLISHED_QIB_SPLIT).reduce((a, b) => a + b, 0);
    if (splitSum !== PUBLISHED.qib.bidFor) fail(`published QIB sub-rows sum to ${inr(splitSum)} but QIB is ${inr(PUBLISHED.qib.bidFor)} — transcription error.`);
    if (totNse + totBse !== PUBLISHED_TOTAL_BIDFOR) fail(`repaired total ${inr(totNse + totBse)} != published total ${inr(PUBLISHED_TOTAL_BIDFOR)}.`);
    console.log('\n3. the published table reconciles with itself, and with our NSE half');

    /* ---------- 4. times, recomputed on the GROSS basis the poller stores ---------- *
     * The stored column is `demand / GROSS offered`; the PAGE recomputes against
     * the NET book. Both are deliberate and documented. Gross per category is
     * back-solved from the CURRENT stored pair, which is exact because the
     * current figures were themselves written by the poller. */
    console.log('\n4. stored times (gross basis) — must match the exchange wherever no anchor is involved');
    const grossOf = (c) => {
      const r = by.get(c);
      const dem = Number(r.nseShares || 0) + Number(r.bseShares || 0);
      const t = Number(r.timesSubscribed || 0);
      return t > 0 ? dem / t : 0;
    };
    const newTimes = {};
    let proofFailures = 0;
    for (const c of CATS) {
      const g = grossOf(c);
      if (!(g > 0)) fail(`${c}: cannot back-solve the offered base from the stored pair.`);
      const t = Math.round((PUBLISHED[c].bidFor / g) * 100) / 100;
      newTimes[c] = t;
      /* QIB is the ONE category where this must NOT match: the exchange divides
         by the NET (ex-anchor) book and we store against GROSS. */
      const expectMatch = c !== 'qib';
      const ok = !expectMatch || Math.abs(t - PUBLISHED[c].times) < 0.015;
      if (!ok) proofFailures++;
      console.log(`   ${c.padEnd(13)}${String(by.get(c).timesSubscribed).padStart(8)} -> ${String(t).padStart(8)}   exchange ${String(PUBLISHED[c].times).padStart(6)}   ${expectMatch ? (ok ? 'MATCH' : '*** MISMATCH') : '(gross basis, exchange is net — expected to differ)'}`);
    }
    const gNii = grossOf('nii'), gTot = grossOf('total');
    newTimes.nii = Math.round((PUBLISHED_NII_BIDFOR / gNii) * 100) / 100;
    newTimes.total = Math.round((PUBLISHED_TOTAL_BIDFOR / gTot) * 100) / 100;
    const niiOk = Math.abs(newTimes.nii - 14.00) < 0.015;
    if (!niiOk) proofFailures++;
    console.log(`   ${'nii'.padEnd(13)}${String(by.get('nii').timesSubscribed).padStart(8)} -> ${String(newTimes.nii).padStart(8)}   exchange ${String(14.00).padStart(6)}   ${niiOk ? 'MATCH' : '*** MISMATCH'}`);
    console.log(`   ${'total'.padEnd(13)}${String(by.get('total').timesSubscribed).padStart(8)} -> ${String(newTimes.total).padStart(8)}   (gross basis; exchange prints 22.19 against the NET offer)`);

    /* The figure the SITE will show for QIB — the one the operator compares. */
    const ex = ipo.extra || {};
    const grossQib = grossOf('qib');
    const anchorSh = Number(ex.anchorShares || 0);
    const anchorPct = Number(ex.anchorPct || 0);
    const deduct = anchorSh > 0 ? anchorSh : (anchorPct > 0 ? Math.round((grossQib * anchorPct) / 100) : 0);
    const netQib = deduct > 0 && deduct < grossQib ? grossQib - deduct : grossQib;
    const displayed = Math.round((PUBLISHED.qib.bidFor / netQib) * 100) / 100;
    const dispOk = Math.abs(displayed - PUBLISHED.qib.times) < 0.02;
    if (!dispOk) proofFailures++;
    console.log(`\n   QIB as the SITE will display it (net book ${inr(Math.round(netQib))}): ${displayed}x   exchange ${PUBLISHED.qib.times}x   ${dispOk ? 'MATCH' : '*** MISMATCH'}`);
    if (proofFailures) fail(`${proofFailures} multiple(s) do not reproduce the exchange's published figures. A constant is wrong — nothing written.`);

    if (!APPLY) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply (after 20:00 IST).');
      return;
    }

    /* ---------- 5. backup, then write ---------- */
    const dir = 'C:\\ProgramData\\Investoyard\\backups';
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(dir, `jpl-bse-final-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify({ rows, extra: ex }, null, 2));
    console.log(`\n5. backup written: ${backup}`);

    for (const c of CATS) {
      await prisma.ipoSubscription.update({
        where: { id: by.get(c).id },
        data: { bseShares: newBse[c], timesSubscribed: newTimes[c] },
      });
    }
    await prisma.ipoSubscription.update({
      where: { id: by.get('nii').id },
      data: { bseShares: niiBse, timesSubscribed: newTimes.nii },
    });
    await prisma.ipoSubscription.update({
      where: { id: by.get('total').id },
      data: { bseShares: totBse, timesSubscribed: newTimes.total },
    });

    /* `extra` via jsonb MERGE, never a read-modify-write — the standing rule. */
    const split = {};
    for (const k of Object.keys(PUBLISHED_QIB_SPLIT)) {
      split[k] = { sh: PUBLISHED_QIB_SPLIT[k], bids: ex.qibSplit?.[k]?.bids ?? 0 };
    }
    const subLog = Array.isArray(ex.subLog) ? JSON.parse(JSON.stringify(ex.subLog)) : [];
    const subLogHour = Array.isArray(ex.subLogHour) ? JSON.parse(JSON.stringify(ex.subLogHour)) : [];
    const stampEntry = (e) => {
      if (!e) return;
      for (const c of CATS) if (e[c] != null) e[c] = newTimes[c];
      if (e.nii != null) e.nii = newTimes.nii;
      if (e.total != null) e.total = newTimes.total;
    };
    stampEntry(subLog[subLog.length - 1]);
    stampEntry(subLogHour[subLogHour.length - 1]);

    await prisma.$executeRawUnsafe(
      `UPDATE "Ipo" SET "extra" = COALESCE("extra", '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify({ qibSplit: split, subLog, subLogHour }),
      ipo.id,
    );

    /* ---------- 6. read back ---------- */
    const after = await prisma.ipoSubscription.findMany({ where: { ipoId: ipo.id }, orderBy: { category: 'asc' } });
    console.log('\n6. after:');
    let tot = 0;
    for (const r of after) {
      const t = Number(r.nseShares || 0) + Number(r.bseShares || 0);
      if (CATS.includes(r.category)) tot += t;
      console.log(`   ${r.category.padEnd(13)}${inr(r.nseShares).padStart(16)}${inr(r.bseShares).padStart(16)}${inr(t).padStart(18)}${String(r.timesSubscribed).padStart(9)}`);
    }
    console.log(`\n   categories sum to ${inr(tot)}   published total ${inr(PUBLISHED_TOTAL_BIDFOR)}   ${tot === PUBLISHED_TOTAL_BIDFOR ? 'MATCH' : '*** MISMATCH'}`);
    console.log('\n   NOT touched, and deliberately: bidCount / applicationsSubscribed.');
    console.log('   The published table carries no application counts, and our BSE');
    console.log('   bid counts are back-solved from NSE anyway. Inventing them would');
    console.log('   be worse than leaving figures that are honestly short.');
    /* `useLiveIpo()` (2026-10-21) makes the detail page's Live Subscription
       section re-fetch on mount, and /subscription + /subscription/v2 always
       did — so the PANELS correct themselves with no deploy. The detail page's
       hero KPI tiles are still rendered from the BAKED record, so a web
       rebuild is what makes every surface agree. Not urgent; not optional. */
    console.log('\n   Panels correct themselves (useLiveIpo + the hubs re-fetch).');
    console.log('   The detail page HERO TILES are baked — rebuild the web to make them agree.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
