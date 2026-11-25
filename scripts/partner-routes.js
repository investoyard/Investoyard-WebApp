#!/usr/bin/env node
/**
 * Send each partner's domain to the design chosen for it in admin.
 *
 *   node scripts/partner-routes.js                  dry run: what would be routed, and why not
 *   node scripts/partner-routes.js --apply          write the routes (partners switched live in admin only)
 *
 * Normally run by scripts/partner-sites-watch.js every ~20 seconds, so a saved
 * design reaches the partner's domain within a minute. Each run writes
 * C:/ProgramData/Investoyard/partner-sites-status.json, which the admin
 * Site layout panel reads.
 *
 *
 * HOW A DOMAIN REACHES A DESIGN
 *
 * Every partner domain is served from the same folder as investoyard.com
 * (apps/web/out), off the same web.config. The five partner designs are
 * published inside it at _partner/<design>/ (apps/partner/scripts/publish-live.mjs),
 * and web.config carries one rule: when the request's host is in the
 * PartnerDesign map, serve the file from _partner/<design>/ instead. A host
 * not in the map gets investoyard.com's own pages, exactly as before.
 *
 * The map lives in apps/web/out/partner-routes.config (web.config pulls it in
 * with configSource), so changing a partner's design is a FILE WRITE — no IIS
 * change, no elevation. IIS does not notice an edit to that file by itself, so
 * web.config is touched afterwards, and only when the map really changed.
 *
 *
 * WHAT KEEPS THIS FROM BREAKING A LIVE SITE
 *
 *  - A PARTNER MUST BE SWITCHED LIVE in admin (Super Admin, the "Partner site
 *    live" switch, Tenant.partnerSiteLive → `siteLive` on the registry) AND have
 *    its legal name and grievance officer filled in (partnerSiteGate). Once
 *    live, later design changes in admin apply on the next run by themselves.
 *    A partner on "our own layout" is never routed. (Until 2026-11-25 the switch
 *    was a server-side list, --enable/--disable; that list is no longer read.)
 *  - A DEAD API CHANGES NOTHING. If the tenant list cannot be read, the map is
 *    left exactly as it is; an empty answer must never clear every route.
 *  - A domain is routed only when the published design really is there AND its
 *    baked registry knows that domain — otherwise the partner would get the
 *    "site not configured" notice. That case is reported as "rebuild needed".
 *  - AFTER WRITING, IT CHECKS: investoyard.com must still serve its home page,
 *    every routed domain must serve the design it was given, and a domain taken
 *    off must be back on our pages. Any failure restores the previous map.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const LIVE = path.join(ROOT, 'apps', 'web', 'out');
const MAP = path.join(LIVE, 'partner-routes.config');
const WEBCFG = path.join(LIVE, 'web.config');
const DATA = process.env.PARTNER_SITES_DATA || 'C:/ProgramData/Investoyard'; // override only for tests
const STATUS = path.join(DATA, 'partner-sites-status.json');
/* One run at a time: the watcher, the nightly rebuild and a hand run must not write the map together. */
const LOCK = path.join(DATA, 'partner-routes.lock');
let locked = false;
function lock() {
  try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 10 * 60_000) fs.rmSync(LOCK, { force: true }); } catch { /* none */ }
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); locked = true; return true; } catch { return false; }
}
const LOG = path.join(DATA, 'partner-routes.log');
const API = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
/* The addresses this box answers on. A binding may be tied to either, so a domain counts as served if EITHER answers (see CLAUDE.md). */
const ADDRS = ['192.168.46.88', '127.0.0.1'];
/* Hosts that are ours. Never routed to a partner design, whatever a tenant row says. */
const OWN = new Set(['investoyard.com', 'www.investoyard.com', 'allotment.investoyard.com', 'newipoapi.finwave.co', 'console.finwave.co', 'localhost']);
const HOST_RE = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const { SITE_TEMPLATES, partnerSiteGate } = require(path.join(ROOT, 'packages', 'shared-types', 'dist'));
const DESIGNS = SITE_TEMPLATES.map((t) => t.id).filter((id) => id !== 'default');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const quiet = args.includes('--quiet');
/* The watcher runs this every ~20 s: log a run only when something happened, or the log is noise. */
const logChangesOnly = args.includes('--log-changes-only');
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const out = [];
const say = (s = '') => { out.push(s); if (!quiet) console.log(s); };
function finish(code, summary) {
  /* One line per run in the log even when quiet, so a schedule that silently stopped working shows up as a gap. */
  try { fs.mkdirSync(DATA, { recursive: true }); if (!(logChangesOnly && code === 0 && /^ok: no change/.test(summary))) fs.appendFileSync(LOG, `${new Date().toISOString()} ${summary}\n` + (code ? out.map((l) => '  ' + l).join('\n') + '\n' : '')); } catch { /* never the thing that fails */ }
  if (locked) { try { fs.rmSync(LOCK, { force: true }); } catch { /* gone */ } }
  if (quiet && code) console.error(out.join('\n'));
  process.exit(code);
}

