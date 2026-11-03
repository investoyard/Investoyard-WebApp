#!/usr/bin/env node
/**
 * The nightly web rebuild.
 *
 *
 * WHY IT EXISTS: THE STATIC EXPORT GOES WRONG THE DAY AFTER IT IS BUILT
 *
 * Two separate costs, and the second is the one that forced this.
 *
 *   1. Data goes stale. The export bakes subscription figures, GMP, stage chips
 *      and reservation tables for every one of ~2,643 pages. A page built
 *      yesterday prints yesterday's book.
 *   2. HYDRATION BREAKS. The home page's content SELECTION is day-derived - with
 *      the clock pinned a day forward, whole IPOs swap in and out (measured
 *      2026-11-03: HGSINDIALT out, VPFL and ANTALA in). So the first client
 *      render disagrees with the baked HTML, React reports #418, and because it
 *      is outside a Suspense boundary it abandons the server HTML and
 *      re-renders the whole root (#423) - throwing away the entire point of a
 *      static export. A label fix cannot reach that; only rebuilding can.
 *
 * So this is not housekeeping. A day-old export is a measurably worse page.
 *
 *
 * WHY 04:30 AND NOT 04:00
 *
 * Both IIS app pools recycle on a fixed 04:00 schedule. A build starting then
 * would fetch 2,643 pages' worth of data through a pool that is restarting, and
 * the first request after a recycle has been measured at 10.6 s. 04:30 is after
 * that settles and 5.5 hours clear of the 10:00 poll window, so it can neither
 * be slowed by the recycle nor compete with the poller.
 *
 *
 * WHAT IT REFUSES TO DO
 *
 * It will not publish UNCOMMITTED work. A build reads the filesystem, not
 * HEAD, so a half-finished change left under apps/web or a shared package
 * would go live at 04:30 with nobody watching. The publish gate catches a
 * build that broke, never one that is simply not finished.
 *
 * It will not build against an API it cannot reach. `safeGet` swallows a dead
 * API and collapses every dynamic route to the `no-ipos` placeholder, and that
 * build EXITS 0 with a log reading "Generating static pages" - which is exactly
 * how a deploy once baked 6 ipo pages against 2,639 live. The publish gate
 * catches it, but an unattended job that wastes its build every night and
 * reports success is worse than one that stops and says why.
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'apps', 'web');
const LOGDIR = 'C:/ProgramData/Investoyard';
const LOG = path.join(LOGDIR, 'daily-rebuild.log');
/* One row per run, the same shape as origin-connection-health.csv, so a run
   that silently stopped happening is visible as a gap rather than as nothing. */
const CSV = path.join(LOGDIR, 'daily-rebuild-health.csv');

const started = Date.now();
const lines = [];
function say(s) {
  const line = s;
  lines.push(line);
  process.stdout.write(line + '\n');
}
function flush() {
  try {
    fs.mkdirSync(LOGDIR, { recursive: true });
    fs.appendFileSync(LOG, lines.join('\n') + '\n');
  } catch { /* a diagnostic must never be the thing that fails the job */ }
}
function csv(status, detail) {
  try {
    fs.mkdirSync(LOGDIR, { recursive: true });
    if (!fs.existsSync(CSV)) {
      fs.appendFileSync(CSV, 'at,status,seconds,indexBytes,ipoPages,detail\n');
    }
    const secs = Math.round((Date.now() - started) / 1000);
    fs.appendFileSync(CSV, [
      new Date().toISOString(), status, secs,
      detail.indexBytes ?? '', detail.ipoPages ?? '',
      JSON.stringify(detail.note ?? '').replace(/,/g, ';'),
    ].join(',') + '\n');
  } catch { /* same */ }
}
function done(code, status, detail = {}) {
  say(`-- ${status} in ${Math.round((Date.now() - started) / 1000)}s --`);
  flush();
  csv(status, detail);
  process.exit(code);
}

say('');
say(`=== daily-rebuild ${new Date().toISOString()} ===`);

