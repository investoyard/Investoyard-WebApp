# Running Investoyard locally (live stack)

End-to-end: Postgres → API (NestJS) → web + mobile on real data.

## 1. Database
```
docker compose up -d            # Postgres on :5432 (see docker-compose.yml)
```

## 2. API
```
cd apps/api
cp .env.example .env            # DATABASE_URL already points at the compose DB
npm run prisma:migrate          # create schema
npm run seed                    # seed IPOs (ACME/BETA/ZETA) + a launch-rail member credential
npm run start:dev               # API on :3000  → http://localhost:3000/api/ipos
```

### Tenancy: Row-Level Security (one-time DB provisioning)
Tenant isolation is enforced in Postgres via RLS, so the API connects at **runtime as a
non-superuser role** while migrations/seed use the superuser. `apps/api/.env` therefore has
two URLs:
- `DATABASE_URL` → `investoyard_app` (NOBYPASSRLS) — the runtime client.
- `DIRECT_URL` → `postgres` (superuser) — Prisma Migrate / `db push` / seed (DDL + bypasses RLS).

After the schema exists, install the role + policies once (idempotent):
```
psql <postgres-conn> -f prisma/setup-rls.sql      # creates investoyard_app + RLS policies
```
How it works: [PrismaService](apps/api/src/prisma/prisma.service.ts) sets `app.current_tenant_id`
(transaction-local) before every tenant-scoped operation; policies admit a row only when it
matches that GUC — or when the GUC is unset (internal/worker paths like rail callbacks, and the
superuser). Scoped writes carry an explicit `tenantId` (now a **NOT NULL** column) via
`tenantContext.requireTenantId()`; the policy's `WITH CHECK` rejects any mismatched tenant.
> Re-seeding touches only global/operator tables, so it runs fine as the app role — but if you
> add seed rows to a tenant-scoped table, run the seed with `DATABASE_URL=$DIRECT_URL` (postgres).

### Tenancy: feature settings cascade
Per-tenant flags/settings live in `FeatureDefinition` (the catalog + platform defaults) and
`TenantSetting` (per-tenant overrides). Effective values cascade **platform default → ancestors
→ tenant**; the nearest setter wins unless an ancestor marked it `locked`, which freezes it for the
whole subtree (e.g. a regulated white-label locks `gmpEnabled=false` so its branches can't re-enable
GMP). Resolution lives in [SettingsService](apps/api/src/modules/settings/settings.service.ts).
- `GET /api/settings/:slug` → effective settings with `{ value, locked, source }` per feature.
- `GET /api/tenants` `flags` is now sourced from the cascade (public features only), so the
  web/mobile branding automatically reflects overrides — no client change needed.
- **Admin console:** `/admin/tenants` (web) is the operator UI for this — a live tenant tree +
  per-feature editor (set / lock / clear override) backed by `GET /api/tenants/tree`,
  `GET /api/settings/catalog`, and `PUT|DELETE /api/settings/:slug/:key`. It's the first admin
  page on real API data (the rest of the console is still the mock RBAC store).

### Dashboard (live overview)
`/admin/overview` (web) is the live admin home via `GET /api/admin/dashboard/:slug` (gated
`dashboard.view`, tenant-scoped): headline counts (tenants, operators, open/total IPOs, applications,
allotment rate, funds-in-flight), applications-by-status + demand-by-IPO charts (reusing the existing
chart components), and the open/upcoming IPO list. Note the scope subtlety — a partner Admin can view
their own subtree's dashboard but not the platform's (the platform is their ancestor, not a descendant).

### Reports (live analytics)
`/admin/reports-live` (web) shows live bid analytics for a tenant sub-tree via
`GET /api/admin/reports/:slug` (gated `reports.view`, tenant-scoped, aggregated from live
applications via `runUnscoped`): totals + amount, allotment rate, refunds released, a by-status
breakdown, and demand-by-IPO (applications / amount / allotted). KPI cards + bars, no external chart lib.
A **↓ Export CSV** button downloads the underlying applications via `GET /api/admin/reports/:slug/export`
(same `reports.view` + tenant scope) — UTF-8 BOM (Excel-friendly), RFC-4180 quoting, masked mobiles;
the browser download is triggered client-side with the admin token.

