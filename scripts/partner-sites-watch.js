#!/usr/bin/env node
/**
 * Keep every live partner site in step with what admin saved (2026-11-25).
 *
 *   node scripts/partner-sites-watch.js            run the loop (one instance)
 *   node scripts/partner-sites-watch.js --ensure   start the loop in the background if it is not running
 *   node scripts/partner-sites-watch.js --once     one pass, then exit (for checking)
 *   node scripts/partner-sites-watch.js --dry-run  one pass that only REPORTS what it would build and route
 *
 * Every 20 seconds it reads the public tenant registry and, for each partner
 * switched live in admin (Super Admin, "Partner site live") with its legal
 * name and grievance officer filled in:
 *
 *  1. REBUILDS the partner's design when what that design's published build
 *     baked for the partner (name, domain, brand colour, logos, GMP flag,
 *     identity, contact — `pw-fp` in its pages, partnerSiteFingerprint in
 *     shared-types) no longer matches the registry. ~1 minute per design, via
 *     apps/partner/scripts/publish-live.mjs, which refuses a bad build and
 *     leaves the live copy as it was. A failed build is not retried for 30
 *     minutes for the same inputs.
 *  2. RE-ROUTES the domain (scripts/partner-routes.js --apply): a changed
 *     design takes effect in seconds, with its own checks and rollback.
 *
 * It never builds over uncommitted work under apps/partner or the packages it
 * reads (a build publishes the working tree), it never builds while the
 * nightly rebuild holds the partner build lock, and it builds only for LIVE
 * partners. Status for the admin panel: C:/ProgramData/Investoyard/partner-sites-status.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PARTNER_SITES_DATA || 'C:/ProgramData/Investoyard'; // override only for tests
const PID = path.join(DATA, 'partner-sites-watch.pid');
const LOG = path.join(DATA, 'partner-sites-watch.log');
const STATUS = path.join(DATA, 'partner-sites-status.json');
const BUILD_LOCK = path.join(DATA, 'partner-build.lock');
const LIVE = path.join(ROOT, 'apps', 'web', 'out');
const PARTNER = path.join(ROOT, 'apps', 'partner');
const API = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const TICK_MS = 20_000;
const RETRY_FAILED_MS = 30 * 60_000;
const WATCH = ['apps/partner', 'packages/shared-types', 'packages/i18n'];

const { SITE_TEMPLATES, partnerSiteGate, partnerSiteFingerprint, parsePartnerSiteFingerprints } =
  require(path.join(ROOT, 'packages', 'shared-types', 'dist'));
const DESIGNS = SITE_TEMPLATES.map((t) => t.id).filter((id) => id !== 'default');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const log = (s) => { try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); } catch { /* never the failure */ } };

/* ------------------------------------------------------------ one instance */
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function runningPid() {
  try { const pid = Number(fs.readFileSync(PID, 'utf8').trim()); return pid && pid !== process.pid && alive(pid) ? pid : null; }
  catch { return null; }
}

if (args.includes('--ensure')) {
  const pid = runningPid();
  if (pid) { console.log(`watcher running (pid ${pid})`); process.exit(0); }
  fs.mkdirSync(DATA, { recursive: true });
  const out = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, [__filename], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  console.log(`watcher started (pid ${child.pid})`);
  process.exit(0);
}