/* ------------------------------------------------------------------ status */
/** What the admin panel shows. Merged, so the watcher's own fields (a rebuild in progress) survive. */
function writeStatus(rows, extra = {}) {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch { /* first run */ }
  const partners = {};
  const now = new Date().toISOString();
  for (const r of rows) {
    const old = (prev.partners || {})[r.slug] || {};
    partners[r.slug] = { ...old, domain: r.domain === '-' ? null : r.domain, design: r.design, state: r.state, message: r.status, checkedAt: now,
      liveDesign: r.state === 'live' ? r.design : (r.state === 'blocked' || r.state === 'off' || r.state === 'own' ? null : old.liveDesign ?? null),
      liveSince: r.state === 'live' ? (old.state === 'live' && old.liveDesign === r.design ? old.liveSince : now) : null };
  }
  try { fs.mkdirSync(DATA, { recursive: true }); const tmp = STATUS + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ ...prev, ...extra, updatedAt: now, partners }, null, 2)); fs.renameSync(tmp, STATUS); } catch { /* the panel just shows an older status */ }
}

/* ------------------------------------------------------------------ fetch */
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

/** GET https://<host>/ through this box, with the real SNI and Host. Resolves { status, body } or null. */
function probe(host, addr, pathname = '/') {
  return new Promise((resolve) => {
    const req = https.get({ host: addr, servername: host, path: pathname, headers: { Host: host, 'User-Agent': 'investoyard-partner-routes' }, timeout: 30000 }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => { if (s.length < 400000) s += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: s }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
  });
}
async function served(host) {
  /* The first request after a config change can be slow (measured >15 s on this box), so one retry. */
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const a of ADDRS) { const r = await probe(host, a); if (r && r.status === 200) return r; }
  }
  return null;
}
const variantOf = (body) => ((body || '').match(/<html[^>]*\sdata-variant="([a-z0-9-]+)"/) || [])[1] || null;

/* ------------------------------------------------------------------ the map */
function xml(entries) {
  const lines = entries.map(([k, v]) => `    <add key="${k}" value="${v}" />`);
  return [
    '<rewriteMaps>',
    '  <!-- Written by scripts/partner-routes.js. Host -> partner design. Do not edit by hand; run the script. -->',
    '  <rewriteMap name="PartnerDesign" defaultValue="">',
    ...lines,
    '  </rewriteMap>',
    '</rewriteMaps>',
    '',
  ].join('\n');
}
function parseMap(text) {
  const m = new Map();
  for (const x of (text || '').matchAll(/<add key="([^"]+)" value="([^"]+)"/g)) m.set(x[1], x[2]);
  return m;
}
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function touch(file) { const now = new Date(); fs.utimesSync(file, now, now); }

