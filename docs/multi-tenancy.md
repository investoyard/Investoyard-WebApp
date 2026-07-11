# Multi-Tenancy Foundation

How Investoyard runs **B2C**, **Partner (B2B2C)**, and **White-label** on one codebase, one
database, one deployment. Architecture summary for stakeholders lives in the one-pager artifact;
this doc is the engineering foundation.

**Mental model:** one `Tenant` tree. B2C = the `platform` root. Partner = a `partner` node with
`branch` children (scoping decides who-sees-what). White-label = a partner with a `customDomain`
+ `branding` (a presentation concern, not a code fork). See
[`multitenant.proposal.prisma`](./multitenant.proposal.prisma) for the models.

> **Stack (chosen):** **NestJS (Node) + PostgreSQL**. Postgres is the recommended DB for a Node backend —
> best Prisma support, **JSONB** for the config cascade, mature RLS, and no licensing cost. **SQL Server is also
> supported** via Prisma's SQL Server driver — choose it only to reuse existing SQL Server ops/licences; then
> Postgres RLS ↔ **SQL Server Row-Level Security** (`CREATE SECURITY POLICY` + `SESSION_CONTEXT('tenant_scope')`)
> and the Prisma auto-scope extension is unchanged.

---

## 1. What to add to the schema
- **New models:** `Tenant` (self-referential tree), `Role` (tenant-aware, with a `scope`),
  `Membership` (User ↔ Tenant ↔ Role). Plus a `AuditEvent` with `tenantId`.
- **Add `tenantId`** to: `User, InvestorProfile, Consent, Application, WatchlistItem,
  DeviceToken, MemberCredential`.
- **Stays global** (shared reference data, no `tenantId`): the IPO catalog — `Ipo` and children.
- **New consent type:** `data_sharing_partner`.

> Do this **before** the DB is hosted. Adding `tenantId` after there's live data is a painful backfill.

---

## 2. Enforce isolation at the lowest layer (never per-endpoint)

### 2a. Prisma client extension — auto-scope every query
A single extension injects the tenant filter so no query can forget it. Request-scoped
`tenantScope` (an array of tenant IDs) comes from the caller's JWT/host (see §3).

```ts
// apps/api/src/tenant/tenant-prisma.ts
import { Prisma, PrismaClient } from '@prisma/client';

// Models that carry tenantId (everything except the global IPO catalog).
const SCOPED = new Set([
  'User', 'InvestorProfile', 'Consent', 'Application',
  'WatchlistItem', 'DeviceToken', 'MemberCredential', 'AuditEvent',
]);

export function scopedPrisma(base: PrismaClient, scope: string[]) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SCOPED.has(model)) return query(args);       // global models pass through
          if (operation === 'create') {
            // stamp tenantId on writes (single active tenant = scope[0] for creators)
            args.data = { tenantId: scope[0], ...args.data };
            return query(args);
          }
          if (['createMany'].includes(operation)) return query(args);
          // reads/updates/deletes: constrain to the caller's visible scope
          args.where = { AND: [args.where ?? {}, { tenantId: { in: scope } }] };
          return query(args);
        },
      },
    },
  });
}
```

### 2b. Postgres Row-Level Security — defense in depth
Even a buggy query cannot cross tenants. Set the scope per connection/transaction, and let RLS filter.

```sql
-- once per scoped table
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Application"
  USING ("tenantId" = ANY (string_to_array(current_setting('app.tenant_scope', true), ',')));

-- per request (NestJS interceptor), inside the transaction:
--   SELECT set_config('app.tenant_scope', $1, true);   -- $1 = 'id1,id2,id3'
```

---

## 3. Resolving the tenant

> **DECISION (chosen): Option B — server-side (SSR) resolution by `Host` header, on every page load.**
> Branding must work on the **public landing page where there is no login**, so the **domain is the
> identifier**. The server reads the `Host` header on each request → looks up `customDomain → tenant`
> → renders that tenant's brand *before* the page is sent (no flash, per-domain SEO). Our domains (and
> any unknown host) fall back to the `platform` (Investoyard) brand. The user's **login** only affects
> **data scope** *after* sign-in — never the branding. This matches Investoyard's existing host-based logic.
> Run the Next.js web tier as a Node server (behind IIS via ARR/iisnode, or on a Node host); one codebase.