/* ------------------------------------------------------------- clean tree */
/* THIS PUBLISHES THE WORKING TREE, NOT THE LAST COMMIT. `next build` reads the
   filesystem, and neither this script nor the publish gate knows anything about
   git - so WIP left under apps/web goes live at 04:30 with nobody watching.

   WATCHED PATHS are what the web build actually READS: apps/web plus the two
   packages it imports (shared-types compiles to dist, i18n supplies the
   dictionaries). apps/api is deliberately absent - it cannot reach the export.

   THE CRLF PHANTOM IS WHY THIS IS NOT ONE `git status` CALL. core.autocrlf is
   true, so git stores LF while the Write tool emits LF into a CRLF file, and
   `git status` can then report a file MODIFIED whose content diff is EMPTY
   (CLAUDE.md records exactly this on its own file). Guarding on status alone
   would block every rebuild from then on with no diff to show for it, and a
   guard that can only fail is worse than no guard. So an unstaged tracked
   modification is CONFIRMED against `git diff --numstat` and a phantom is
   reported and ignored; anything untracked or staged is real whatever the
   diff says.

   It runs FIRST because it is the one check with no side effect and no
   network: if the answer is no, nothing should have been started.

   `--allow-dirty` is for a run BY HAND. The scheduled task never passes it. */
const WATCH = ['apps/web', 'packages/shared-types', 'packages/i18n'];
const allowDirty = process.argv.includes('--allow-dirty');

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || r.error || '') };
}

function dirtyPaths() {
  const st = git(['status', '--porcelain', '--'].concat(WATCH));
  if (st.code !== 0) return { error: st.err.trim() || 'git status failed' };
  const real = [];
  const phantom = [];
  for (const line of st.out.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    /* porcelain v1 is "XY <path>", and a rename carries "old -> new". */
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow >= 0) p = p.slice(arrow + 4);
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    /* Only a purely UNSTAGED modification can be a line-ending phantom. */
    if (!(code[0] === ' ' && code[1] === 'M')) { real.push(code + ' ' + p); continue; }
    const d = git(['diff', '--numstat', '--', p]);
    if (d.code === 0 && d.out.trim() === '') phantom.push(p);
    else real.push(code + ' ' + p);
  }
  return { real, phantom };
}

if (allowDirty) {
  say('--allow-dirty: publishing the working tree as it stands');
} else {
  const tree = dirtyPaths();
  if (tree.error) {
    /* A GIT FAILURE IS NOT A CLEAN TREE. Refusing is the safe direction: the
       whole point of this check is to know what is about to be published. */
    say('ABORT: cannot read git status, so nothing can be said about what would publish.');
    say('  ' + tree.error);
    done(1, 'abort-git-unreadable', { note: tree.error.slice(0, 100) });
  }
  if (tree.phantom.length) {
    say('ignoring ' + tree.phantom.length + ' line-ending-only change(s): ' + tree.phantom.join(', '));
  }
  if (tree.real.length) {
    say('ABORT: uncommitted work under a path the web build reads.');
    for (const r of tree.real) say('  ' + r);
    say('A deploy publishes the WORKING TREE, so this would go live. Commit it,');
    say('stash it, or run by hand with --allow-dirty. Nothing was touched.');
    done(1, 'abort-dirty-tree', { note: tree.real.length + ' dirty path(s)' });
  }
  say('tree clean under ' + WATCH.join(', '));
}

/* ---------------------------------------------------------------- forwarder */
function forwarderOk() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'api-forward.js'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') };
}

let fw = forwarderOk();
if (!fw.ok) {
  /* IT IS STARTED HERE RATHER THAN ASSUMED, because the forwarder runs
     detached and does not survive a reboot. An unattended rebuild that dies
     every time the box restarts would be a rebuild nobody notices has gone. */
  say('forwarder not answering; starting it');
  const out = fs.openSync(path.join(LOGDIR, 'api-forward.log'), 'a');
  spawn(process.execPath, [path.join(ROOT, 'scripts', 'api-forward.js')],
    { cwd: ROOT, detached: true, stdio: ['ignore', out, out] }).unref();
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    /* spawnSync, not execSync with a template string: process.execPath is
       "C:Program Files
odejs
ode.exe" and the space breaks shell quoting. */
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
    fw = forwarderOk();
    if (fw.ok) break;
  }
}
if (!fw.ok) {
  say('ABORT: the API is not reachable on the build path.');
  say(fw.out.trim().split('\n').map((l) => '  ' + l).join('\n'));
  say('Building now would bake placeholder pages. Nothing was touched.');
  done(1, 'abort-no-api', { note: 'forwarder/API unreachable' });
}
say('forwarder ok');

