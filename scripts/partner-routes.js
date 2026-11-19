#!/usr/bin/env node
/**
 * Send each partner's domain to the design chosen for it in admin.
 *
 *   node scripts/partner-routes.js                  dry run: what would be routed, and why not
 *   node scripts/partner-routes.js --apply          write the routes (switched-on partners only)
 *   node scripts/partner-routes.js --enable finwave     switch a partner on   (add --apply to act now)
 *   node scripts/partner-routes.js --disable finwave    switch a partner off  (add --apply to act now)
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
 *  - A PARTNER MUST BE SWITCHED ON (--enable) before admin's choice reaches
 *    their domain. Once on, later design changes in admin apply on the next run
 *    by themselves. A partner on "our own layout" is never routed.
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
const DATA = 'C:/ProgramData/Investoyard';
const STATE = path.join(DATA, 'partner-sites.json');
const LOG = path.join(DATA, 'partner-routes.log');
const API = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
/* The addresses this box answers on. A binding may be tied to either, so a domain counts as served if EITHER answers (see CLAUDE.md). */
const ADDRS = ['192.168.46.88', '127.0.0.1'];
/* Hosts that are ours. Never routed to a partner design, whatever a tenant row says. */
const OWN = new Set(['investoyard.com', 'www.investoyard.com', 'allotment.investoyard.com', 'newipoapi.finwave.co', 'console.finwave.co', 'localhost']);
const HOST_RE = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const { SITE_TEMPLATES } = require(path.join(ROOT, 'packages', 'shared-types', 'dist'));
const DESIGNS = SITE_TEMPLATES.map((t) => t.id).filter((id) => id !== 'default');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const quiet = args.includes('--quiet');
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const out = [];
const say = (s = '') => { out.push(s); if (!quiet) console.log(s); };
function finish(code, summary) {
  /* One line per run in the log even when quiet, so a schedule that silently stopped working shows up as a gap. */
  try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${summary}\n` + (code ? out.map((l) => '  ' + l).join('\n') + '\n' : '')); } catch { /* never the thing that fails */ }
  if (quiet && code) console.error(out.join('\n'));
  process.exit(code);
}

/* ------------------------------------------------------------------ state */
function readState() {
  try { const j = JSON.parse(fs.readFileSync(STATE, 'utf8')); return { enabled: Array.isArray(j.enabled) ? j.enabled.filter((s) => typeof s === 'string') : [] }; }
  catch { return { enabled: [] }; }
}
function writeState(st) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ enabled: [...new Set(st.enabled)].sort(), updatedAt: new Date().toISOString() }, null, 2) + '\n');
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
  const st = readState();
  const en = argOf('--enable'), dis = argOf('--disable');
  if (en || dis) {
    const slug = en || dis;
    if (!/^[a-z0-9-]+$/.test(slug || '')) { say('usage: --enable <tenant-slug> | --disable <tenant-slug>'); finish(2, 'bad args'); }
    st.enabled = en ? [...st.enabled, slug] : st.enabled.filter((s) => s !== slug);
    writeState(st);
    say(`${slug} switched ${en ? 'ON' : 'OFF'}. Switched on: ${st.enabled.length ? st.enabled.join(', ') : 'nobody'}`);
    say('');
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
    const row = { slug: t.slug, domain: dom || '-', design: design || 'default', status: '' };
    rows.push(row);
    if (!dom) { row.status = 'no custom domain'; continue; }
    if (!design || design === 'default') { row.status = 'our own layout - not routed (served by investoyard.com pages)'; continue; }
    if (!DESIGNS.includes(design)) { row.status = `unknown design "${design}" - not routed`; continue; }
    if (!HOST_RE.test(dom) || OWN.has(dom) || OWN.has(dom.replace(/^www\./, ''))) { row.status = 'domain refused (not a valid partner host)'; continue; }
    const index = path.join(LIVE, '_partner', design, 'index.html');
    let html = '';
    try { html = fs.readFileSync(index, 'utf8'); } catch { /* missing */ }
    if (variantOf(html) !== design) { row.status = `design "${design}" is not published at _partner/${design}/ - run publish-live`; continue; }
    if (!html.includes(`"${dom}"`)) { row.status = 'domain not in the published build - rebuild needed (publish-live)'; continue; }
    if (!st.enabled.includes(t.slug)) { row.status = 'ready, but NOT SWITCHED ON (--enable ' + t.slug + ')'; continue; }
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
    if (variantOf(r.body) !== design) problems.push(`${host}: served "${variantOf(r.body) || 'our pages'}", expected "${design}"`);
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
    finish(1, 'rolled back: ' + problems.join('; '));
  }
  say(`done: ${entries.length} route(s) live, all checks passed.`);
  finish(0, `ok: applied ${entries.length} routes (${entries.map(([k, v]) => k + '->' + v).join(', ') || 'none'})`);
})();