| Surface | How the tenant is resolved |
|---|---|
| **White-label** (public) | Next.js **middleware** reads the `Host` header → `customDomain → tenant` (cached) → sets brand + flags + SSR theme |
| **B2C** (public) | our domain (or any unknown host) → **Investoyard Direct** channel (brand inherits platform default) |
| **Partner / branch** (authed) | brand still from host; **data scope** from the **user's Membership** in the JWT |

> **`platform` = operator only.** Every customer belongs to a *channel* tenant: `direct` (Investoyard Direct),
> a `partner`, or a `branch`. B2C signups land in **Investoyard Direct**, not on the platform root. This keeps
> the root purely operational (scope = all) and makes "Direct vs Partner-A vs …" reporting uniform.

```ts
// host → tenant, with our-domain / unknown fallback to the Direct channel
async function resolveTenantByHost(host: string) {
  const OURS = new Set(['investoyard.com', 'www.investoyard.com', 'localhost:4300']);
  if (OURS.has(host)) return directTenant();                      // "Investoyard Direct" (brand = platform default)
  return (await lookupCustomDomain(host)) ?? directTenant();      // unknown host → default brand
}
// platformTenant() is used only for operator/super-admin context, never as a customer's home tenant.
```

**JWT payload:** `{ userId, tenantId, roleId, scope: string[] }` where `scope` is:
- role `own` → `[tenantId]`
- role `subtree` → `tenantId` + all descendants (recursive CTE / cached closure)
- role `all` → every tenant

**NestJS:** a `TenantInterceptor` builds `scope`, opens a transaction, `set_config('app.tenant_scope', …)`,
and hands a `scopedPrisma(base, scope)` to services.

**Next.js middleware sketch:**
```ts
// apps/web/middleware.ts
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const tenant = resolveTenantByHost(host);          // cached lookup; platform if apex/unknown-safe
  const res = NextResponse.next();
  res.headers.set('x-tenant', tenant.id);            // consumed by the SSR TenantProvider
  return res;
}
```
The web `TenantProvider` injects `tenant.branding.colors` into the design-token CSS variables and
gates UI on `tenant.featureFlags` (e.g. hide GMP).

---

## 3b. Configuration cascade (every option is per-tenant AND per-branch)

Every option/feature resolves **down the tree**: platform default → partner → branch. Deepest
override wins; unset = inherit. A parent can **lock** a key so descendants can't override it.
Only overrides are stored (`TenantSetting`, sparse); the catalog + defaults live in `FeatureDefinition`.

```ts
// effective config for a tenant (cache per tenantId; invalidate on any TenantSetting change)
function effectiveConfig(chain: Tenant[] /* root → … → current */, defs: FeatureDefinition[]) {
  const out: Record<string, any> = {};
  const locked = new Set<string>();
  for (const d of defs) out[d.key] = d.defaultValue;          // 1. platform defaults
  for (const t of chain) {                                     // 2. walk top → down
    for (const s of t.settings) {
      if (locked.has(s.key)) continue;                         //    ancestor locked it → skip
      out[s.key] = s.value;
      if (s.locked) locked.add(s.key);
    }
  }
  return out;                                                  // 3. what the app reads
}
```

**Governance:** `FeatureDefinition.editableAt` gates who can change a key — `branch` (self-serve),
`partner` (sets it for all branches), or `platform` (operator-only, e.g. compliance: self-PAN always
on, GMP-off for a regulated tenant). The admin **Settings** screen shows each key's effective value +
badge (Default / Inherited / Overridden / 🔒 Locked) and only edits what the level is allowed to.

Categories: **branding · features · limits · rail · compliance · notifications** — one uniform
mechanism for all of them, so nothing is special-cased.

## 4. Rollout order
0. **Foundation** — models + `tenantId` + scoping extension + RLS. *(now, pre-DB)*
1. **B2C (M1)** — seed the `platform` (operator) tenant **+ an `Investoyard Direct` channel**; B2C customers hang off *Direct*.
2. **Partner (M2)** — partner + branch provisioning, subtree scope, partner admin console (reuse the RBAC admin, tenant-scoped).
3. **White-label** — host→tenant resolution, branding engine, domain verification (TXT) + TLS.
4. **Commission (M3)** — attaches to the tenant tree once the SEBI referral/AP regime settles.

---