### Applications / allotment (live admin)
`/admin/applications` (web) lists bids across a tenant sub-tree via
`GET /api/admin/applications/:slug` (gated `bids.view`, tenant-scoped, read cross-tenant via
`runUnscoped`, PII masked) and — for the platform operator (`bids.manage`) — records the registrar's
allotment inline via the existing `POST /api/applications/:id/allotment`. A partner Admin can view its
subtree's bids but not record allotment (that's a platform reconciliation function). This is the admin
UI for the allotment feature (previously API-only).

### IPO catalog management (live)
`/admin/catalog` (web) manages the global IPO catalog on live data — list + create + status
transitions — via `POST /api/ipos` and `PATCH /api/ipos/:id` (public GETs unchanged), gated by
`ipos.manage`. `issueSizeCr` is entered in ₹crore and stored in rupees; `gmp` writes a GMP snapshot;
duplicate symbols return **409**. It's the third admin surface on the real API (with `/admin/tenants`
and `/admin/team`); the IPO catalog is platform-global, so there's no tenant scoping here.

### Tenancy: operator/team management (live)
`/admin/team` (web) manages operators on live data via `GET /api/admin/roles`,
`GET|POST /api/admin/members/:slug`, and `PATCH /api/admin/members/:slug/:membershipId`
([admin.service.ts](apps/api/src/modules/admin/admin.service.ts)). Every route is RBAC-gated and
**tenant-tree scoped**: a SuperAdmin manages any tenant, a partner Admin only its own subtree
(add/list/update outside it → 403). Adding an operator upserts the user by mobile (unscoped) and
binds a `Membership(tenant, role)`; they sign in via OTP and their role+scope decide their access.
It's the second admin surface on the real API (after `/admin/tenants`).

### Exchange rails / API-config (live)
`/admin/rails-live` (web) manages NSE e-IPO / BSE iBBS `MemberCredential`s via
`GET|POST|PATCH /api/admin/rails` (+ `POST /api/admin/rails/:id/test`), gated `rails.manage`
(SuperAdmin). Passwords/iBBS-ids are **tokenised into the PII vault on save** — the list masks them
(`passwordSet: true`) and never returns raw secrets; plaintext never touches the DB. `RailService`
still resolves the active credential for the apply flow.
**Test is a LIVE handshake**: it decrypts the credential and performs the adapter's real
`POST {baseUrl}/login` (10s timeout), classifying the outcome — `connected` (token issued) /
`rejected` (endpoint refused — bad creds, guarded adapter) / `unreachable` (DNS/network/timeout,
`RailError code NETWORK|TIMEOUT`) / `invalid_secret` (vault decrypt failed — re-enter password) /
`incomplete` (fields missing). When real NSE UAT credentials arrive, this button is the UAT
connectivity check — no further code needed.

### Audit log (live)
Every successful operator mutation is recorded to `AuditLog` by a global
[AuditInterceptor](apps/api/src/common/audit.interceptor.ts) — it maps the route+method to an action
(`role.create`, `member.add`, `ipo.update`, `setting.set`, `allotment.record`, …) and captures actor
(mobile from the JWT), target label, and tenant. Recording is best-effort (never fails the request).
`/admin/audit-live` (web) shows the trail via `GET /api/admin/audit`, gated `audit.view` (SuperAdmin) —
a platform-governance view of who changed what, when.

### Custom roles (live)
`/admin/roles-live` (web) creates/edits/deletes custom roles via `POST|PATCH|DELETE /api/admin/roles`
+ `GET /api/admin/permissions` (the catalog), gated `roles.manage` (`roles.view` to read). Permissions
are validated against the server catalog ([permissions-catalog.ts](apps/api/src/common/permissions-catalog.ts));
system roles are immutable; a role that's still assigned can't be deleted (409). A custom role is a
platform-level template with a `scope` (own/subtree/all) and permission set — once created it's
assignable in `/admin/team` and fully participates in [PermissionsGuard](apps/api/src/common/permissions.guard.ts).

