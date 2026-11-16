import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * ONE EXPORT PER DESIGN VARIANT.
 *
 * A static export answers every visitor with the same HTML, so one build can
 * only ever be one design. The previous partner "themes" tried to be four
 * designs in one build and ended up as colour swaps of our own pages. Here the
 * variant is chosen at BUILD time: `@variant` resolves to
 * src/variants/<PARTNER_VARIANT>, and only that folder's components and CSS
 * are compiled. Variants share the data layer (src/core + shared-types) and
 * nothing visual.
 *
 * IIS sends each partner's domain to its variant's export. In production the
 * exports sit side by side, so each carries its own asset prefix
 * (/_v/<variant>/_next/...) and cannot collide with another's chunks.
 */
const variant = process.env.PARTNER_VARIANT || 'sterling';
const assetPrefix = process.env.PARTNER_ASSET_PREFIX || undefined;

/*
 * PREVIEW BUILDS live under investoyard.com/partner-preview/<variant>/, so the
 * admin's Site layout panel can show the real design in its live preview. A
 * base path prefixes every page, link and asset, so the five sit side by side
 * inside the web export without touching each other or our own pages. A
 * production build for a partner's own domain sets none of this.
 */
const basePath = process.env.PARTNER_BASE_PATH || undefined;
if (basePath && !/^\/[a-z0-9\/-]+[a-z0-9]$/.test(basePath)) throw new Error('PARTNER_BASE_PATH must look like /partner-preview/<variant>');

/*
 * THE VARIANT IS SELECTED THROUGH A PER-VARIANT TSCONFIG, NOT ONLY THE ALIAS.
 * Next resolves tsconfig `paths` BEFORE webpack aliases, so an `@variant`
 * entry in the shared tsconfig silently wins: the first Bento build compiled
 * Sterling, and the Sterling build was right only because Sterling was the
 * default. Each variant has tsconfig.<variant>.json mapping @variant to its
 * own folder, and the build reads that one. The layout stamps the compiled
 * variant's name on <html data-variant>, which the build check compares.
 */
const tsconfigPath = `tsconfig.${variant}.json`;
if (!fs.existsSync(path.join(here, tsconfigPath))) {
  throw new Error(`No ${tsconfigPath} for PARTNER_VARIANT="${variant}". Add one mapping @variant to src/variants/${variant}.`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  distDir: process.env.PARTNER_EXPORT_DIR || `out/${variant}`,
  trailingSlash: true,
  images: { unoptimized: true },
  assetPrefix,
  basePath,
  env: { PARTNER_VARIANT: variant, PARTNER_PREVIEW: basePath ? '1' : '' },
  typescript: { tsconfigPath },
  webpack(config) {
    config.resolve.alias['@variant'] = path.join(here, 'src', 'variants', variant);
    /*
     * ONE WEBPACK CACHE PER VARIANT. Every variant compiles inside the same
     * .next folder (an `output: export` build pins Next's own distDir to
     * .next), and the persistent cache remembered how `@variant` resolved —
     * so a Bento build straight after a Sterling one shipped Sterling, and
     * passed every log line doing it. A per-variant cache name keeps each
     * variant's compiled modules apart without clearing anything.
     */
    if (config.cache && typeof config.cache === 'object') {
      config.cache = { ...config.cache, name: `${config.cache.name || 'webpack'}-${variant}` };
    }
    return config;
  },
};

export default nextConfig;
