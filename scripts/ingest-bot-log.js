#!/usr/bin/env node
/**
 * BOTS ON THE SUBSCRIPTION PAGES, FROM THE IIS ACCESS LOG (2026-11-23).
 *
 * The page beacon (Admin → Visitors) only counts a visitor that runs the page's
 * JavaScript, and most bots never do — on 22 Nov the log held 898 bot requests
 * to /subscription and /subscription/v2 (ShapBot alone 810) while the beacon
 * saw almost none. The log sees every request, with the user agent, so it is
 * the source for the Bots tab.
 *
 * What it does: reads investoyard.com's IIS logs (W3SVC6), keeps requests to
 * the two tracked pages whose user agent is a bot, names the bot with the API's
 * own `botName()`, and writes ABSOLUTE counts per India day, page and bot into
 * BotVisit. Re-running it rewrites the same numbers, so it is safe to run as
 * often as you like.
 *
 *   node scripts/ingest-bot-log.js            # the last 2 India days (the scheduled run)
 *   node scripts/ingest-bot-log.js --all      # every log on disk (first run / backfill)
 *   node scripts/ingest-bot-log.js --dry-run  # count and print, write nothing
 *
 * IIS writes one file per UTC day (u_exYYMMDD.log) and an India day spans two of
 * them (00:00 IST is 18:30 UTC the day before), so a day is only written when
 * both of its UTC files have been read.
 *
 * Runs as the `finwave` user (scheduled task Investoyard-BotLog), which can read
 * the IIS logs; the API's app-pool identity cannot.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = 'C:/inetpub/logs/LogFiles/W3SVC6';
const PATHS = new Map([['/subscription', '/subscription'], ['/subscription/', '/subscription'], ['/subscription/v2', '/subscription/v2'], ['/subscription/v2/', '/subscription/v2']]);
const all = process.argv.includes('--all');
const dry = process.argv.includes('--dry-run');
const STATE_LOG = 'C:/ProgramData/Investoyard/bot-log.log';

function note(line) {
  const msg = `${new Date().toISOString()} ${line}`;
  console.log(line);
  try { fs.mkdirSync(path.dirname(STATE_LOG), { recursive: true }); fs.appendFileSync(STATE_LOG, msg + '\n'); } catch { /* best effort */ }
}

(async () => {
  let botName;
  try { ({ botName } = require(path.join(ROOT, 'apps/api/dist/modules/metrics/metrics.util.js'))); }
  catch { throw new Error('apps/api/dist is missing metrics.util.js — compile the API first.'); }
  if (typeof botName !== 'function') throw new Error('The compiled API has no botName() — compile the current API first.');

  const files = fs.readdirSync(LOG_DIR).filter((f) => /^u_ex\d{6}\.log$/.test(f)).sort();
  if (!files.length) throw new Error(`No IIS logs found in ${LOG_DIR}.`);
  const chosen = all ? files : files.slice(-3);      // 3 UTC files cover the last 2 India days in full
  const utcDays = chosen.map((f) => `20${f.slice(4, 6)}-${f.slice(6, 8)}-${f.slice(8, 10)}`);

  // (istDay|path|bot) → { hits, lastAt, ua }
  const agg = new Map();
  let lines = 0, kept = 0;
  for (const f of chosen) {
    const text = fs.readFileSync(path.join(LOG_DIR, f), 'utf8');
    let fields = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      if (line.startsWith('#Fields:')) { fields = line.slice(9).trim().split(' '); continue; }
      if (line[0] === '#') continue;
      lines++;
      const c = line.split(' ');
      const at = (k) => c[fields.indexOf(k)];
      const page = PATHS.get(at('cs-uri-stem'));
      if (!page) continue;
      const ua = (at('cs(User-Agent)') || '').replace(/\+/g, ' ');
      const bot = botName(ua === '-' ? '' : ua);
      if (!bot) continue;                              // a real browser — the beacon counts those
      const instant = new Date(`${at('date')}T${at('time')}Z`);
      if (Number.isNaN(instant.getTime())) continue;
      const istDay = new Date(instant.getTime() + 330 * 60_000).toISOString().slice(0, 10);
      const key = `${istDay}|${page}|${bot}`;
      const a = agg.get(key) ?? { hits: 0, lastAt: instant, ua };
      a.hits++;
      if (instant > a.lastAt) { a.lastAt = instant; a.ua = ua; }
      agg.set(key, a);
      kept++;
    }
  }

  // An India day D needs UTC files D-1 and D. Write only the days fully covered.
  const have = new Set(utcDays);
  const prev = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const complete = new Set([...new Set([...agg.keys()].map((k) => k.split('|')[0]))].filter((d) => have.has(d) && have.has(prev(d))));
  const rows = [...agg.entries()].filter(([k]) => complete.has(k.split('|')[0]));

  const days = [...complete].sort();
  note(`read ${chosen.length} log file(s), ${lines} requests; ${kept} bot requests to the tracked pages; writing ${rows.length} row(s) for ${days.length} day(s) ${days.length ? `${days[0]} → ${days[days.length - 1]}` : ''}${dry ? ' [dry run]' : ''}`);
  if (dry) {
    const byBot = {};
    for (const [k, v] of rows) { const b = k.split('|')[2]; byBot[b] = (byBot[b] ?? 0) + v.hits; }
    for (const [b, n] of Object.entries(byBot).sort((x, y) => y[1] - x[1]).slice(0, 20)) console.log(`  ${b.padEnd(28)} ${n}`);
    return;
  }

  const env = fs.readFileSync(path.join(ROOT, 'apps/api/.env'), 'utf8');
  const url = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)[1];
  process.env.DATABASE_URL = url + (url.includes('?') ? '&' : '?') + 'connection_limit=1';
  const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));
  const p = new PrismaClient();
  try {
    for (const [k, v] of rows) {
      const [day, page, bot] = k.split('|');
      await p.$executeRawUnsafe(
        `INSERT INTO "BotVisit" ("id","day","path","bot","hits","lastAt","sampleUa")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
         ON CONFLICT ("day","path","bot") DO UPDATE SET "hits" = EXCLUDED."hits", "lastAt" = EXCLUDED."lastAt", "sampleUa" = EXCLUDED."sampleUa"`,
        day, page, bot, v.hits, v.lastAt, String(v.ua).slice(0, 500),
      );
    }
  } finally { await p.$disconnect(); }
  note(`done: ${rows.length} row(s) written`);
})().catch((e) => { note(`FAILED: ${e.message}`); process.exit(1); });