/* ------------------------------------------------------------ the live state */
function liveState() {
  try {
    return {
      indexBytes: fs.statSync(path.join(WEB, 'out', 'index.html')).size,
      ipoPages: fs.readdirSync(path.join(WEB, 'out', 'ipos')).length,
    };
  } catch { return { indexBytes: 0, ipoPages: 0 }; }
}
const before = liveState();
say(`live before: index ${before.indexBytes} bytes, ${before.ipoPages} ipo pages`);

/* --------------------------------------------------------------- the EISDIR trap */
/* `next dev` leaves DIRECTORIES named <SYMBOL>.html / .rsc under .next/server/app
   and the export then dies EISDIR on every one. Searched across the WHOLE tree,
   not the one path a note happens to name - that mistake cost a cache rebuild. */
function strayDirs() {
  const base = path.join(WEB, '.next', 'server', 'app');
  const found = [];
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (!e.isDirectory()) continue;
      if (/\.(html|rsc)$/i.test(e.name)) found.push(p);
      else walk(p);
    }
  };
  walk(base);
  return found;
}
const stray = strayDirs();
if (stray.length) {
  say(`removing ${stray.length} stray .html/.rsc directory(ies) left by a dev server`);
  for (const p of stray) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { } }
}

/* ------------------------------------------------------------------ caches */
/* out-staging is cleared BY US. Next clears its own export directory first and
   that clear has raced twice (ENOTEMPTY, ENOENT); removing it beforehand takes
   Next's clear step out of the equation. */
try { fs.rmSync(path.join(WEB, 'out-staging'), { recursive: true, force: true }); say('out-staging cleared'); } catch { }
/* fetch-cache ONLY. `safeGet` uses a cacheable fetch, so yesterday's responses
   would be replayed and the whole point of a daily rebuild lost. The sibling
   webpack folder is ~400 MB of compilation cache and must be left alone. */
try { fs.rmSync(path.join(WEB, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true }); say('fetch-cache cleared (webpack cache kept)'); } catch { }

/* ------------------------------------------------------------------- build */
function deploy() {
  const r = spawnSync('npm', ['run', 'deploy'], {
    cwd: WEB, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

let attempt = deploy();
if (attempt.code !== 0) {
  /* ONE RETRY, and it is evidenced rather than hopeful: both the next/font
     flake and the EISDIR race have succeeded on the first retry, and an
     unattended job that gives up on a transient fault loses the whole day. */
  say(`deploy failed (exit ${attempt.code}); retrying once`);
  const tail = attempt.out.trim().split('\n').slice(-12);
  say(tail.map((l) => '  | ' + l).join('\n'));
  try { fs.rmSync(path.join(WEB, 'out-staging'), { recursive: true, force: true }); } catch { }
  attempt = deploy();
}

const gate = attempt.out.split('\n').filter((l) => /^\s{2}(OK|FAIL)\s/.test(l));
if (gate.length) say(gate.map((l) => '  ' + l.trim()).join('\n'));

if (attempt.code !== 0) {
  say(`ABORT: deploy failed twice (exit ${attempt.code}). The live site is untouched.`);
  say(attempt.out.trim().split('\n').slice(-20).map((l) => '  | ' + l).join('\n'));
  const now = liveState();
  done(1, 'deploy-failed', {
    ...now,
    note: `exit ${attempt.code}; live index ${now.indexBytes}`,
  });
}

/* ------------------------------------------------------------------ verify */
const after = liveState();
say(`live after : index ${after.indexBytes} bytes, ${after.ipoPages} ipo pages`);

/* A published page count that fell off a cliff is the failure the gate exists
   for, so it is checked again here from the FILESYSTEM rather than trusted
   from the build's own account of itself. */
if (after.ipoPages < Math.floor(before.ipoPages * 0.8) || after.indexBytes < 1_000_000) {
  say('ABORT: the published output looks wrong after a deploy that reported success.');
  done(1, 'published-looks-wrong', { ...after, note: `was ${before.ipoPages} pages` });
}

done(0, 'ok', { ...after, note: `${after.ipoPages} pages` });