### Tenancy: admin RBAC
The settings write routes require the **`tenants.manage`** permission, enforced by
[PermissionsGuard](apps/api/src/common/permissions.guard.ts): it resolves the caller's
`Membership → Role` fresh per request and honours role **scope** against the target tenant —
`all` (platform SuperAdmin) manages any tenant, `subtree` (partner Admin) only its own tenant +
branches, `own` only itself. Seeded admins (sign in via the OTP stub, code `123456`):
`9000000001` = Platform SuperAdmin, `9000000002` = PartnerBank Admin (subtree). The `/admin/tenants`
page signs in as the Platform Admin automatically (dev) and sends the JWT on writes.
> Login is tenant-agnostic (resolved with `runUnscoped`) so an admin whose home tenant differs
> from the inbound brand can still sign in under RLS.

## 3. Web
```
cd apps/web
# point at the API:
echo NEXT_PUBLIC_API_URL=http://localhost:3000/api > .env.local
npm run dev                     # http://localhost:3000 (or next free port)
```

## 4. Mobile (Expo)
```
cd apps/mobile
npm run start                   # press i / a, or scan the QR in Expo Go
```
**API host is auto-detected** — `lib/api.ts` derives your machine's LAN IP from
Expo's host URI, so a **physical phone in Expo Go on the same Wi-Fi reaches the API
with no config** (a simulator falls back to `localhost`). Override only if needed by
setting `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` (e.g. a tunnel or staging host).

For a real device, make sure the **API is reachable on the LAN**: NestJS binds
`0.0.0.0` already, but Windows Firewall must allow inbound TCP **3000** (and Metro **8081**).

> Monorepo note: a root `postinstall` (`scripts/link-expo-router.js`) links
> `expo-router` into the root `node_modules`. npm hoists `babel-preset-expo` to the
> root but leaves `expo-router` in `apps/mobile`; without the link the router Babel
> transform is skipped and Metro bundling fails on `EXPO_ROUTER_APP_ROOT`. It runs
> automatically on every `npm install`; run `node scripts/link-expo-router.js` by hand
> if you ever see that error. `react-native` is pinned to `0.74.5` via root `overrides`
> to stop `@expo/vector-icons` pulling a newer RN that Metro's SDK-51 preset can't parse.

### PII vault — envelope encryption (KMS-ready)
[PiiVaultService](apps/api/src/common/pii-vault.service.ts) uses **envelope encryption**: each secret
is AES-256-GCM-encrypted under a fresh random data key (DEK), and the DEK is wrapped by a pluggable
**key provider** — `local` (dev: AES master key from `PII_VAULT_KEY`) or **AWS KMS** when `KMS_KEY_ID`
is set (DEK generated/unwrapped by KMS; the master key never leaves KMS; needs
`npm i @aws-sdk/client-kms` + AWS creds/role). Token formats: `v2:<provider>:<wrappedDek>:<iv>:<tag>:<ct>`
(current) and legacy `v1:` direct-AES tokens, which **still resolve** (no migration needed).
`tokenize`/`resolve` are async (KMS is a network call); `hash()` (PAN dedup) is unchanged, so existing
`panHash` uniqueness is unaffected. `/admin/system` shows which provider is active.

### Health & system status
- Public **`GET /api/health`** — liveness/readiness for load balancers & uptime monitors: checks
  Postgres + Redis, returns **503** if the database is unreachable (no auth, no config detail).
- **`GET /api/admin/status`** (gated `dashboard.view`) — richer operator view: db/redis health +
  configured modes (queue = BullMQ/inline, SMS = provider/dev, vault = KMS/AES, Node, uptime). Surfaced
  at **`/admin/system`** (web), auto-refreshing. See [health.module.ts](apps/api/src/modules/health/health.module.ts).

