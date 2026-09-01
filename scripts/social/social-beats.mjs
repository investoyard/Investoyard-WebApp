#!/usr/bin/env node
/**
 * Investoyard social beat generator.
 *
 * Reads the IPO catalog, works out which lifecycle beats fire on a given day,
 * renders the copy for every routed channel, lints it against the compliance
 * rules, and writes a dated review queue to disk.
 *
 * It NEVER posts anything. Output is a folder of drafts for a human to approve.
 *
 *   node scripts/social/social-beats.mjs                 # today
 *   node scripts/social/social-beats.mjs --date=2026-08-24
 *   node scripts/social/social-beats.mjs --dry-run       # print, write nothing
 *   node scripts/social/social-beats.mjs --out=some/dir
 *
 * Reads DATABASE_URL from apps/api/.env — the secret is never passed on the
 * command line and never printed. All queries are read-only SELECTs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  BEATS, TIER_BEATS, TIER_CHANNELS, CHANNELS, WEEKLY_GRID,
  lint, requiresEntityLine, ENTITY_LINE, titleCase, times,
} from './system.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/* ---------------------------------------------------------------- args -- */
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DRY = argv.includes('--dry-run');
const TARGET = arg('date') ?? new Date().toISOString().slice(0, 10);
const OUT_ROOT = arg('out') ?? path.join(REPO, 'content', 'social');

if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET)) {
  console.error(`--date must be YYYY-MM-DD, got "${TARGET}"`);
  process.exit(2);
}

/* --------------------------------------------------------------- setup -- */
// The API's env is the one source of the connection string. Prefer the main
// checkout's copy; fall back to this tree if it has its own.
for (const p of [path.join(REPO, 'apps', 'api', '.env'), 'D:/Investoyard/apps/api/.env']) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break; }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found — expected it in apps/api/.env');
  process.exit(2);
}

const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();

const dayMs = 86400000;
const asUTC = (s) => new Date(`${s}T00:00:00.000Z`);
const target = asUTC(TARGET);
const sameDay = (a, b) => a && b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/* --------------------------------------------------------------- fetch -- */
// Widen by 10 days each way: `announced` fires seven days BEFORE the open.
const from = new Date(target.getTime() - 12 * dayMs);
const to = new Date(target.getTime() + 12 * dayMs);

const rows = await db.ipo.findMany({
  where: {
    hidden: false,
    OR: [
      { openDate: { gte: from, lte: to } },
      { closeDate: { gte: from, lte: to } },
      { allotmentDate: { gte: from, lte: to } },
      { listingDate: { gte: from, lte: to } },
    ],
  },
  select: {
    id: true, symbol: true, name: true, type: true, status: true,
    openDate: true, closeDate: true, allotmentDate: true, listingDate: true,
    priceBandMin: true, priceBandMax: true, lotSize: true, minAmount: true,
    issueSize: true, listingGainPct: true, extra: true,
  },
});

/* Duplicate catalog rows exist (same issue entered under two symbols). Key on
   the issue's shape, not its symbol, and keep the first. */
const seen = new Map();
const dupes = [];
for (const r of rows) {
  const key = [r.openDate?.toISOString(), r.closeDate?.toISOString(),
               r.priceBandMin, r.priceBandMax, r.lotSize].join('|');
  if (seen.has(key)) { dupes.push({ kept: seen.get(key).symbol, dropped: r.symbol }); continue; }
  seen.set(key, r);
}
const ipos = [...seen.values()];

/* Latest subscription figure per category, for the IPOs in scope. */
const subRows = ipos.length
  ? await db.ipoSubscription.findMany({
      where: { ipoId: { in: ipos.map((i) => i.id) } },
      orderBy: { asOf: 'desc' },
      select: { ipoId: true, category: true, timesSubscribed: true, asOf: true },
    })
  : [];

const CAT_LABEL = { retail: 'Retail', hni: 'HNI', nii: 'NII', qib: 'QIB',
                    employee: 'Employee', shareholder: 'Shareholder', total: 'Overall' };

const subByIpo = new Map();
for (const s of subRows) {
  const bucket = subByIpo.get(s.ipoId) ?? new Map();
  if (!bucket.has(s.category)) bucket.set(s.category, s); // rows are desc by asOf
  subByIpo.set(s.ipoId, bucket);
}

function subFor(ipoId) {
  const bucket = subByIpo.get(ipoId);
  if (!bucket || bucket.size === 0) return null;
  const categories = [...bucket.values()].map((s) => ({
    code: s.category,
    label: CAT_LABEL[s.category] ?? s.category,
    x: Number(s.timesSubscribed),
  }));
  const total = categories.find((c) => c.code === 'total')?.x ?? null;
  return { categories, total, asOf: [...bucket.values()][0].asOf };
}

/** Anchors live in the operator-entered `extra` blob; key name varies. */
function anchorsFor(extra) {
  if (!extra || typeof extra !== 'object') return [];
  const raw = extra.anchors ?? extra.anchorInvestors ?? extra.anchor ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => ({
      name: typeof a === 'string' ? a : (a.name ?? a.investor ?? null),
      amount: typeof a === 'object' && a ? Number(a.amount ?? a.amountCr ?? NaN) : NaN,
    }))
    .filter((a) => a.name)
    .map((a) => ({ name: a.name, amount: Number.isFinite(a.amount) ? a.amount : null }));
}

/* ------------------------------------------------------------- generate -- */
const drafts = [];
const skipped = [];

