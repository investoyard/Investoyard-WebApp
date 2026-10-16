/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export → IIS serves the `out/` folder directly (no Node server, no ARR/proxy).
  output: 'export',

  /*
   * THE BUILD NO LONGER WRITES TO THE DIRECTORY IIS IS SERVING.
   *
   * Next clears its export directory before writing it. On 2026-10-16 that
   * clear died half way — `ENOTEMPTY: rmdir out\hi\ipos`, almost certainly a
   * file handle held while IIS was serving from the same folder — and left
   * `out/` with no index.html and no web.config. `out/` is gitignored, so the
   * only recovery was a full 2,601-page rebuild: the site was down ~25 minutes
   * for a build whose pages had all generated successfully.
   *
   * With `output: 'export'`, Next treats `distDir` AS the export directory
   * (`hasCustomExportOutput` in next/dist/export/utils.js: `output === 'export'
   * && distDir !== '.next'`), and internally keeps `.next` for its own
   * manifests — so the ~180 MB webpack cache is untouched by this.
   *
   * So the build lands in `out-staging/`, and `npm run deploy` publishes it
   * into the live `out/` only after checking it. A build that dies at any
   * point now cannot touch what is being served.
   */
  distDir: process.env.WEB_EXPORT_DIR || 'out-staging',
  // Each route becomes a real folder + index.html (e.g. out/ipos/NIMBUS/index.html).
  // IIS auto-redirects /ipos/NIMBUS → /ipos/NIMBUS/ and serves index.html.
  trailingSlash: true,
  images: { unoptimized: true },
  // NOTE: must be hosted at the SITE ROOT (http://host/), not a sub-path like /IPO,
  // because the app uses plain <a href="/..."> links which basePath does not rewrite.
};
export default nextConfig;
