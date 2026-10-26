#!/usr/bin/env node
/**
 * READ-ONLY — proves that EVERY category both exchanges send is counted in the
 * subscription we store, and names any row that is not.
 *
 *   node scripts/verify-feed-coverage.js JPL
 *   node scripts/verify-feed-coverage.js            # every issue open today
 *
 * WHY IT EXISTS (operator ask, 2026-10-23: "check BSE & NSE API all Category
 * calculate for subscription bcoz IC category not shows in demand"). There are
 * TWO different questions behind that and they have different answers:
 *
 *   1. IS THE ROW COUNTED?  `bucketNse` / `bucketBse` return NULL for a code
 *      they do not recognise and the caller then adds NOTHING — so an
 *      unrecognised CATEGORY is dropped from the total silently. That is
 *      invisible from our own data, because the stored rows stay internally
 *      consistent; it is only visible against the raw feed. Any row this
 *      prints as DROPPED is demand the exchange reported and we are not
 *      counting.
 *
 *   2. IS THE ROW SHOWN?  A counted row need not have a line of its own. The
 *      QIB breakdown folds FI + IC into ONE "DIIs" line, which is why five
 *      exchange codes print as four. So "IC does not appear" is the expected
 *      rendering of a figure that IS in the total — this script prints the
 *      fold so the two questions can be told apart.
 *
 * It reconciles per BUCKET against the stored IpoSubscription rows, not just
 * QIB: a coverage claim about one category says nothing about the other six.
 *
 * Writes NOTHING. Runs from apps/api/dist so the vault key resolves (the NSE
 * credential is sealed under the key that lives there).
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');
const { PiiVaultService } = require('../apps/api/dist/common/pii-vault.service.js');
const RA = require('../packages/rail-adapters/dist/index.js');

/* Verbatim copies of the poller's own maps (subscription.service.ts). Copied
   rather than imported because the service pulls in Prisma's Decimal and the
   whole Nest graph. Any drift between these and production would itself be a
   finding — diff them if this ever disagrees with the stored rows. */
function bucketNse(cat) {
  const c = String(cat || '').toUpperCase();
  if (c === 'QIB') return 'qib';
  if (c === 'NIBBT') return 'hni2';
  if (c === 'NIBAT') return 'hni';
  if (['NIB', 'NII', 'HNI', 'SNII', 'BNII'].includes(c)) return 'hni';
  if (['INDIV', 'RETAIL', 'IND', 'RII'].includes(c)) return 'retail';
  if (['EMPRET', 'EMP', 'EMPLOYEE', 'EMPL'].includes(c)) return 'employee';
  if (c === 'SHARET' || c === 'SHA') return 'shareholder';
  if (c === 'POLRET' || c === 'POL') return 'policyholder';
  return null;
}
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
const SPLIT_LINE = { fii: 'FIIs', dii: 'DIIs', mf: 'Mutual funds', oth: 'Others' };
/* An unrecognised SUB-code lands in Others rather than being dropped — the
   sub-rows must still sum to the QIB total. Note the asymmetry with the
   CATEGORY maps above, which drop. That asymmetry is the whole point of (1). */
const qibSubKey = (code) => QIB_SUB[String(code || '').toUpperCase()] || 'oth';

const inr = (n) => Number(n || 0).toLocaleString('en-IN');

async function cred(prisma, exchange) {
  const vault = new PiiVaultService();
  const row =
    (await prisma.memberCredential.findFirst({ where: { exchange, active: true, subscriptionUse: true } })) ||
    (await prisma.memberCredential.findFirst({ where: { exchange, active: true } }));
  if (!row) throw new Error(`no active ${exchange} credential`);
  return {
    exchange: row.exchange, memberName: row.memberName, loginId: row.loginId,
    memberCode: row.memberCode, password: await vault.resolve(row.passwordRef),
    ibbsId: row.ibbsIdRef ? await vault.resolve(row.ibbsIdRef) : undefined,
    checksumKey: row.checksumKeyRef ? await vault.resolve(row.checksumKeyRef) : undefined,
    subBrokerCode: row.subBrokerCode ?? undefined, baseUrl: row.baseUrl, env: row.env,
  };
}