for (const raw of ipos) {
  const e = raw.extra && typeof raw.extra === 'object' ? raw.extra : {};
  const anchorDate = e.anchorDate && !Number.isNaN(Date.parse(e.anchorDate)) ? new Date(e.anchorDate) : null;
  const listingPrice = [e.nseListingPrice, e.bseListingPrice]
    .map(Number).find((n) => Number.isFinite(n) && n > 0) ?? null;

  const ipo = {
    ...raw,
    sub: subFor(raw.id),
    anchors: anchorsFor(raw.extra),
    anchorDate,
    listingPrice,
  };
  const allowedBeats = TIER_BEATS[ipo.type] ?? TIER_BEATS.mainboard;
  const channelCap = TIER_CHANNELS[ipo.type];

  for (const beat of BEATS) {
    if (!allowedBeats.includes(beat.id)) continue;
    if (!sameDay(beat.on(ipo), target)) continue;

    if (!beat.needs(ipo)) {
      skipped.push({ symbol: ipo.symbol, beat: beat.id, why: 'no real data for this beat' });
      continue;
    }

    const rendered = beat.render(ipo);
    const channels = beat.channels.filter((c) => !channelCap || channelCap.includes(c));

    for (const ch of channels) {
      const text = rendered[ch];
      if (!text) continue;

      const hits = lint(text, titleCase(ipo.name));
      // Long channels carry the full entity line; X carries "Not advice." — both match.
      if (requiresEntityLine(beat.id) && !/not advice/i.test(text)) {
        hits.push({ term: '(missing)', why: 'beat requires the entity/not-advice line' });
      }
      const over = text.length > CHANNELS[ch].limit;

      drafts.push({
        ipo, beat, channel: ch, text,
        lint: hits,
        warn: over ? [`${text.length} chars over the ${CHANNELS[ch].limit} limit for ${CHANNELS[ch].label}`] : [],
      });
    }
  }
}

drafts.sort((a, b) => (a.beat.slot + a.ipo.symbol).localeCompare(b.beat.slot + b.ipo.symbol));

/* ---------------------------------------------------------------- write -- */
const grid = WEEKLY_GRID[target.getUTCDay()];
const blocked = drafts.filter((d) => d.lint.length);
const clean = drafts.filter((d) => !d.lint.length);

const byPost = new Map();
for (const d of clean) {
  const key = `${d.ipo.symbol}-${d.beat.id}`;
  const bucket = byPost.get(key) ?? { ipo: d.ipo, beat: d.beat, channels: [] };
  bucket.channels.push(d);
  byPost.set(key, bucket);
}

function postFile(p) {
  const fm = [
    '---',
    `beat: ${p.beat.id}`,
    `title: ${p.beat.title}`,
    `ipo: ${titleCase(p.ipo.name)}`,
    `symbol: ${p.ipo.symbol}`,
    `board: ${p.ipo.type}`,
    `date: ${TARGET}`,
    `slot: "${p.beat.slot}"`,
    `channels: [${p.channels.map((c) => c.channel).join(', ')}]`,
    'status: draft',
    'compliance: pass',
    '---',
    '',
  ].join('\n');
  const body = p.channels
    .map((c) => {
      const warn = c.warn.length ? `\n> ⚠ ${c.warn.join('; ')}\n` : '';
      return `## ${CHANNELS[c.channel].label}\n${warn}\n\`\`\`\n${c.text}\n\`\`\`\n`;
    })
    .join('\n');
  return fm + body;
}

const outDir = path.join(OUT_ROOT, TARGET);
const files = [];
for (const [key, p] of byPost) {
  files.push({ name: `${p.beat.slot.replace(':', '')}-${key.toLowerCase()}.md`, body: postFile(p) });
}

const index = [
  `# Social queue — ${TARGET}`,
  '',
  `Weekly slot: **${grid.slot}** — ${grid.brief}`,
  '',
  `${byPost.size} post(s) across ${clean.length} channel draft(s). Nothing here is published; approve and post by hand.`,
  '',
  '| Slot | IPO | Board | Beat | Channels |',
  '|------|-----|-------|------|----------|',
  ...[...byPost.values()].map(
    (p) => `| ${p.beat.slot} | ${titleCase(p.ipo.name)} | ${p.ipo.type} | ${p.beat.title} | ${p.channels.map((c) => c.channel).join(', ')} |`,
  ),
  '',
  ...(blocked.length
    ? ['## Blocked by the compliance lint', '',
       ...blocked.map((d) => `- **${d.ipo.symbol} / ${d.beat.id} / ${d.channel}** — ${d.lint.map((h) => `"${h.term}" (${h.why})`).join(', ')}`), '']
    : []),
  ...(skipped.length
    ? ['## Skipped — no real data', '',
       ...skipped.map((s) => `- ${s.symbol} / ${s.beat} — ${s.why}`), '']
    : []),
  ...(dupes.length
    ? ['## Duplicate catalog rows collapsed', '',
       ...dupes.map((d) => `- kept \`${d.kept}\`, dropped \`${d.dropped}\` (identical dates, band and lot)`), '']
    : []),
].join('\n');

if (DRY) {
  console.log(index);
  console.log('\n' + '─'.repeat(60) + '\n');
  for (const f of files) console.log(`── ${f.name}\n${f.body}`);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(outDir, f.name), f.body, 'utf8');
  fs.writeFileSync(path.join(outDir, 'index.md'), index, 'utf8');
  console.log(`${TARGET}: ${byPost.size} post(s), ${clean.length} channel draft(s) → ${outDir}`);
}

if (blocked.length) console.error(`compliance lint blocked ${blocked.length} draft(s) — see the index`);
if (skipped.length) console.error(`${skipped.length} beat(s) skipped for missing data`);

await db.$disconnect();
process.exit(blocked.length ? 1 : 0);
