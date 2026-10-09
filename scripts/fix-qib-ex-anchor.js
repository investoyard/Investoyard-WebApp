/**
 * Put the FULL QIB quota back in the QIB reservation row, where nine records
 * hold the EX-ANCHOR figure instead.
 *
 * DRY RUN BY DEFAULT — pass --apply to write. --only SYM narrows.
 *
 * WHAT IS WRONG. The reservation table holds the OFFERED reservation: QIB's row
 * is the whole QIB quota, and the anchor portion is a SUB-ALLOCATION of it,
 * deducted downstream — in the Anchor panel, and by `subscriptionTable` when it
 * builds Book Size. On these nine the row carries QIB *net of* the anchor, so
 * the table is short by exactly the anchor and the anchor is then deducted a
 * second time.
 *
 * It was reported as "our total does not match the total issue size" against
 * IPOPremium's RKFAL page, and once the legend began reconciling to the issue
 * size (2026-10-09) it became measurable: 17 records do not reconcile and
 * TWELVE of them are this one fault. It also explains why the shortfall came in
 * two apparent tiers — about 28% and about 11%. It is ONE fault: a 60% anchor
 * off a 50% QIB loses 30% of the issue, off a 20% QIB it loses 12%.
 *
 * THE CONSEQUENCE IS LIVE, not cosmetic. SAIURJA has real subscription data and
 * its page showed QIB Book Size 3,92,400 against a true 9,79,200 — so QIB read
 * 2.80x where the truth is 1.12x, overstating institutional demand 2.5-fold.
 * `subscriptionTable`'s `deduct < book` guard is the only reason it did not go
 * negative; instead it silently skipped the deduction and labelled the
 * post-anchor figure "Gross".
 *
 * WHY THIS IS ARITHMETIC AND NOT A GUESS. A record is repaired only when FOUR
 * independent things hold at once, every one of them checked below:
 *
 *   1. the table is short of the issue size by EXACTLY `extra.anchorShares`
 *   2. adding the anchor back to QIB reconciles the table to the issue size
 *      exactly — sum(split rows) + carve-outs == total offer shares
 *   3. the reconstructed QIB is LOT-ALIGNED to the share. ROBOKIDZ is why this
 *      earns its place: its stale `sharesLower` of 13,66,400 is 1138.67 lots
 *      while the reconstruction is 1151 lots exactly, and that is what settles
 *      which of the two figures is real.
 *   4. the anchor is then 59.93-59.98% of the reconstructed QIB — just under
 *      B09's 60% cap, which is what a real anchor book looks like and is not
 *      something a wrong denominator would produce.
 *
 * Measured before this was written: all nine satisfy all four, and the
 * reconstructed QIB lands at a legal ICDR share of the net offer (about 49.9%
 * on seven, 20.0% on HIMALAYAN and AXIOMGAS — SME QIB is a ceiling, not a
 * floor).
 *
 * --infer-anchor HANDLES THE THREE WITH NO STORED ANCHOR — BLACKOPAL, EIMS and
 * VANS — by taking the shortfall itself as the anchor. That loses witness (1),
 * the only one that reads a figure a human entered, so the rest have to carry
 * the decision alone and TWO MORE ARE ADDED:
 *
 *   5. all four of qib/hni/hni2/retail must ALREADY carry a count — the table
 *      is complete apart from QIB. This is what tells "QIB is net of the
 *      anchor" apart from "the table was never finished", and it is why
 *      PRIORITY cannot be touched: only its QIB row was ever entered, so
 *      inferring would double QIB and declare the table done.
 *   6. the implied anchor must be 25-60% of the reconstructed QIB. Sixteen
 *      records are short with no anchor figure and FOURTEEN are short by 1-679
 *      shares — rounding, not an anchor.
 *
 * ...and the QIB ceiling is checked against 75%, the highest ICDR allows under
 * 6(2), rather than 50%: MVELECTRO is a legitimate 75% record, so a 50% ceiling
 * would be a rule about one regulation basis dressed up as a rule about
 * legality. PRIORITY's implied QIB is 100% of the net offer and fails either.
 *
 * MEASURED CATALOGUE-WIDE BEFORE THIS WAS IMPLEMENTED: exactly those three
 * fire. ANNU is the record the set exists for — its implied QIB is a
 * plausible-looking 20.00% of the net offer and would have passed on percentage
 * alone; LOT ALIGNMENT is the single guard that stops it, at 23,422.82 lots.
 *
 * `anchorShares` IS NOT WRITTEN, not even under --infer-anchor. The QIB count is
 * FORCED by reconciliation and lot alignment; the anchor is the INFERRED part,
 * and storing it would make the page print "Net (post anchor) · actual" — a
 * label this codebase reserves for an allotment read off the intimation letter,
 * which a reader can check against the exchange. These three go on saying
 * "Gross", which is the honest statement of what is known about them.
 *
 * `sharesLower` TOO, BUT ONLY ON A SHARE-SIZED OFFER, where the count does not
 * move with the price and the two bands must therefore be equal. SAIURJA is the
 * corroboration: its `sharesLower` ALREADY holds 9,79,200, the exact
 * reconstruction, so on that record the operator put the full quota in one band
 * and the published "QIB (Ex. Anchor)" figure in the other.
 *
 * `source` STAYS `operator` — deliberately, and this is not cosmetic. A
 * `derived` row is one `refill-derived-reservation.js` may overwrite from the
 * percentages, and these records have no percentages at all, so restamping
 * would hand a later refill licence to zero the figure this script restored.
 *
 * The write is a surgical `jsonb_set` of one leaf, never a read-modify-write of
 * `extra` — the poller owns that column on a live issue. All nine closed long
 * ago, but the rule does not depend on that. Each record is re-read after
 * writing and its `extra` key count checked, because a script that reports
 * success has only proved it issued the write.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const st = require('@investoyard/shared-types');
const p = new PrismaClient();

const APPLY = process.argv.includes('--apply');
/** Take the shortfall itself as the anchor, for a record that stores none.
 *  Two extra guards apply — see the docblock. */
