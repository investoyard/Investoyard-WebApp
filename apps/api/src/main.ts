import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  // rawBody: true keeps the exact request bytes on req.rawBody so the WhatsApp
  // webhook can verify Meta's X-Hub-Signature-256 HMAC (re-serialized JSON won't match).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Separate-hosting: the browser calls the API cross-origin from the web app. The known
  // production web origins are ALWAYS allowed (so a missing/mistyped CORS_ORIGIN or an app-pool
  // restart can never break login); CORS_ORIGIN adds more (comma-separated). '*'/'true' = allow all.
  //
  // ONLY OUR OWN ORIGINS. newipo.finwave.co was briefly listed here while it
  // was treated as a retiring host of ours; it is now FINWAVE's white-label
  // domain and is allowed FROM THE DATABASE instead, by the customDomain
  // lookup below. That is not a stylistic preference: an origin hardcoded here
  // outlives the tenant row, so the day a partner domain is withdrawn in admin
  // this file would go on trusting it.
  const DEFAULT_ORIGINS = ['https://investoyard.com', 'https://www.investoyard.com'];
  const env = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const wildcard = env.includes('*') || env.includes('true');
  const allow = new Set([...DEFAULT_ORIGINS, ...env.filter((o) => o !== '*' && o !== 'true')]);
  const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  /*
   * A WHITE-LABEL PARTNER'S OWN DOMAIN IS ALLOWED FROM THE DATABASE, not from
   * this file. Until this existed the allow-list was our own origins and
   * nothing else, so a partner served on their own domain would
   * load the page shell and then have EVERY api call rejected by the browser —
   * catalogue, login, subscription, and `GET /tenants` itself, which is where
   * the branding comes from. The site would have rendered blank AND unbranded.
   *
   * Reading it from Tenant.customDomain is what makes a domain self-serve: an
   * operator sets it in admin and it is allowed within the cache window, with
   * no env edit and no pool restart. The alternative — listing partner domains
   * in CORS_ORIGIN — needs both, for every partner, forever.
   *
   * BOTH SCHEMES are allowed per host because a domain is reachable over plain
   * HTTP during setup, before win-acme has issued its certificate; the partner
   * would otherwise have to finish TLS before they could see anything work.
   * The host must still match a stored customDomain exactly — no `www.`
   * guessing, no suffix matching, since a loose rule here hands any attacker
   * who registers a lookalike host a browser-trusted path to the API.
   *
   * Tenant is NOT in PrismaService's SCOPED_MODELS, so this needs no tenant
   * context — which is just as well, since it runs before any request.
   */
  const prisma = app.get(PrismaService);
  let domainCache: { until: number; origins: Set<string> } = { until: 0, origins: new Set() };
  const DOMAIN_TTL_MS = 60_000;   // same shape as the poller's 60s config cache
  const RETRY_MS = 10_000;        // a failed read must not pin an empty set for a full minute

  const tenantOrigins = async (): Promise<Set<string>> => {
    if (Date.now() < domainCache.until) return domainCache.origins;
    try {
      const rows = await prisma.tenant.findMany({
        where: { customDomain: { not: null }, status: 'active' },
        select: { customDomain: true },
      });
      const origins = new Set<string>();
      for (const r of rows) {
        const host = String(r.customDomain ?? '').trim().toLowerCase();
        if (!host) continue;
        origins.add('https://' + host);
        origins.add('http://' + host);
      }
      domainCache = { until: Date.now() + DOMAIN_TTL_MS, origins };
    } catch {
      /* Keep whatever we last knew rather than locking every partner out while
         the database is briefly unreachable, and retry sooner than the TTL. */
      domainCache = { until: Date.now() + RETRY_MS, origins: domainCache.origins };
    }
    return domainCache.origins;
  };

  app.enableCors({
    origin: wildcard
      ? true
      : (origin, cb) => {
          if (!origin || allow.has(origin) || LOCAL.test(origin)) return cb(null, true);
          /* Never let a lookup fault become a thrown error inside the cors
             middleware — that surfaces as an opaque 500 on a preflight. */
          tenantOrigins().then((set) => cb(null, set.has(origin))).catch(() => cb(null, false));
        },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    /*
     * WITHOUT THIS THE PRINTED FORM DOWNLOADS AS `asba-form.pdf`, and the cause
     * is not the filename. `Content-Disposition` is not a CORS-safelisted
     * response header, so a cross-origin `fetch` — which every consumer call is,
     * investoyard.com reading newipoapi.finwave.co — gets `null` back from
     * `res.headers.get('Content-Disposition')` however correctly the server set
     * it. `downloadPdf` in the web client then falls through to its default
     * name. The API has always named these `SYMBOL_formNo.pdf`; the browser was
     * simply never allowed to read it. (Operator report, 2026-10-20.)
     */
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400, // cache preflight 24h
  });
  // Pass PORT through verbatim: a number/numeric-string for standalone runs, or a
  // named pipe (e.g. \\.\pipe\...) when hosted under IIS via iisnode. Number() would
  // turn the pipe into NaN and the server would fail to bind.
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