/* ------------------------------------------------------------------ main */
(async () => {
  if (!lock()) { say('another partner-routes run is in progress; leaving it to that run.'); finish(0, 'ok: no change (busy)'); }
  if (argOf('--enable') || argOf('--disable')) {
    say('The go-live switch is in admin now: Partners → the partner → Site layout → "Partner site live" (Super Admin).');
    finish(2, 'refused: --enable/--disable retired');
  }

  const cfg = fs.existsSync(WEBCFG) ? fs.readFileSync(WEBCFG, 'utf8') : '';
  const wired = cfg.includes('configSource="partner-routes.config"');
  if (!wired) say('NOTE: the live web.config does not read partner-routes.config yet - publish the website first (cd apps/web && npm run deploy).');

  let tenants;
  try { tenants = await getJson(`${API}/tenants`); }
  catch (e) { say(`ABORT: cannot read the tenant list (${e.message}). Routes left exactly as they are.`); finish(1, 'abort: tenant list unreadable'); }
  if (!Array.isArray(tenants) || !tenants.some((t) => t && t.type === 'direct')) { say('ABORT: the tenant list looks wrong (no direct tenant). Routes left exactly as they are.'); finish(1, 'abort: tenant list looks wrong'); }

  const want = new Map(); // host -> design
  const rows = [];
  for (const t of tenants) {
    if (!t || t.type === 'direct') continue;
    const design = t.content && t.content.site && t.content.site.template;
    const dom = String(t.customDomain || '').trim().toLowerCase().replace(/\.$/, '');
    const row = { slug: t.slug, domain: dom || '-', design: design || 'default', status: '', state: '' };
    rows.push(row);
    if (t.siteLive !== true) { row.state = 'off'; row.status = 'not switched live (admin: Partner site live)'; continue; }
    const missing = partnerSiteGate({ name: t.name, content: t.content });
    if (missing.length) { row.state = 'blocked'; row.status = 'switched live, but missing: ' + missing.join(', '); continue; }
    if (!dom) { row.state = 'blocked'; row.status = 'no custom domain'; continue; }
    if (!design || design === 'default') { row.state = 'own'; row.status = 'our own layout - not routed (served by investoyard.com pages)'; continue; }
    if (!DESIGNS.includes(design)) { row.state = 'blocked'; row.status = `unknown design "${design}" - not routed`; continue; }
    if (!HOST_RE.test(dom) || OWN.has(dom) || OWN.has(dom.replace(/^www\./, ''))) { row.state = 'blocked'; row.status = 'domain refused (not a valid partner host)'; continue; }
    const index = path.join(LIVE, '_partner', design, 'index.html');
    let html = '';
    try { html = fs.readFileSync(index, 'utf8'); } catch { /* missing */ }
    if (variantOf(html) !== design) { row.state = 'rebuild'; row.status = `design "${design}" is not published at _partner/${design}/ - run publish-live`; continue; }
    if (!html.includes(`"${dom}"`)) { row.state = 'rebuild'; row.status = 'domain not in the published build - rebuild needed (publish-live)'; continue; }
    row.state = 'live';
    row.status = 'ROUTED';
    want.set(dom, design);
    const twin = dom.startsWith('www.') ? dom.slice(4) : `www.${dom}`;
    if (!OWN.has(twin)) want.set(twin, design);
  }

  say('partner          domain                       design     status');
  for (const r of rows) say(`${r.slug.slice(0, 16).padEnd(16)} ${r.domain.slice(0, 28).padEnd(28)} ${r.design.padEnd(10)} ${r.status}`);
  say('');

  const before = parseMap(fs.existsSync(MAP) ? fs.readFileSync(MAP, 'utf8') : '');
  const entries = [...want.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const same = before.size === want.size && entries.every(([k, v]) => before.get(k) === v);
  const removed = [...before.keys()].filter((k) => !want.has(k));
  say(`routes now: ${before.size ? [...before].map(([k, v]) => `${k}->${v}`).join(', ') : 'none'}`);
  say(`routes wanted: ${entries.length ? entries.map(([k, v]) => `${k}->${v}`).join(', ') : 'none'}`);
  writeStatus(rows);
  if (same && fs.existsSync(MAP)) { say('no change.'); finish(0, `ok: no change (${entries.length} routes)`); }
  if (!apply) { say('dry run - nothing written. Add --apply to write.'); finish(0, 'dry run'); }
  if (!wired) { say('REFUSED: the live web.config does not read the routes yet, so writing them would do nothing.'); finish(1, 'refused: web.config not wired'); }

  const oldText = fs.existsSync(MAP) ? fs.readFileSync(MAP, 'utf8') : null;
  writeAtomic(MAP, xml(entries));
  touch(WEBCFG);
  say('routes written; checking…');

  const problems = [];
  const home = await served('investoyard.com');
  if (!home || home.body.length < 100000 || variantOf(home.body)) problems.push(`investoyard.com home page did not come back as ours (${home ? home.status + ', ' + home.body.length + ' bytes' : 'no answer'})`);
  for (const [host, design] of entries) {
    if (host.startsWith('www.') && entries.some(([k]) => k === host.slice(4))) continue; // a www twin may have no binding; the apex is the check
    const r = await served(host);
    if (!r) { problems.push(`${host}: no answer on this box`); continue; }
    if (variantOf(r.body) !== design) { problems.push(`${host}: served "${variantOf(r.body) || 'our pages'}", expected "${design}"`); continue; }
    /* The design's code must load from its own folder, or the page is unstyled and dead. */
    const asset = (r.body.match(new RegExp(`/_v/${design}/_next/static/[^"'\\s]+\\.(?:css|js)`)) || [])[0];
    if (!asset) problems.push(`${host}: the page names no /_v/${design}/ asset — was it built with its asset prefix?`);
    else {
      let a = null;
      for (const addr of ADDRS) { a = await probe(host, addr, asset); if (a && a.status === 200) break; }
      if (!a || a.status !== 200) problems.push(`${host}: ${asset} did not load (${a ? a.status : 'no answer'})`);
    }
    /* /admin stays on our site: the partner's own staff sign in there. */
    let adm = null;
    for (const addr of ADDRS) { adm = await probe(host, addr, '/admin/'); if (adm && adm.status === 200) break; }
    if (!adm || adm.status !== 200 || variantOf(adm.body)) problems.push(`${host}: /admin/ is not our admin any more (${adm ? adm.status : 'no answer'})`);
  }
  for (const host of removed) {
    if (host.startsWith('www.')) continue;
    const r = await served(host);
    if (r && variantOf(r.body)) problems.push(`${host}: still serves a partner design after being taken off`);
  }

  if (problems.length) {
    say('PROBLEM - restoring the previous routes:');
    for (const p of problems) say('  ' + p);
    if (oldText === null) fs.rmSync(MAP, { force: true }); else writeAtomic(MAP, oldText);
    /* A missing map file would take the whole site down (web.config names it), so restore a blank one rather than none. */
    if (!fs.existsSync(MAP)) writeAtomic(MAP, xml([]));
    touch(WEBCFG);
    const back = await served('investoyard.com');
    say(`after restore: investoyard.com ${back ? back.status + ', ' + back.body.length + ' bytes' : 'NO ANSWER - check the site now'}`);
    for (const r of rows) if (r.state === 'live') { r.state = 'failed'; r.status = 'could not be switched: ' + problems.join('; '); }
    writeStatus(rows, { lastProblem: { at: new Date().toISOString(), problems } });
    finish(1, 'rolled back: ' + problems.join('; '));
  }
  say(`done: ${entries.length} route(s) live, all checks passed.`);
  finish(0, `ok: applied ${entries.length} routes (${entries.map(([k, v]) => k + '->' + v).join(', ') || 'none'})`);
})();