const INFER = process.argv.includes('--infer-anchor');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const BACKUP_DIR = 'C:/ProgramData/Investoyard/backups';

const SPLIT = ['qib', 'hni', 'hni2', 'retail', 'other'];
/** The four that a complete table always fills. `other` is not one of them. */
const CORE = ['qib', 'hni', 'hni2', 'retail'];
const CARVEOUTS = ['employee', 'shareholder', 'policyholder', 'marketmaker'];
const fn = (v) => { const x = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };
const inr = (n) => n.toLocaleString('en-IN');

/** The offer source, shaped as the admin form's `offerSourceOf` shapes it. */
const offerSourceOf = (ipo, ex) => ({
  fresh: { basis: (ex.fresh || {}).basis ?? 'none', value: (ex.fresh || {}).value ?? '' },
  ofs: { basis: (ex.ofs || {}).basis ?? 'none', value: (ex.ofs || {}).value ?? '' },
  issueSizeCr: ex.issueSizeCr ?? Number(ipo.issueSize) / 1e7,
  totalShares: ex.totalShares,
  carveouts: ex.carveouts,
  carveoutBasis: ex.carveoutBasis,
  employeeDiscount: ex.employeeDiscount,
  shareholderDiscount: ex.shareholderDiscount,
  policyholderDiscount: ex.policyholderDiscount,
});

/** Is every PRICED leg quoted in shares? Then the count does not move with the
 *  price, and the two band columns must carry the same figure. */
const isSharesSized = (ex) => {
  const bases = ['fresh', 'ofs'].map((k) => (ex[k] || {}).basis).filter((b) => b && b !== 'none');
  return bases.length > 0 && bases.every((b) => b === 'shares');
};