/* ------------------------------------------------------------ helpers */
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} answered ${res.statusCode}`)); }
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => (s += d));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { reject(new Error(`${url} did not return JSON`)); } });
    });
    req.on('timeout', () => req.destroy(new Error(`${url} timed out`)));
    req.on('error', reject);
  });
}
function git(a) { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || r.error || '') }; }
/** Uncommitted work a build would publish. Same rule as scripts/daily-rebuild.js, line-ending-only changes ignored. */
function dirty() {
  const st = git(['status', '--porcelain', '--'].concat(WATCH));
  if (st.code !== 0) return ['(git status failed)'];
  const real = [];
  for (const line of st.out.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> '); if (arrow >= 0) p = p.slice(arrow + 4);
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    if (code === ' M') { const d = git(['diff', '--numstat', '--', p]); if (d.code === 0 && d.out.trim() === '') continue; }
    real.push(p);
  }
  return real;
}
function forwarderOk() { return spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'api-forward.js'), '--check'], { cwd: ROOT }).status === 0; }
function startForwarder() {
  const out = fs.openSync(path.join(DATA, 'api-forward.log'), 'a');
  spawn(process.execPath, [path.join(ROOT, 'scripts', 'api-forward.js')], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
}
/** The fingerprints a published design baked, by partner slug. Empty when the design is not published. */
function baked(design) {
  try {
    const html = fs.readFileSync(path.join(LIVE, '_partner', design, 'index.html'), 'utf8');
    if (((html.match(/<html[^>]*\sdata-variant="([a-z0-9-]+)"/) || [])[1]) !== design) return null;
    const m = html.match(/<meta name="pw-fp" content="([^"]*)"/);
    return parsePartnerSiteFingerprints(m ? m[1] : '');
  } catch { return null; }
}
/** Merge watcher fields into the status file the router writes. */
function patchStatus(fn) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch { /* first run */ }
  fn(j);
  j.watcherAt = new Date().toISOString();
  try { fs.mkdirSync(DATA, { recursive: true }); const tmp = STATUS + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 2)); fs.renameSync(tmp, STATUS); } catch { /* the panel shows an older status */ }
}
function takeBuildLock() {
  try {
    const st = fs.statSync(BUILD_LOCK);
    if (Date.now() - st.mtimeMs < 2 * 3600_000) return false; // the nightly rebuild or another build is running
    fs.rmSync(BUILD_LOCK, { force: true }); // stale
  } catch { /* no lock */ }
  try { fs.writeFileSync(BUILD_LOCK, `watcher ${process.pid} ${new Date().toISOString()}\n`, { flag: 'wx' }); return true; } catch { return false; }
}

/* ------------------------------------------------------------ one pass */
const failed = new Map(); // `${design}:${fingerprints}` -> time it failed
let lastNote = '';
async function pass() {
  let tenants;
  try { tenants = await getJson(`${API}/tenants`); }
  catch (e) {
    if (!forwarderOk()) { startForwarder(); log('forwarder not answering; started it'); }
    patchStatus((j) => { j.watcherNote = `cannot read the tenant list (${e.message})`; });
    return;
  }
  if (!Array.isArray(tenants) || !tenants.some((t) => t && t.type === 'direct')) { patchStatus((j) => { j.watcherNote = 'tenant list looks wrong'; }); return; }

  /* 1. which designs need a rebuild for a LIVE partner */
  const need = new Map(); // design -> [{slug, fp}]
  for (const t of tenants) {
    if (!t || t.type === 'direct' || t.siteLive !== true) continue;
    const design = t.content && t.content.site && t.content.site.template;
    if (!t.customDomain || !DESIGNS.includes(design)) continue;
    if (partnerSiteGate({ name: t.name, content: t.content }).length) continue;
    const fp = partnerSiteFingerprint(t);
    const have = baked(design);
    if (have && have.get(t.slug) === fp) continue;
    if (!need.has(design)) need.set(design, []);
    need.get(design).push({ slug: t.slug, fp });
  }

  if (DRY) {
    console.log(need.size ? 'would rebuild: ' + [...need].map(([d, l]) => d + ' for ' + l.map((x) => x.slug).join(',')).join('; ') : 'would rebuild: nothing');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'partner-routes.js')], { cwd: ROOT, encoding: 'utf8' });
    console.log(String(r.stdout || '').trim());
    return;
  }
  if (need.size) {
    const todo = [...need.entries()].filter(([d, list]) => {
      const key = `${d}:${list.map((x) => x.fp).join(',')}`;
      const at = failed.get(key);
      return !(at && Date.now() - at < RETRY_FAILED_MS);
    });
    const wip = todo.length ? dirty() : [];
    let note = '';
    if (todo.length && wip.length) note = `rebuild waiting: uncommitted work under ${wip.slice(0, 3).join(', ')}${wip.length > 3 ? '…' : ''}`;
    else if (todo.length && !forwarderOk()) { startForwarder(); note = 'rebuild waiting: the build path to the API is down (started the forwarder)'; }
    else if (todo.length && !takeBuildLock()) note = 'rebuild waiting: another partner build is running';
    else if (todo.length) {
      const designs = todo.map(([d]) => d);
      const slugs = todo.flatMap(([, l]) => l.map((x) => x.slug));
      patchStatus((j) => { j.partners = j.partners || {}; for (const s of slugs) j.partners[s] = { ...(j.partners[s] || {}), building: true, buildStartedAt: new Date().toISOString() }; j.watcherNote = ''; });
      log(`rebuilding ${designs.join(', ')} for ${slugs.join(', ')}`);
      let r;
      try { r = spawnSync(process.execPath, [path.join(PARTNER, 'scripts', 'publish-live.mjs'), ...designs], { cwd: PARTNER, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true }); }
      finally { fs.rmSync(BUILD_LOCK, { force: true }); }
      const tail = (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n').slice(-6).join(' | ');
      for (const [d, list] of todo) {
        const ok = (() => { const have = baked(d); return !!have && list.every((x) => have.get(x.slug) === x.fp); })();
        if (!ok) failed.set(`${d}:${list.map((x) => x.fp).join(',')}`, Date.now());
        log(`${d}: ${ok ? 'rebuilt' : 'REBUILD FAILED'}${ok ? '' : ' — ' + tail}`);
        patchStatus((j) => {
          j.partners = j.partners || {};
          for (const x of list) j.partners[x.slug] = { ...(j.partners[x.slug] || {}), building: false, lastBuildAt: new Date().toISOString(), lastBuildOk: ok, lastBuildNote: ok ? null : tail.slice(-300) };
        });
      }
    }
    if (note !== lastNote) { if (note) log(note); lastNote = note; }
    patchStatus((j) => { j.watcherNote = note; });
  } else if (lastNote) { lastNote = ''; patchStatus((j) => { j.watcherNote = ''; }); }

  /* 2. route: the router has its own checks and rollback, and writes the per-partner status */
  const rr = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'partner-routes.js'), '--apply', '--quiet', '--log-changes-only'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (rr.status !== 0) log(`routes: exit ${rr.status} ${String(rr.stderr || '').trim().split('\n').slice(0, 4).join(' | ')}`);
  patchStatus(() => {});
}

/* ------------------------------------------------------------ main */
(async () => {
  if (args.includes('--once') || DRY) { await pass(); process.exit(0); }
  const other = runningPid();
  if (other) { console.log(`another watcher is running (pid ${other}); exiting`); process.exit(0); }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  const cleanup = () => { try { if (fs.readFileSync(PID, 'utf8').trim() === String(process.pid)) fs.rmSync(PID, { force: true }); } catch { /* gone */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  log(`watcher started (pid ${process.pid})`);
  for (;;) {
    const t0 = Date.now();
    try { await pass(); } catch (e) { log(`pass failed: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); }
    await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - (Date.now() - t0))));
  }
})();
