#!/usr/bin/env node
/*
 * Refuse a partner export that is not what it claims to be.
 *
 * Two failures this exists for, both of which exit 0 from `next build` with a
 * perfect-looking log:
 *  - THE WRONG VARIANT. The first Bento build compiled Sterling, because a
 *    tsconfig path beat the webpack alias. Every page now stamps the compiled
 *    variant on <html data-variant>; this compares it with the folder name.
 *  - A THIN CATALOGUE. The data layer already throws on an empty API, but a
 *    page-count floor costs nothing and catches anything else that shrinks it.
 *
 * Usage: node scripts/check-export.mjs <variant>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const variant = process.argv[2];
if (!variant) { console.error('usage: check-export.mjs <variant>'); process.exit(2); }
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/* A preview build writes elsewhere (PARTNER_EXPORT_DIR); check the folder the build actually wrote. */
const root = process.env.PARTNER_EXPORT_DIR ? path.resolve(appDir, process.env.PARTNER_EXPORT_DIR) : path.join(appDir, 'out', variant);
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

const read = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const index = read('index.html');
ok(index.length > 20_000, `index.html exists and is substantial (${index.length.toLocaleString()} bytes)`);
const stamped = (index.match(/data-variant="([^"]+)"/) || [])[1];
ok(stamped === variant, `index.html was compiled from variant "${stamped}" (expected "${variant}")`);
const detail = read('ipos/JPL/index.html');
ok((detail.match(/data-variant="([^"]+)"/) || [])[1] === variant, 'an IPO detail page carries the same variant stamp');
let pages = 0;
try { pages = fs.readdirSync(path.join(root, 'ipos')).filter((d) => fs.existsSync(path.join(root, 'ipos', d, 'index.html'))).length; } catch { /* none */ }
ok(pages >= 1000, `IPO detail pages: ${pages} (floor 1000)`);
for (const p of ['subscription/index.html', 'allotment/index.html', 'ipos/index.html', 'calendar/index.html']) ok(read(p).length > 5_000, `${p} present`);
/* The partner's own legal pages. Their text is fetched in the browser, so the baked page is only the frame. */
for (const p of ['about', 'terms', 'privacy', 'disclaimer']) ok(read(`${p}/index.html`).length > 2_000, `${p}/index.html present`);
/*
 * investoyard.com's own addresses, answered in the design. A partner domain may
 * have served our site before, so search engines hold these for it; a design
 * missing one would turn an indexed link into a "not found".
 */
for (const p of ['ipos/open', 'ipos/upcoming', 'ipos/listed', 'ipos/archive', 'sme', 'subscription/v2', 'privacy-policy',
  'faqs', 'glossary', 'news', 'performance', 'gmp', 'contact']) ok(read(`${p}/index.html`).length > 2_000, `${p}/index.html present (investoyard.com address)`);
let slugPages = 0;
try { slugPages = fs.readdirSync(path.join(root, 'ipos')).filter((d) => /-ipo$/.test(d) && fs.existsSync(path.join(root, 'ipos', d, 'index.html'))).length; } catch { /* none */ }
ok(slugPages >= 500, `IPO pages at their long investoyard.com address: ${slugPages} (floor 500)`);
/* A production build must never carry the sample broker (an invented company on a real domain); a preview build must. */
/* A live build's code and styles must come from its own folder (/_v/<variant>/_next/), never /_next/, which belongs to investoyard.com's site on the same domain. */
const prefix = process.env.PARTNER_ASSET_PREFIX;
if (prefix) ok(index.includes(`${prefix}/_next/`) && !/["']\/_next\//.test(index), `assets load from ${prefix}/_next/ and nothing from /_next/`);
ok(fs.existsSync(path.join(root, 'sw.js')), 'sw.js present (retires the old service worker on a domain that served our site)');
const sample = index.includes('Meru Securities');
const preview = !!process.env.PARTNER_BASE_PATH;
ok(preview ? sample : !sample, preview ? 'preview build carries the sample broker' : 'production build carries no sample broker');

if (fails.length) { console.error(`\nREFUSED: ${fails.length} check(s) failed for ${variant}`); process.exit(1); }
console.log(`\n${variant}: export verified`);
