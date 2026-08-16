#!/usr/bin/env node
/*
 * Monorepo hoisting fixups for Expo (runs on postinstall; idempotent).
 *
 * npm splits the Expo packages across the two node_modules trees (the app's
 * React 19 peers conflict with the web app's React 18 at the root, so hoisting
 * is unpredictable). Two resolutions must ALWAYS work:
 *
 * 1. `expo` resolvable from the ROOT — root-hoisted packages (e.g.
 *    expo-router's app.plugin.js) require 'expo/config-plugins' from their own
 *    location. SDK 54 hoists expo-router to the root while `expo` stays in
 *    apps/mobile → "Cannot find module 'expo/config-plugins'".
 * 2. `expo-router` resolvable from the ROOT — babel-preset-expo (root) decides
 *    whether to run the router Babel transform via require.resolve from there.
 *
 * Whichever side npm left empty gets a junction to the app-local copy.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function log(msg) { console.log(`[link-expo-router] ${msg}`); }

function ensureRootResolvable(name) {
  // the package may sit in the app's tree OR nested inside expo's own
  // node_modules — and `expo` itself may be hoisted to the ROOT or app-local
  const candidates = [
    path.join(root, 'apps', 'mobile', 'node_modules', name),
    path.join(root, 'apps', 'mobile', 'node_modules', 'expo', 'node_modules', name),
    path.join(root, 'node_modules', 'expo', 'node_modules', name),
  ];
  const source = candidates.find((c) => fs.existsSync(c));
  const target = path.join(root, 'node_modules', name);
  if (!source) { log(`${name}: no app-local copy — nothing to link.`); return; }
  try {
    const st = fs.lstatSync(target);
    if (st.isSymbolicLink()) {
      if (fs.realpathSync(target) === fs.realpathSync(source)) { log(`${name}: already linked — ok.`); return; }
      fs.rmSync(target, { recursive: true, force: true });
    } else if (st.isDirectory()) {
      log(`${name}: real dir at root — ok.`);
      return;
    }
  } catch { /* target does not exist yet */ }
  // Junction ONLY — never copy: a copied package loses its node-resolution
  // context (its nested deps stay behind) and breaks in confusing ways.
  try {
    fs.symlinkSync(source, target, 'junction'); // 'junction' = Windows; flag ignored on POSIX
    log(`${name}: linked root -> ${path.relative(root, source)}`);
  } catch (e) {
    log(`${name}: junction failed (${e.code}) — close running Metro/expo and re-run: node scripts/link-expo-router.js`);
  }
}

// babel-preset-expo: root @babel/core resolves presets from ITS location — the
// preset ships nested under expo/node_modules on SDK 54, invisible from the root.
['expo', 'expo-router', 'babel-preset-expo'].forEach(ensureRootResolvable);
