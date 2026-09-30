#!/usr/bin/env node
/**
 * Re-derive the `derived` reservation counts for an IPO, exactly as opening and
 * saving the admin form would.
 *
 * WHY THIS EXISTS ALONGSIDE `normalise-reservation-shares.js`. That script
 * predates carve-outs (2026-09-25) and divides the GROSS offer, so re-running
 * it is what produces the very staleness this repairs. ROBOKIDZ's stored counts
 * were the gross ones — confirmed from the other side, because the poller's own
 * denominators back-solve to them to the share (QIB book 13,66,763 against a
 * stored 13,66,800) — so its ₹2 Cr market-maker reservation was being offered
 * to QIB, NII and Retail as well as to the market maker.
 *
 * It reproduces `offerTotalsOf()` + `derivedCountAt()` from `IpoForm.tsx`
 * verbatim: legs → ₹ total → share total (carve-out rupees out, rest at the
 * band price, carve-out shares back) → NET of carve-outs → `round(pct × net)`.
 * Keep the two in step; the form is the authority.
 *
 * PROVENANCE IS RESPECTED: only rows carrying `source: 'derived'` are touched.
 * An `exchange` or `operator` count is the document's figure and outranks any
 * derivation — there is no `--force`, because a stale derived row is a bug and
 * a stored document figure is not.
 *
 * The write is a jsonb MERGE, not a read-modify-write: the poller rewrites this
 * column every 60s (every 5s after 15:30) on a live issue, and a Prisma
 * `update({ data: { extra } })` sends the whole object back.
 *
 *   node scripts/refill-derived-reservation.js --only ROBOKIDZ          # dry run
 *   node scripts/refill-derived-reservation.js --only ROBOKIDZ --apply
 */
const { PrismaClient } = require('@prisma/client');
// The ONE resolver, shared with the admin form. It lived in `IpoForm.tsx`, was
// copied in here, and the copy is exactly how a wrong floor band survives in
// two places — see `offerTotals.ts`.
const { offerTotals } = require('../packages/shared-types/dist/index.js');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null; })();

/** Loose numeric read — the form's inputs strip punctuation, a paste does not. */
const fnum = (v) => { const x = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };

/** The rows the carve-out OWNS — their count comes off the top, never from a pct. */
const CARVEOUT_ROWS = ['employee', 'shareholder'];

/** A stored record in the shape `offerTotals()` reads. */
const offerSourceOf = (extra) => ({
  fresh: extra.fresh,
  ofs: extra.ofs,
  issueSizeCr: extra.issueSizeCr,
  totalShares: extra.totalShares,
  carveouts: extra.carveouts,
  carveoutBasis: extra.carveoutBasis,
  employeeDiscount: extra.employeeDiscount,
  shareholderDiscount: extra.shareholderDiscount,
});

const derivedCountAt = (total, pct) => Math.round((total * pct) / 100);

const fmt = (n) => Number(n).toLocaleString('en-IN');

(async () => {
  const where = { extra: { not: null } };
  if (ONLY) where.symbol = ONLY.toUpperCase();
  const ipos = await prisma.ipo.findMany({
    where,
    select: { id: true, symbol: true, priceBandMin: true, priceBandMax: true, lotSize: true, extra: true },
    orderBy: { symbol: 'asc' },
  });
  if (!ipos.length) { console.log('No IPO matched.'); return; }

  let changed = 0;
  for (const ipo of ipos) {
    const extra = ipo.extra || {};
    const resv = extra.shareResv;
    if (!resv || typeof resv !== 'object') continue;
    const pMax = Number(ipo.priceBandMax) || Number(ipo.priceBandMin) || 0;
    const pMin = Number(ipo.priceBandMin) || pMax;
    const totals = offerTotals(offerSourceOf(extra), pMax, pMin);
    if (!(totals.cap > 0)) { if (ONLY) console.log(`${ipo.symbol}: no usable offer total — skipped.`); continue; }

    const patch = {};
    const lines = [];
    const next = {};
    for (const [key, row] of Object.entries(resv)) {
      if (!row || typeof row !== 'object') continue;
      // A carve-out row's count is not a percentage of anything.
      if (CARVEOUT_ROWS.includes(key)) continue;
      const pct = fnum(row.pct);
      if (!(pct > 0)) continue;
      if (row.source !== 'derived') { lines.push(`    ${key.padEnd(7)} source=${row.source || '(none)'} — left alone`); continue; }
      const upper = derivedCountAt(totals.cap, pct);
      const lower = derivedCountAt(totals.floor, pct);
      const wasU = fnum(row.sharesUpper), wasL = fnum(row.sharesLower);
      if (wasU === upper && wasL === lower) continue;
      next[key] = { ...row, sharesUpper: String(upper), sharesLower: String(lower) };
      lines.push(`    ${key.padEnd(7)} ${pct}%  upper ${fmt(wasU)} -> ${fmt(upper)}   lower ${fmt(wasL)} -> ${fmt(lower)}`);
    }

    // The form persists the derived total so the public page, computeIssue and
    // Autofill all divide ONE number. A typed count is never touched.
    const statedTyped = fnum(extra.totalShares) > 0;
    if (!statedTyped && totals.totalCap > 0) {
      patch.totalShares = String(totals.totalCap);
      patch.totalSharesSource = 'derived';
      lines.push(`    totalShares (blank) -> ${fmt(totals.totalCap)}  [derived]`);
    }
    if (!Object.keys(next).length && !Object.keys(patch).length) continue;
    if (Object.keys(next).length) patch.shareResv = { ...resv, ...next };

    changed++;
    console.log(`${ipo.symbol}  band ₹${pMin}–₹${pMax}  net offer ${fmt(totals.cap)} of ${fmt(totals.totalCap)} (carve-out ${fmt(totals.totalCap - totals.cap)})`);
    lines.forEach((l) => console.log(l));

    if (APPLY) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
        JSON.stringify(patch), ipo.id,
      );
      console.log('    written (jsonb merge)');
    }
  }
  console.log(`\n${changed} IPO(s) ${APPLY ? 'updated' : 'would change'}.${APPLY ? '' : '  Re-run with --apply to write.'}`);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
