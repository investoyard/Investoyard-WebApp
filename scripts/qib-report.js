#!/usr/bin/env node
/**
 * READ-ONLY — our stored QIB book in the shape the exchange's own page prints
 * it, so the two can be compared without re-deriving the basis question.
 *
 *   node scripts/qib-report.js JPL
 *   node scripts/qib-report.js                 # every issue open today
 *
 * WHY IT EXISTS. On 2026-10-23 the operator reported our QIB book reading
 * ~16,000 Cr below NSE's page, and answering it took four separate probes:
 * our stored columns, NSE catwise, BSE demandschedule, and the reservation
 * record. Every one of those questions is answered here in one command.
 *
 * THREE THINGS IT DELIBERATELY PRINTS SIDE BY SIDE, because each has produced
 * a wrong conclusion in this project before:
 *
 *  1. THE PER-EXCHANGE HALVES. A disagreement with the exchange's page is
 *     almost always attributable to ONE exchange, and a combined total hides
 *     which. NSE's catwise moves every tick; BSE's demand schedule does not
 *     necessarily.
 *
 *  2. BOTH TIMES BASES. The poller STORES `demand / GROSS offered` and the
 *     page DISPLAYS `demand / NET book` (anchor deducted). A QIB row can
 *     legitimately store 0.04 and render 0.11x. Reading one against the other
 *     is the single most repeated mistake in this area of the codebase, so
 *     both are printed and labelled rather than left to be worked out.
 *
 *  3. THE AS-OF STAMP. It is one timestamp over two feeds, so it reports when
 *     we last WROTE, not how current each half is.
 *
 * Writes NOTHING.
 */
process.chdir(require('path').join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');

const inr = (n) => Number(n || 0).toLocaleString('en-IN');
const cr = (n) => (Number(n || 0) / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const SPLIT_LINE = { fii: 'FIIs', dii: 'DIIs', mf: 'Mutual funds', oth: 'Others' };

(async () => {
  const prisma = new PrismaClient();
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

    for (const symbol of symbols) {
      const ipo = await prisma.ipo.findFirst({
        where: { symbol },
        select: { id: true, symbol: true, name: true, priceBandMin: true, priceBandMax: true, subscriptionAsOf: true, extra: true },
      });
      if (!ipo) { console.log(`\n===== ${symbol} =====\n  not in the catalogue`); continue; }
      const e = ipo.extra || {};
      const price = Number(ipo.priceBandMax ?? ipo.priceBandMin ?? 0) || 0;

      console.log(`\n===== ${ipo.symbol} =====`);
      console.log(`  as of   ${ipo.subscriptionAsOf ? ipo.subscriptionAsOf.toISOString() : '(never polled)'}`);
      console.log('          ^ ONE stamp over TWO feeds - when we last wrote, not how current each half is');

      const qib = await prisma.ipoSubscription.findFirst({
        where: { ipoId: ipo.id, category: 'qib' },
        select: { nseShares: true, bseShares: true, nseBids: true, bseBids: true, timesSubscribed: true, bidCount: true, asOf: true },
      });
      if (!qib) { console.log('  no stored qib row'); continue; }

      const nse = Number(qib.nseShares || 0);
      const bse = Number(qib.bseShares || 0);
      const tot = nse + bse;

      console.log('\n  demand, by exchange');
      console.log('    NSE  ' + inr(nse).padStart(18) + '   Rs ' + cr(nse * price).padStart(10) + ' Cr');
      console.log('    BSE  ' + inr(bse).padStart(18) + '   Rs ' + cr(bse * price).padStart(10) + ' Cr');
      console.log('    tot  ' + inr(tot).padStart(18) + '   Rs ' + cr(tot * price).padStart(10) + ' Cr');

      const split = e.qibSplit || {};
      if (Object.keys(split).length) {
        console.log('\n  the four lines the exchange pages print (consolidated)');
        let sum = 0;
        for (const k of ['fii', 'dii', 'mf', 'oth']) {
          const sh = Number(split[k] && split[k].sh ? split[k].sh : 0);
          sum += sh;
          console.log('    ' + SPLIT_LINE[k].padEnd(14) + inr(sh).padStart(18) + '   Rs ' + cr(sh * price).padStart(10) + ' Cr');
        }
        console.log('    ' + 'sum'.padEnd(14) + inr(sum).padStart(18) +
          (sum === tot ? '   = the total above' : '   *** DOES NOT EQUAL THE TOTAL (' + inr(sum - tot) + ')'));
      } else {
        console.log('\n  no extra.qibSplit stored (nothing polled since the split shipped, or no QIB demand)');
      }

      /* Both bases, labelled. The gross book is what the poller divides by;
         the net book after anchor is what every surface displays and what the
         exchange's own times is against. */
      const resv = (e.shareResv || {}).qib || {};
      const grossBook = Number(resv.sharesUpper || 0) || 0;
      const anchorSh = Number(e.anchorShares || 0);
      const anchorPct = Number(e.anchorPct || 0);
      const deduct = anchorSh > 0 ? anchorSh : (anchorPct > 0 ? Math.round((grossBook * anchorPct) / 100) : 0);
      const basis = anchorSh > 0 ? 'actual' : (anchorPct > 0 ? 'ESTIMATED from anchorPct' : 'none');
      const netBook = deduct > 0 && deduct < grossBook ? grossBook - deduct : grossBook;

      console.log('\n  book size and times - TWO BASES, do not read one against the other');
      console.log('    gross QIB book        ' + inr(grossBook).padStart(18));
      console.log('    anchor deducted       ' + inr(deduct).padStart(18) + '   (' + basis + ')');
      console.log('    net book (displayed)  ' + inr(netBook).padStart(18));
      if (grossBook > 0) console.log('    times / GROSS  (stored by the poller) ' + (tot / grossBook).toFixed(2) + 'x   stored col ' + String(qib.timesSubscribed));
      if (netBook > 0) console.log('    times / NET    (shown on every page)  ' + (tot / netBook).toFixed(2) + 'x');
      console.log('\n    An exchange page quoting a times against its own net book is the');
      console.log('    SECOND figure. The stored column is the first. They differ by the');
      console.log('    anchor ratio and neither is wrong.');
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
