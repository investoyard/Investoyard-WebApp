#!/usr/bin/env node
/**
 * Render /platform to apps/web/public/Investoyard-Platform-Overview.pdf.
 *
 *   node scripts/build-platform-pdf.js                      # from the dev server (4300)
 *   node scripts/build-platform-pdf.js https://investoyard.com/platform
 *
 * THE PDF IS NOT A SECOND DOCUMENT. It is the /platform page printed through
 * the `@media print` rules in platform.css, so the file and the page cannot
 * disagree about a feature, a figure or a disclaimer. Edit
 * apps/web/app/platform/content.ts, re-run this, and both move together. Never
 * hand-edit the PDF — the next run silently reverts it.
 *
 * NO NEW DEPENDENCY. Chrome and Edge are both installed on this box and either
 * prints to PDF from the command line, so this needs no puppeteer and no
 * ~150 MB Chromium download. pdf-lib is already a dependency (it is what fills
 * the ASBA forms) and is used here only to report the page count back.
 *
 * WHY `--virtual-time-budget` RATHER THAN A SLEEP: headless Chrome exits as
 * soon as it thinks the page is done, which can beat the webfonts. Inter and
 * Plus Jakarta load from the root layout, and a PDF rendered before they land
 * is laid out in a fallback face — subtly wrong line breaks, not an obvious
 * failure. The budget lets virtual time run on until the page is quiet.
 *
 * The output goes in apps/web/public, so it ships with the static export and is
 * downloadable at /Investoyard-Platform-Overview.pdf as well as being a file
 * the operator can attach to an email or forward on WhatsApp.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/* Two documents share this script: /platform for distribution partners and
   /brokers for SEBI-registered stock brokers. Both print through the same
   stylesheet, so one generator keeps them in step. */
const DOCS = {
  platform: { url: 'http://localhost:4300/platform/', out: 'Investoyard-Platform-Overview.pdf' },
  brokers:  { url: 'http://localhost:4300/brokers/',  out: 'Investoyard-For-Brokers.pdf' },
  /* The PUBLIC /partner-api page, not the admin docs screen. The admin page is
     auth-gated, carries the admin shell and an operator-only dry-run TESTER,
     and documents only print-forms — the public page additionally covers the
     two catalogue reads, the error table and the limits, so it is both the
     cleaner source and the more complete one. Its print rules drop the
     narrative sections so the PDF is API detail alone. */
  api:      { url: 'http://localhost:4300/partner-api/', out: 'Investoyard-Partner-API.pdf' },
};
const which = DOCS[process.argv[2]] ? process.argv[2] : null;
const URL = which ? DOCS[which].url : (process.argv[2] || DOCS.platform.url);
const OUT = path.join(__dirname, '..', 'apps', 'web', 'public',
  which ? DOCS[which].out : (process.argv[3] || DOCS.platform.out));

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
  for (const b of BROWSERS) if (fs.existsSync(b)) return b;
  throw new Error('no Chrome or Edge found — looked in:\n  ' + BROWSERS.join('\n  '));
}

(async () => {
  const browser = findBrowser();
  console.log(`browser : ${path.basename(browser)}`);
  console.log(`source  : ${URL}`);
  console.log(`output  : ${OUT}`);

  const before = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  execFileSync(browser, [
    '--headless',
    '--disable-gpu',
    /* Chrome's own header/footer prints the URL, the date and a page number in
       a system font across every sheet. On a branded document that reads as a
       browser printout rather than a publication, so it is off and the cover
       carries the version and date instead. */
    '--no-pdf-header-footer',
    '--virtual-time-budget=20000',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${OUT}`,
    URL,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });

  if (!fs.existsSync(OUT)) throw new Error('chrome reported success but wrote no file');
  const size = fs.statSync(OUT).size;

  /* Report the page count, because the failure this catches is silent: a print
     stylesheet that loses a page break still produces a perfectly valid PDF. */
  let pages = '?';
  try {
    const { PDFDocument } = require(path.join(__dirname, '..', 'apps', 'api', 'node_modules', 'pdf-lib'));
    pages = (await PDFDocument.load(fs.readFileSync(OUT))).getPageCount();
  } catch {
    try {
      const { PDFDocument } = require('pdf-lib');
      pages = (await PDFDocument.load(fs.readFileSync(OUT))).getPageCount();
    } catch { /* page count is a nicety, not the job */ }
  }

  console.log(`\nwrote ${(size / 1024).toFixed(0)} KB, ${pages} page(s)` +
    (before ? `  (was ${(before / 1024).toFixed(0)} KB)` : ''));
  if (size < 20_000) console.log('!! suspiciously small — check the page actually rendered at that URL');
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