### Family / bulk apply (NSE addbulk)
`POST /api/applications/bulk` applies for up to **100 family members in one call**: every applicant
is validated first (**all-or-nothing** — profile ownership, self-PAN vs DB *and* within the batch,
reservation eligibility, cut-off/UPI caps), all rows are created in one transaction, and a **single
lean bulk job** goes to the queue. The worker hydrates each member (DB + vault) and submits the
whole batch as ONE rail `addbulk` call (`orchestrator.submitBulk`); per-application idempotency
means a retry only re-submits members that didn't get through. Self-PAN holds throughout — each
member bids with their own PAN/demat/UPI and approves their own mandate. The mobile apply screen
supports multi-select (tap several family chips → one bulk submission).

### Submission queue (BullMQ)
Native bids submit through a **BullMQ** queue when `REDIS_URL` is set
([submission-queue.service.ts](apps/api/src/modules/queue/submission-queue.service.ts)): `enqueue()`
adds a job (deduped by `idempotencyKey`) and a Worker processes it with bounded concurrency, a rate
limiter (closing-day bursts) and exponential-backoff retries; the `SubmissionProcessor` handles
idempotency + transient/permanent classification. **Without `REDIS_URL` it falls back to inline**
processing (the previous behaviour) — the app runs with or without Redis.
- Dev Redis is portable (like the DB): `pwsh scripts/redis.ps1 start|stop|status` (Redis 5 on :6379).
- **No PII in Redis**: a queued job carries references only (`applicationId`, `memberCredentialId`,
  `idempotencyKey`). The worker **hydrates just-in-time** — loads the application+profile from
  Postgres and resolves the vault tokens (PAN/UPI/bank) moments before the rail call, in-process.
  The same hydration runs in the inline (no-Redis) fallback.

### Domain rules enforced (self-PAN & applicant categories)
- A **PAN is registered once per tenant** — `InvestorProfile` stores a deterministic
  `panHash` (HMAC, via `PiiVaultService.hash`) with `@@unique([tenantId, panHash])`; a duplicate
  registration returns **409**. The same PAN is reusable in a *different* tenant (per-tenant scope).
- **One live application per PAN per IPO** (SEBI) — the apply flow rejects a second application for
  the same IPO by the same PAN with **409**.
- **Applicant categories** — `individual` is always eligible; a reserved quota (`shareholder` /
  `employee`) is accepted only if the IPO lists it in `Ipo.reservations` (else **400**). ACME seeds
  both quotas as a demo. `reservations` is exposed on `IpoDetail`, and the mobile apply screen shows
  an applicant-category picker when the issue offers quotas. See [applications.service.ts](apps/api/src/modules/applications/applications.service.ts).
- **DPDP data-sharing consent** — an application is rejected with **403** unless it carries explicit
  `dataSharingConsent`. Consent is captured just-in-time (itemised, versioned), recorded as a
  `Consent(data_sharing_rail)` row, reused across applications while active, and each `Application`
  links the `consentId` it was submitted under (auditable). The **notice version is server-owned**
  (`GET /api/consent-notices`, see [consent-notices.ts](apps/api/src/common/consent-notices.ts)); the
  mobile apply screen fetches it, shows the consent checkbox (blocks submit until ticked), and echoes
  the version back — so bumping the notice invalidates stale client copies without a redeploy.
- **Allotment & refund** — after the registrar's allotment, the platform operator records it via
  `POST /api/applications/:id/allotment { allottedLots }` (gated by `bids.manage` — SuperAdmin). The
  service computes `allottedAmount` + `refundAmount` (blocked − allotted), sets status
  `allotted`/`not_allotted`, and logs a status event. It runs **cross-tenant** (unscoped, like the
  rail callbacks) so the operator reconciles any tenant's applications; customers see the result in
  their own (RLS-scoped) `GET /api/applications`. The mobile applications screen shows allotted lots +
  refund.
- **Push on allotment** — recording an allotment fires a notification via
  [NotificationsService](apps/api/src/modules/notifications/notifications.service.ts): it persists a
  `Notification`, resolves the user's active `DeviceToken`s and delivers (the FCM/APNs send is a
  **stub** that logs — wire the provider key in prod). The mobile registers a device on login and has
  an in-app inbox (`GET /api/notifications`, `unread-count`, `PATCH /:id/read`) with unread badges.