(async () => {
  const prisma = new PrismaClient();
  let bad = 0;
  try {
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

    const nseCred = await cred(prisma, 'NSE_EIPO');
    const bseCred = await cred(prisma, 'BSE_IBBS');
    const nseQ = new RA.NseQueryAdapter();
    const bseQ = new RA.BseQueryAdapter();
    let bseToken = null;
    try { bseToken = await bseQ.login(bseCred); }
    catch (e) { console.log(`BSE login failed: ${e && e.message} — BSE side will be skipped`); }

    for (const symbol of symbols) {
      console.log(`\n===== ${symbol} =====`);
      let nseRows = [], bseRows = [];
      try { nseRows = await nseQ.getCatwise(symbol, nseCred); }
      catch (e) { console.log(`  NSE catwise failed: ${e && e.message}`); }
      if (bseToken) {
        try { bseRows = await bseQ.getDemandSchedule(symbol, bseToken, bseCred); }
        catch (e) { console.log(`  BSE demandschedule failed: ${e && e.message}`); }
      }
      if (!nseRows.length && !bseRows.length) { console.log('  no rows from either feed'); continue; }

      /* ---- 1. coverage: does every row land in a bucket? ---- */
      const per = new Map();            // bucket -> { nse, bse }
      const split = new Map();          // qib split key -> shares
      const dropped = [];
      const add = (b, side, q) => {
        let v = per.get(b);
        if (!v) { v = { nse: 0, bse: 0 }; per.set(b, v); }
        v[side] += q || 0;
      };
      for (const r of nseRows) {
        const b = bucketNse(r.category);
        if (!b) { dropped.push({ side: 'NSE', cat: r.category, sub: r.subCategory, q: r.quantity }); continue; }
        add(b, 'nse', r.quantity);
        if (b === 'qib') {
          const k = qibSubKey(r.subCategory);
          split.set(k, (split.get(k) || 0) + (r.quantity || 0));
        }
      }
      for (const r of bseRows) {
        const b = bucketBse(r.category, r.subCategory);
        if (!b) { dropped.push({ side: 'BSE', cat: r.category, sub: r.subCategory, q: r.quantity }); continue; }
        add(b, 'bse', r.quantity);
        if (b === 'qib') {
          const k = qibSubKey(r.category);
          split.set(k, (split.get(k) || 0) + (r.quantity || 0));
        }
      }

      console.log(`  rows: NSE ${nseRows.length}  BSE ${bseRows.length}`);
      if (dropped.length) {
        bad++;
        console.log(`\n  *** ${dropped.length} ROW(S) DROPPED — not counted anywhere:`);
        for (const d of dropped) {
          console.log(`        ${d.side}  category=${d.cat}  subCategory=${d.sub || '-'}  qty=${inr(d.q)}`);
        }
      } else {
        console.log('  coverage: every row from both feeds lands in a bucket');
      }

      /* ---- 2. reconcile EVERY bucket against what we stored ---- */
      const ipo = await prisma.ipo.findFirst({ where: { symbol }, select: { id: true } });
      const stored = ipo
        ? await prisma.ipoSubscription.findMany({
            where: { ipoId: ipo.id },
            select: { category: true, nseShares: true, bseShares: true },
          })
        : [];
      const storedBy = new Map(stored.map((s) => [s.category, s]));

      console.log('\n  per bucket: feed now  vs  stored');
      console.log('    bucket            NSE feed        NSE stored        BSE feed        BSE stored');
      const keys = [...new Set([...per.keys(), ...storedBy.keys()])]
        .filter((k) => k !== 'nii' && k !== 'total')   // synthetic roll-ups, not fed by the exchange
        .sort();
      for (const k of keys) {
        const f = per.get(k) || { nse: 0, bse: 0 };
        const s = storedBy.get(k);
        const sn = Number(s?.nseShares || 0);
        const sb = Number(s?.bseShares || 0);
        const mark = !s ? '  <- NOT STORED' : (sn === f.nse && sb === f.bse ? '' : '  <- differs (feed may have moved since the last poll)');
        console.log(
          '    ' + k.padEnd(14) + inr(f.nse).padStart(16) + inr(sn).padStart(18) +
          inr(f.bse).padStart(16) + inr(sb).padStart(18) + mark,
        );
      }

      /* ---- 3. the fold: counted but not shown on a line of its own ---- */
      if (split.size) {
        console.log('\n  QIB breakdown — FIVE exchange codes fold into FOUR printed lines:');
        console.log('    FII -> FIIs   MF -> Mutual funds   FI + IC -> DIIs   OTH -> Others');
        let sum = 0;
        for (const k of ['fii', 'dii', 'mf', 'oth']) {
          const q = split.get(k) || 0;
          sum += q;
          console.log('    ' + SPLIT_LINE[k].padEnd(14) + inr(q).padStart(18));
        }
        const qibFeed = (per.get('qib') || { nse: 0, bse: 0 });
        const qibTot = qibFeed.nse + qibFeed.bse;
        console.log('    ' + 'sum'.padEnd(14) + inr(sum).padStart(18) +
          (sum === qibTot ? '   = the qib bucket above (a PARTITION, nothing added or lost)'
                          : '   *** DOES NOT EQUAL the qib bucket (' + inr(sum - qibTot) + ')'));
        if (sum !== qibTot) bad++;

        /* Name the codes that have no line of their own, so "X does not show"
           can be answered without re-deriving the mapping each time. */
        const ic = [...nseRows, ...bseRows].filter((r) => {
          const code = bucketNse(r.category) === 'qib' ? r.subCategory : r.category;
          return String(code || '').toUpperCase() === 'IC';
        });
        if (ic.length) {
          const icTot = ic.reduce((a, r) => a + (r.quantity || 0), 0);
          console.log(`\n    IC (insurance companies) = ${inr(icTot)} — COUNTED, inside the DIIs line above.`);
        }
      }
    }

    console.log(bad ? `\n*** ${bad} problem(s) found` : '\nno coverage problems found');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
