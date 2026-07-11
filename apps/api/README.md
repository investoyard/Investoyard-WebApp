# Investoyard API (NestJS)

Phase 1 backend — auth, investor profiles (+family), IPO data, applications, and the exchange rail (wraps `@investoyard/rail-adapters`).

## Structure
```
prisma/schema.prisma        Postgres data model (User, InvestorProfile, Ipo, Application, MemberCredential…)
src/
  main.ts · app.module.ts
  prisma/prisma.service.ts
  common/
    pii-vault.service.ts     AES-256-GCM tokenize/resolve PAN/bank/UPI (stub → KMS in prod)
    jwt-auth.guard.ts
  modules/
    auth/                    OTP request/verify → JWT (Tier 1)
    profiles/                investor profile + family (Tier 2); PII tokenized, masked on read
    ipo/                     public Tier-0 read endpoints + ipomaster sync via rail
    applications/            apply flow (native via rail orchestrator, or prefilled-PDF)
    rail/                    RailService (orchestrator + credential vault) + callback endpoints
```

## Endpoints (selected)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/otp/request` · `/verify` | – | OTP → JWT |
| GET/POST/DELETE | `/api/profiles` | JWT | self + family; PII just-in-time |
| GET | `/api/ipos` · `/ipos/:id` · `/:id/subscription` · `/gmp` · `/documents` | – | Tier-0 public (SEO) |
| GET/POST | `/api/applications` | JWT | native (queued) or PDF |
| GET/POST/DELETE | `/api/consents` | JWT | DPDP grant/withdraw |
| GET/POST/DELETE | `/api/watchlist` | JWT | saved IPOs |
| POST/DELETE | `/api/devices` | JWT | push token registration |
| POST | `/api/v1/appdpstatus` · `/apppaystatus` · `/notification` | (rail auth) | NSE status callbacks |

**Native apply is now queue-backed:** `ApplicationsService` enqueues a `SubmissionJob` → `SubmissionQueueService` → `SubmissionProcessor` (idempotency + retry) → `PrismaSubmissionStore` persists result + status. Swap the inline processor for BullMQ in production (see `submission-queue.service.ts`).

## How the rail wires in
- `RailModule` constructs the `RailOrchestrator` from `@investoyard/rail-adapters`, resolving `MemberCredential` rows with secrets from the PII vault.
- `ApplicationsService.create()` (native) builds a `BidSubmission` (PII resolved at call time), submits via the orchestrator, persists `applicationNumber`/status. **Production:** replace the direct call with an enqueue to the `SubmissionProcessor` (queue-backed, closing-day bursts).
- NSE pushes status to `RailCallbackController` → `RailCallbackService` → `PrismaApplicationRepo` updates the `Application` + emits a notification (drives the S9 status screen).

## Run (after monorepo wiring)
```
cp .env.example .env           # set DATABASE_URL, JWT_SECRET, PII_VAULT_KEY
npm install
npm run prisma:generate
npm run prisma:migrate         # needs Postgres
npm run start:dev
```

## Stubs to replace before production
- **OTP delivery** (auth.service) → real SMS provider + Redis-backed OTP store.
- **PII vault** → AWS KMS / Secrets Manager (not the local AES stub).
- **Notifier** → FCM/APNs.
- **Submission** → queue-backed `SubmissionProcessor` (idempotency + retry + rate-limit).
- **Callback auth guard** → enable `verifyAuthHeader` (base64(SHA256(SHA1(password)))).
- **PDF apply** → wire the FINWAVE prefilled-ASBA PDF engine.
- **MemberCredential rows** → seed the launch-rail (NSE) member creds into the vault/DB.
- Consent (DPDP) + watchlist + notifications modules → add (data model already supports them).