- **Listing gain** — once an IPO is `listed`, an *allotted* application's `GET /api/applications` view
  carries the listing-day P&L (`listingGain = allottedAmount × listingGainPct/100`, computed, not
  stored) with the IPO's `listingGainPct`. The mobile screen shows it green/red. Not-allotted or
  not-yet-listed applications carry no gain (their money was refunded).
- **Push on listing** — setting an IPO to `listed` (with a gain %) via the catalog fires a
  listing-gain push to every allotted investor (`IpoService.notifyListing`, reusing the notifications
  pipeline). It fires only on the *transition* to `listed` (no duplicate on re-edit). Note: the
  cross-tenant read uses `runUnscoped` and **must `await` inside the callback** — returning a lazy
  Prisma promise out of `runUnscoped` would execute it back in the caller's scoped context (RLS then
  hides the rows); this bit us once and is why the working calls all await inside.
- **Consent rights (withdraw / history)** — `GET /api/consents` returns the full grant+withdraw
  history (`active` flag + timestamps); `DELETE /api/consents/:type` withdraws. Withdrawal is
  **prospective** — it doesn't unwind a submitted application, and the next apply re-consents (a fresh
  active record). The mobile **Privacy & consents** screen (linked from Profiles) lists consents and
  withdraws them.

## Per-locale SEO routes (web)
The public content pages are statically generated **per locale**: `/` + `/ipos/[symbol]/` (English)
and `/hi/` + `/hi/ipos/[symbol]/` (Hindi — server-rendered Devanagari content, Hindi titles/meta).
Every page carries the full **hreflang cluster** (`en`, `hi`, `x-default` + canonical), and `/hi/`
cards link within the locale. Views live in [components/views](apps/web/components/views) (Next
forbids extra exports from page files); add a locale by extending
[lib/locales.ts](apps/web/lib/locales.ts) once its translations are ready. App-like pages
(login/apply/portfolio/admin) intentionally stay on the `?lang=` query — they're client-side and
not SEO surfaces; the language switcher handles both forms.

## Regression smoke test
With the live stack up (DB + Redis + API), `bash scripts/smoke.sh` runs a 23-check end-to-end
battery — health, tenancy cascade + lock, RBAC (200/403/401), Redis OTP store + real-OTP verify,
PII envelope tokens, self-PAN/consent/one-app guards, lean queue payloads (no PII in Redis),
allotment RBAC + refund math + notifications, reports + CSV, audit, rail-handshake classification,
dashboard. It creates its own test data and cleans up after itself (expects the dev seed).
CI (`.github/workflows/ci.yml`) runs build + unit tests on every push once the repo is on GitHub.

## Try the flow
- Browse IPOs (seeded), open one → subscription bars + GMP + (SME norms).
- Sign in: any 10-digit mobile. A **real 6-digit OTP** is generated and delivered via
  [SmsService](apps/api/src/common/sms.service.ts) — in dev (no `SMS_PROVIDER`) it's logged to the API
  console and the fixed code **123456** is also accepted; in prod only the real OTP works. Set
  `SMS_PROVIDER` (+ keys) to enable real SMS.
- The pending-OTP store and per-mobile request **rate limits** live in **Redis** (TTL, single-use,
  survive restarts + work across API instances) via [RedisService](apps/api/src/common/redis.service.ts);
  without `REDIS_URL` they fall back to in-memory (dev). Throttling (30s cooldown + 5/hour) applies only
  when real SMS is configured — dev stays unthrottled.
- Add a family profile (PAN/demat/UPI + consent).
- Apply → pick applicant → lots → UPI/PDF → places an application (visible under **My applications**).
- Toggle the language (हिन्दी) — UI switches; web uses `?lang=hi`.

## Notes / stubs to replace for production
- OTP delivery (real SMS), PII vault (KMS, not the AES dev stub), FCM notifications,
  BullMQ for submission, callback auth guard, the real NSE member credentials + UAT,
  and the FINWAVE prefilled-ASBA PDF engine. All marked `TODO(prod)` in code.
- Web i18n currently uses `?lang=` (SSR, crawlable). For per-locale static routes/SEO,
  migrate to `/[lang]/...` later.