## 4b. Domain rules (PAN & IPO application categories)
- **PAN unique per tenant** — `@@unique([tenantId, panHash])` on `InvestorProfile`. Same PAN may exist under
  another tenant. PAN stays vaulted; `panHash` (keyed HMAC) is for dedup only.
- **Three application categories** — `ApplicantCategory { individual | shareholder | employee }`. One PAN may
  apply **once in each** per IPO (≤3), never twice in the same category:
  `@@unique([ipoId, investorProfileId, applicantCategory])`. Market-wide same-PAN dedup = registrar's job.
- **Allowed categories per IPO** — `Ipo.allowedApplicantCategories` (admin-set). A tenant may further narrow
  via the settings cascade. Shareholder/Employee require eligibility (holder-of-record / employee) — validated at apply.

## 5. Security, audit & regulatory compliance
**Regulatory (as applicable to our role / the empaneling merchant-banker):**
- **SEBI CSCRF** (Cyber Security & Cyber Resilience Framework) alignment · **CERT-In** directions (6-hour incident
  reporting, ≥180-day logs in India, NTP sync) · **DPDP Act 2023** (consent, data-sharing consent, breach notice) ·
  **ISO/IEC 27001** ISMS (target) · **data residency in India**.

**Security controls:**
- **Periodic VAPT by an independent, CERT-In empanelled third-party vendor** — **black-box** (outsider, no access),
  **grey-box**, and **white-box** (full source + architecture) testing; before go-live, ≥ annually, and after major
  releases. Scope **explicitly includes multi-tenant isolation and all public APIs**. Remediate + retest to closure.
- **API & access security — no direct/unauthorised use:** every endpoint requires a valid, short-lived, **signed token**
  (no anonymous/direct calls); backend behind an **API gateway + WAF on a private network** (not internet-reachable
  directly); CORS allow-list · CSRF protection · **HMAC-signed** sensitive calls · **mTLS** for rail/server-to-server ·
  rate-limiting + bot/DDoS · replay/idempotency guards · strict schema validation. A valid token is still confined to
  its own tenant by RLS.
- **Secure SDLC** — SAST / DAST / dependency (SCA) / secret scanning in CI · **encryption** (TLS 1.2+/1.3, AES-256 at
  rest, KMS-backed PII vault) · **MFA** for staff · backups + DR (RPO/RTO) · incident-response plan.

### Checklist
- [ ] Every scoped read/write passes through `scopedPrisma` — no raw `prisma` in services.
- [ ] RLS enabled on all scoped tables (defense in depth).
- [ ] Custom domains **verified** (TXT) and allowlisted before activation.
- [ ] Per-tenant rail secrets in a vault (KMS), referenced by id — never inline.
- [ ] `AuditEvent` records `tenantId` + actor.
- [ ] CI test: seed tenant A + B, assert A's token can never read B's rows.
- [ ] `Self-PAN` rule stays universal; `data_sharing_partner` consent captured on B2B2C acquisition.

## 6. Performance & scale (in-house, no CDN)
IPO traffic is **spiky but predictable** — it peaks in the **last hour before close** + constant live subscription/GMP
refresh. Two rules: **cache the reads, queue the writes.** All in-house/free — no CDN.

**Reads → cache (free, in-house):**
- **Next.js ISR** — regenerate IPO/GMP pages every few seconds instead of per-request.
- **Redis** cache-aside for the IPO catalog, live subscription/GMP snapshots, and each tenant's `effectiveConfig` + branding
  (cache keyed by tenant/host; don't re-walk the tree per request).
- **Reverse-proxy cache** (IIS output cache / Nginx) + **gzip/Brotli** + `Cache-Control`/`ETag` headers.

**Writes (Apply) → queue & meter:** accept → **BullMQ** queue → workers submit to NSE/BSE at a **controlled rate**;
user sees "submitted · processing" instantly; status via exchange callback; **idempotency keys** for safe retries.

**Live data:** one background job pulls NSE/BSE every few seconds → Redis snapshot everyone reads (N→1 upstream);
mobile via **FCM push**, not polling.

**Infra:** Postgres **read replicas + PgBouncer** pooling · **stateless API + workers auto-scale** (CPU + queue depth) ·
**rate-limiting** stops bots/scrapers · **pre-scale on the IPO calendar** · **load-test** (k6/JMeter) pre-launch ·
monitoring + **graceful degradation** (circuit breakers; flag to slow live-refresh under extreme load).