const carveoutShares = (ex, price) => CARVEOUTS.reduce((a, k) => a + st.carveoutAt(k, {
  carveouts: ex.carveouts,
  carveoutBasis: ex.carveoutBasis,
  employeeDiscount: ex.employeeDiscount,
  shareholderDiscount: ex.shareholderDiscount,
  policyholderDiscount: ex.policyholderDiscount,
}, price).shares, 0);

(async () => {
  console.log(APPLY ? 'APPLYING\n' : 'DRY RUN — pass --apply to write\n');

  const where = { hidden: false };
  if (ONLY) where.symbol = ONLY;
  const ipos = await p.ipo.findMany({ where });

  const plan = [];
  const refused = [];

  for (const ipo of ipos) {
    const ex = ipo.extra || {};
    const sr = ex.shareResv || {};
    const qibRow = sr.qib;
    const stated = fn(ex.anchorShares);
    const qib = fn(qibRow && qibRow.sharesUpper);
    if (!qibRow || qib <= 0) continue;
    if (stated <= 0 && !INFER) continue;

    const price = Number(ipo.priceBandMax) || Number(ipo.priceBandMin);
    if (!(price > 0)) continue;
    const totals = st.offerTotals(offerSourceOf(ipo, ex), price, Number(ipo.priceBandMin));
    if (!(totals.totalCap > 0)) continue;

    const splitSum = SPLIT.reduce((a, k) => a + fn(sr[k] && sr[k].sharesUpper), 0);
    const cvSum = carveoutShares(ex, price);
    const shortBy = totals.totalCap - splitSum - cvSum;
    if (shortBy <= 0) continue;                 // not short — not this fault

    /* INFERRED mode takes the shortfall as the anchor; otherwise the stored
       figure is the anchor and the shortfall has to equal it. */
    const inferred = stated <= 0;
    const anchor = inferred ? shortBy : stated;
    const full = qib + anchor;
    const lot = Number(ipo.lotSize) || 0;
    const after = splitSum - qib + full + cvSum;
    const anchorPctOfQib = full > 0 ? (anchor / full) * 100 : 0;
    const pctOfNet = totals.cap > 0 ? (full / totals.cap) * 100 : 0;

    const guards = {
      shortIsAnchor: Math.abs(shortBy - anchor) <= 2,
      reconciles: Math.abs(totals.totalCap - after) <= 2,
      lotAligned: lot > 0 && full % lot === 0,
      anchorUnderCap: full > 0 && anchorPctOfQib <= 60.001,
    };
    if (inferred) {
      /* Witness (1) is gone — `shortIsAnchor` is true by construction here, so
         it proves nothing. These three carry the decision instead. */
      guards.allFourRows = CORE.every((k) => fn(sr[k] && sr[k].sharesUpper) > 0);
      guards.anchorSubstantial = anchorPctOfQib >= 25;
      /* 75% is ICDR 6(2)'s ceiling, the highest the regulation allows. */
      guards.qibLegal = totals.cap > 0 && pctOfNet <= 75.001;
    }
    const row = {
      symbol: ipo.symbol, id: ipo.id, lot, price, inferred,
      issueSizeShares: totals.totalCap, netOffer: totals.cap,
      qibBefore: qib, anchor, qibAfter: full,
      lowerBefore: fn(qibRow.sharesLower),
      sharesSized: isSharesSized(ex),
      pctOfNet, anchorPctOfQib, shortBy, guards,
    };
    (Object.values(guards).every(Boolean) ? plan : refused).push(row);
  }

  const w = (s, n) => String(s).padStart(n);
  console.log(APPLY ? '' : (INFER ? '--infer-anchor: the shortfall is taken as the anchor where none is stored\n' : ''));
  console.log('symbol        QIB before      + anchor  =   QIB after    lots    % of net   anchor % QIB   anchor     lower band');
  for (const r of plan) {
    const lower = r.sharesSized
      ? (r.lowerBefore === r.qibAfter ? 'already right' : `${inr(r.lowerBefore)} -> ${inr(r.qibAfter)}`)
      : 'untouched (Rs-sized)';
    console.log(`${r.symbol.padEnd(12)} ${w(inr(r.qibBefore), 11)}  ${w(inr(r.anchor), 11)}  ${w(inr(r.qibAfter), 11)}  ${w(r.qibAfter / r.lot, 6)}  ${w(r.pctOfNet.toFixed(4), 9)}  ${w(r.anchorPctOfQib.toFixed(2), 12)}   ${r.inferred ? 'INFERRED' : 'stored  '}   ${lower}`);
  }
  const inf = plan.filter((r) => r.inferred).length;
  console.log(`\n${plan.length} record(s) to repair${inf ? ` — ${inf} with an INFERRED anchor, which is NOT written to the record` : ''}`);

  if (refused.length) {
    console.log('\nREFUSED — the same shape, but a guard did not hold, so a human decides:');
    for (const r of refused) {
      const failed = Object.entries(r.guards).filter(([, v]) => !v).map(([k]) => k).join(', ');
      console.log(`  ${r.symbol.padEnd(12)} short by ${inr(r.shortBy)}, anchor ${inr(r.anchor)} — failed: ${failed}`);
    }
  }

  if (!APPLY) { await p.$disconnect(); return; }
  if (!plan.length) { console.log('nothing to do'); await p.$disconnect(); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const file = path.join(BACKUP_DIR, `qib-ex-anchor-${stamp}.json`);
  const snapshot = [];
  for (const r of plan) {
    const cur = await p.ipo.findUnique({ where: { id: r.id }, select: { symbol: true, extra: true } });
    snapshot.push({ symbol: cur.symbol, qibRow: (cur.extra.shareResv || {}).qib, anchorShares: cur.extra.anchorShares, plan: r });
  }
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`\nbackup written: ${file}\n`);

  let verified = 0;
  for (const r of plan) {
    const pre = await p.ipo.findUnique({ where: { id: r.id }, select: { extra: true } });
    const keysBefore = Object.keys(pre.extra || {}).length;

    /* One leaf at a time. Values are stored as STRINGS in this column, so write
       JSON strings to keep the type as the form wrote it. */
    await p.$executeRawUnsafe(
      `UPDATE "Ipo" SET extra = jsonb_set(extra, '{shareResv,qib,sharesUpper}', $1::jsonb) WHERE id = $2`,
      JSON.stringify(String(r.qibAfter)), r.id,
    );
    if (r.sharesSized && r.lowerBefore !== r.qibAfter) {
      await p.$executeRawUnsafe(
        `UPDATE "Ipo" SET extra = jsonb_set(extra, '{shareResv,qib,sharesLower}', $1::jsonb) WHERE id = $2`,
        JSON.stringify(String(r.qibAfter)), r.id,
      );
    }

    /* Re-read. Issuing a write is not the same as the write landing. */
    const post = await p.ipo.findUnique({ where: { id: r.id }, select: { symbol: true, extra: true } });
    const row = (post.extra.shareResv || {}).qib || {};
    const keysAfter = Object.keys(post.extra || {}).length;
    const checks = {
      upper: fn(row.sharesUpper) === r.qibAfter,
      lower: !r.sharesSized || fn(row.sharesLower) === r.qibAfter,
      source: row.source === 'operator',
      extraKeys: keysAfter === keysBefore,
    };
    const good = Object.values(checks).every(Boolean);
    if (good) verified++;
    const why = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join('/');
    console.log(`  ${post.symbol.padEnd(12)} upper=${inr(fn(row.sharesUpper))} lower=${inr(fn(row.sharesLower))} source=${row.source} extraKeys ${keysBefore}->${keysAfter}  ${good ? 'OK' : 'CHECK — ' + why}`);
  }
  console.log(`\n${verified} of ${plan.length} verified after re-read.`);
  await p.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await p.$disconnect(); process.exit(1); });
