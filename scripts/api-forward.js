#!/usr/bin/env node
/**
 * The Host-header forwarder the WEB BUILD depends on.
 *
 * `apps/web/.env.production` sets `API_INTERNAL_URL=http://localhost:3000/api`,
 * and `apps/web/lib/api.ts` fetches every baked page through it. Nothing of
 * ours listens there on its own: under iisnode the API gets a NAMED PIPE and
 * IIS routes to it by `Host` header, so there is no TCP port to point at. This
 * fills that gap — it listens on 3000 and forwards to 127.0.0.1:80 with
 * `Host: newipoapi.finwave.co`.
 *
 *
 * WHY THIS IS A FILE IN THE REPO RATHER THAN SOMETHING SOMEONE REMEMBERS
 *
 * On 2026-10-30 a deploy baked SIX ipo pages against 2,639 live, with a 51 KB
 * index instead of 9.77 MB — and the log read `✓ Generating static pages
 * (109/109)` and exited 0. The cause was an unrelated project
 * (`gmtrade/src/server.js`) having taken port 3000 and answering `/api/health`
 * with a 302 to `/login`. `safeGet` swallowed it exactly as designed, every
 * dynamic route collapsed to the `no-ipos` placeholder, and only the page-count
 * floor in `scripts/publish-web.mjs` stopped it reaching the live site.
 *
 * A connection REFUSED and a 302 are swallowed identically, so freeing the port
 * does not fix it either — something has to answer. The build had evidently
 * been depending on a forwarder that existed on nobody's disk but the person
 * who started it.
 *
 *
 * IT PROXIES THE LIVE API AND NEVER STARTS A SECOND ONE
 *
 * The obvious alternative — `PORT=3000 node dist/main.js` — is wrong twice
 * over, and both are written up in CLAUDE.md:
 *
 *   - a second instance opens a SECOND CONNECTION POOL, and the live one
 *     already holds ~64 of this box's 100 slots. That is what P2037,
 *     "remaining connection slots are reserved for roles with the SUPERUSER
 *     attribute", looks like from the outside;
 *   - it starts a SECOND SUBSCRIPTION POLLER, which during market hours means
 *     two processes running deleteMany + createMany over the same rows.
 *
 * Forwarding has neither problem: the one live worker serves the build.
 *
 *
 * USAGE
 *     node scripts/api-forward.js            # listen on 3000
 *     node scripts/api-forward.js 3010       # another port
 *     node scripts/api-forward.js --check    # is it already up and real?
 *
 * `--check` exits 0 only when the configured port answers with OUR health
 * shape. That matters because a 200 proves nothing here: an unbound host falls
 * through to the IIS default site, and another app on the port answers
 * whatever it likes.
 */
const http = require('http');

const API_HOST = 'newipoapi.finwave.co';
const DEFAULT_PORT = 3000;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const port = Number(args.find((a) => /^\d+$/.test(a)) || DEFAULT_PORT);

/** Ask the port whether it is really us. */
function probe(cb) {
  const req = http.get(
    { host: '127.0.0.1', port, path: '/api/health', timeout: 8000 },
    (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let ok = false;
        try {
          const j = JSON.parse(body);
          /* `checks` and `uptimeSec` are OUR health shape. A bare
             {status:"ok"} is some other app, and that is the failure this
             whole file exists because of. */
          ok = res.statusCode === 200 && !!j && !!j.checks && typeof j.uptimeSec === 'number';
        } catch { ok = false; }
        cb(ok, res.statusCode, body.slice(0, 120));
      });
    },
  );
  req.on('timeout', () => { req.destroy(); cb(false, 0, 'timed out'); });
  req.on('error', (e) => cb(false, 0, e.code || e.message));
}

if (checkOnly) {
  probe((ok, status, body) => {
    if (ok) {
      console.log(`ok: port ${port} is serving the Investoyard API`);
      process.exit(0);
    }
    console.error(`NOT the Investoyard API on port ${port} (http ${status}): ${body}`);
    console.error('Start it with:  node scripts/api-forward.js');
    console.error('Without it the web build bakes placeholder pages and the publish gate refuses them.');
    process.exit(1);
  });
} else {
  let served = 0;
  let failed = 0;

  const server = http.createServer((req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: 80,
        method: req.method,
        path: req.url,
        /* The whole point: the inbound Host is `localhost:3000`, and IIS needs
           the API's own hostname to route to the right site. */
        headers: { ...req.headers, host: API_HOST },
      },
      (up) => {
        served++;
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      failed++;
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'api-forward: ' + e.message }));
    });
    req.pipe(upstream);
  });

  /* A second copy must not spam the log forever — say so once and stop, so a
     duplicate scheduled task is harmless. */
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      probe((ok) => {
        console.log(ok
          ? `port ${port} is already serving the API — nothing to do`
          : `port ${port} is taken by something that is NOT the API — see the note at the top of this file`);
        process.exit(ok ? 0 : 1);
      });
      return;
    }
    console.error('api-forward: ' + e.message);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[${new Date().toISOString()}] api-forward: 127.0.0.1:${port} -> 127.0.0.1:80  Host: ${API_HOST}`);
  });

  /* Long-running: a heartbeat makes a forwarder that has quietly stopped
     serving visible in the log rather than only in a failed build. */
  setInterval(
    () => console.log(`[${new Date().toISOString()}] api-forward: ${served} served, ${failed} failed`),
    15 * 60 * 1000,
  );
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      console.log(`[${new Date().toISOString()}] api-forward: stopping — ${served} served, ${failed} failed`);
      process.exit(0);
    });
  }
}
