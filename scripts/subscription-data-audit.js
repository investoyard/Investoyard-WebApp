/**
 * Report-only: flag IPOs whose reservation-table inputs disagree, so the
 * subscription poller can't derive a trustworthy "times subscribed" divisor.
 *
 * For every IPO with any `extra.shareResv` data, compares two independent
 * estimates of TOTAL offered shares:
 *
 *   A. Sum of per-bucket `shareResv[k].sharesLower` (operator-entered)
 *   B. `issueSize (₹) ÷ priceBandMax (₹/share)` (derived from other IPO fields)
 *
 * They should agree. When they diverge by more than the threshold (default
 * 20%), one of them is wrong — usually `issueSize` mis-entered as a placeholder
 * (SONA and JSIPL shipped with `₹1 Cr` instead of ~₹99 Cr / ~₹87 Cr).
 *
 * Also flags per-bucket sharesLower / pct inconsistency (a bucket whose
 * `sharesLower` divided by `sharesLower_sum` diverges >5 pp from the entered
 * `pct`), and IPOs with `sharesLower_sum > 0` but no `issueSize`.
 *
 *   node scripts/subscription-data-audit.js                    # markdown to stdout
 *   node scripts/subscription-data-audit.js --csv              # CSV to stdout
 *   node scripts/subscription-data-audit.js --threshold=10     # 10% divergence
 *   node scripts/subscription-data-audit.js --only-open        # only currently-open issues
 *
 * Reads only. Nothing is written.
 */
const { PrismaClient } = require('@prisma/client');

const CSV = process.argv.includes('--csv');
const ONLY_OPEN = process.argv.includes('--only-open');
const T_ARG = process.argv.find((a) => a.startsWith('--threshold='));
const THRESHOLD_PCT = T_ARG ? Number(T_ARG.split('=')[1]) : 20;

const BUCKETS = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const prisma = new PrismaClient();

function auditOne(ipo) {
  const resv = (ipo.extra && ipo.extra.shareResv) || null;
  if (!resv || typeof resv !== 'object') return null;

  // A) Sum of operator-entered per-bucket offered shares.
  let sharesLowerSum = 0;
  const perBucket = {};
  for (const b of BUCKETS) {
    const row = resv[b];
    if (!row) continue;
    const sl = num(row.sharesLower);
    const pct = num(row.pct);
    perBucket[b] = { sl, pct };
    if (sl > 0) sharesLowerSum += sl;
  }

  // B) Derived from issueSize (₹) ÷ priceBandMax (₹/share).
  const issueSize = num(ipo.issueSize);
  const priceMax = num(ipo.priceBandMax);
  const derivedTotal = issueSize > 0 && priceMax > 0 ? issueSize / priceMax : 0;

  // Divergence between A and B — only meaningful when both are known.
  let divergencePct = null;
  if (sharesLowerSum > 0 && derivedTotal > 0) {
    const bigger = Math.max(sharesLowerSum, derivedTotal);
    const smaller = Math.min(sharesLowerSum, derivedTotal);
    divergencePct = ((bigger - smaller) / bigger) * 100;
  }

  // Per-bucket pct vs implied pct (sharesLower / sharesLowerSum). >5 pp off
  // means the operator entered a percentage that doesn't match the per-bucket
  // share allocation they also entered — the poll can still run (sharesLower
  // wins), but the entry is contradictory.
  const bucketFlags = [];
  if (sharesLowerSum > 0) {
    for (const b of BUCKETS) {
      const pb = perBucket[b];
      if (!pb || pb.sl <= 0 || pb.pct <= 0) continue;
      const implied = (pb.sl / sharesLowerSum) * 100;
      const gap = Math.abs(implied - pb.pct);
      if (gap > 5) bucketFlags.push(`${b} pct=${pb.pct}% vs impliedFromShares=${implied.toFixed(1)}%`);
    }
  }

  const problems = [];
  if (divergencePct != null && divergencePct > THRESHOLD_PCT) {
    problems.push(`divergence ${divergencePct.toFixed(1)}%`);
  }
  if (sharesLowerSum > 0 && derivedTotal <= 0) {
    problems.push('sharesLower entered but no issueSize/priceBandMax');
  }
  if (sharesLowerSum <= 0 && derivedTotal > 0) {
    problems.push('no sharesLower — poll will fall back to derived offered (fragile)');
  }
  if (sharesLowerSum <= 0 && derivedTotal <= 0) {
    problems.push('no offered source at all');
  }
  if (bucketFlags.length > 0) problems.push('bucket mismatch: ' + bucketFlags.join('; '));

  return {
    symbol: ipo.symbol,
    name: ipo.name,
    type: ipo.type,
    openDate: ipo.openDate ? ipo.openDate.toISOString().slice(0, 10) : '',
    closeDate: ipo.closeDate ? ipo.closeDate.toISOString().slice(0, 10) : '',
    hidden: ipo.hidden === true,
    issueSize,
    issueSizeCr: issueSize > 0 ? +(issueSize / 1e7).toFixed(2) : 0,
    priceMax,
    sharesLowerSum,
    derivedTotal: Math.round(derivedTotal),
    divergencePct: divergencePct != null ? +divergencePct.toFixed(1) : null,
    problems,
  };
}

function fmtInt(n) { return Math.round(n).toLocaleString('en-IN'); }

(async () => {
  const now = new Date();
  const where = { hidden: false };
  if (ONLY_OPEN) {
    where.openDate = { lte: now };
    where.closeDate = { gte: now };
  }
  const ipos = await prisma.ipo.findMany({
    where,
    select: {
      id: true, symbol: true, name: true, type: true,
      openDate: true, closeDate: true, hidden: true,
      issueSize: true, priceBandMax: true, extra: true,
    },
    orderBy: [{ closeDate: 'asc' }, { symbol: 'asc' }],
  });

  const rows = ipos.map(auditOne).filter((r) => r && r.problems.length > 0);
  const clean = ipos.map(auditOne).filter((r) => r && r.problems.length === 0).length;

  if (CSV) {
    console.log('symbol,name,type,openDate,closeDate,issueSizeCr,priceMax,sharesLowerSum,derivedTotal,divergencePct,problems');
    for (const r of rows) {
      const problems = r.problems.join(' | ').replace(/"/g, '""');
      console.log([
        r.symbol, JSON.stringify(r.name), r.type, r.openDate, r.closeDate,
        r.issueSizeCr, r.priceMax, r.sharesLowerSum, r.derivedTotal,
        r.divergencePct ?? '',
        '"' + problems + '"',
      ].join(','));
    }
  } else {
    console.log('# Subscription-data audit');
    console.log(`_${ipos.length} IPOs scanned · ${clean} pass · ${rows.length} need attention · divergence threshold ${THRESHOLD_PCT}%_`);
    console.log('');
    if (rows.length === 0) {
      console.log('All IPOs have consistent offered-share inputs. Nothing to fix.');
    } else {
      for (const r of rows) {
        console.log(`## ${r.symbol}${r.name ? ` — ${r.name}` : ''}  _(${r.type}${r.openDate ? `, opens ${r.openDate}` : ''})_`);
        console.log(`- issueSize: **₹${r.issueSizeCr} Cr**  · priceMax: ₹${r.priceMax}  · derived total: **${fmtInt(r.derivedTotal)} sh**`);
        console.log(`- sharesLower sum (operator-entered): **${fmtInt(r.sharesLowerSum)} sh**`);
        if (r.divergencePct != null) console.log(`- divergence: **${r.divergencePct}%**`);
        for (const p of r.problems) console.log(`- ⚠ ${p}`);
        console.log('');
      }
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
