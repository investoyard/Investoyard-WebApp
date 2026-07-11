/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export → IIS serves the `out/` folder directly (no Node server, no ARR/proxy).
  output: 'export',
  // Each route becomes a real folder + index.html (e.g. out/ipos/NIMBUS/index.html).
  // IIS auto-redirects /ipos/NIMBUS → /ipos/NIMBUS/ and serves index.html.
  trailingSlash: true,
  images: { unoptimized: true },
  // NOTE: must be hosted at the SITE ROOT (http://host/), not a sub-path like /IPO,
  // because the app uses plain <a href="/..."> links which basePath does not rewrite.
};
export default nextConfig;
