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

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null; })();

/** Loose numeric read — the form's inputs strip punctuation, a paste does not. */
const fnum = (v) => { const x = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };

const CARVEOUT_KEYS = ['employee', 'shareholder', 'marketmaker'];
/** The rows the carve-out OWNS — their count comes off the top, never from a pct. */
const CARVEOUT_ROWS = ['employee', 'shareholder'];

/** Fresh + OFS in ₹ Cr. A leg may be stated in shares, hence the price. */
function legSumCr(extra, price) {
  const leg = (l) => {
    if (!l || l.basis === 'none') return 0;
    if (l.basis === 'amount') return fnum(l.value);
    return price ? (fnum(l.value) * price) / 1e7 : 0;
  };
  const sum = leg(extra.fresh) + leg(extra.ofs);
  return sum > 0 ? sum : 0;
}

/** ONE carve-out at a price — shares AND rupees, which a discount makes disagree. */
function carveoutOneAt(extra, key, price) {
  if (!(price > 0)) return { shares: 0, rupees: 0 };
  const v = fnum((extra.carveouts || {})[key]);
  if (v <= 0) return { shares: 0, rupees: 0 };
  const basis = ((extra.carveoutBasis || {})[key]) ?? 'amount'; // legacy default
  const discount = key === 'employee' ? extra.employeeDiscount
    : key === 'shareholder' ? extra.shareholderDiscount : '';
  const p = price - fnum(discount);
  const at = p > 0 ? p : price;
  if (basis === 'shares') { const s = Math.round(v); return { shares: s, rupees: s * at }; }
  const r = v * 1e7;
  return { shares: Math.round(r / at), rupees: r };
}

const carveoutAt = (extra, price) => CARVEOUT_KEYS.reduce((a, k) => {
  const c = carveoutOneAt(extra, k, price);
  return { shares: a.shares + c.shares, rupees: a.rupees + c.rupees };
}, { shares: 0, rupees: 0 });

/**
 * The offer total in SHARES. ROUNDED, never floored to a lot — this is the
 * count the offer document prints. A carve-out sold at a discount buys more
 * shares per rupee, so it cannot simply be ₹ ÷ band price.
 */
function derivedTotalShares(extra, price) {
  const cr = legSumCr(extra, price) || fnum(extra.issueSizeCr);
  if (!(price > 0) || !(cr > 0)) return 0;
  const cv = carveoutAt(extra, price);
  const pub = Math.round((cr * 1e7 - cv.rupees) / price);
  return pub > 0 ? pub + cv.shares : 0;
}

/** The two totals every percentage divides out of — NET of carve-outs. */
function offerTotals(extra, pMax, pMin) {
  const stated = fnum(extra.totalShares) || derivedTotalShares(extra, pMax);
  if (!(stated > 0) || !(pMax > 0)) return { cap: 0, floor: 0, stated: 0 };
  const net = stated - carveoutAt(extra, pMax).shares;
  if (!(net > 0)) return { cap: 0, floor: 0, stated };
  return { cap: net, floor: pMin > 0 ? (net * pMax) / pMin : net, stated };
}

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
    const totals = offerTotals(extra, pMax, pMin);
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
    if (!statedTyped && totals.stated > 0) {
      patch.totalShares = String(totals.stated);
      patch.totalSharesSource = 'derived';
      lines.push(`    totalShares (blank) -> ${fmt(totals.stated)}  [derived]`);
    }
    if (!Object.keys(next).length && !Object.keys(patch).length) continue;
    if (Object.keys(next).length) patch.shareResv = { ...resv, ...next };

    changed++;
    console.log(`${ipo.symbol}  band ₹${pMin}–₹${pMax}  net offer ${fmt(totals.cap)} of ${fmt(totals.stated)} (carve-out ${fmt(carveoutAt(extra, pMax).shares)})`);
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
