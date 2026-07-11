# Investoyard — Monorepo

IPO information + application platform (India). npm workspaces + Turborepo, unified TypeScript.

## Layout
```
investoyard/
├── apps/
│   ├── api/                 NestJS backend (auth, profiles, ipo, applications, rail, queue, consent, watchlist, devices)
│   ├── web/                 Next.js — SEO IPO info (Tier 0) + responsive app
│   └── mobile/              Expo / React Native — app-first (Expo Router: home + IPO detail)
├── packages/
│   ├── rail-adapters/       NSE e-IPO / BSE iBBS adapters + callbacks + submission worker (20 tests)
│   └── shared-types/        one contract (IPO/application/profile view types) for api · web · mobile
├── package.json · turbo.json · tsconfig.base.json · pnpm-workspace.yaml
```
*Future: `packages/design-tokens`, `packages/ui-*`.*

## Commands (from repo root)
```
npm install            # installs all workspaces (one hoisted node_modules)
npm run build          # turbo: rail-adapters (tsc) → api (prisma generate + nest build)
npm run test           # turbo: workspace tests
npm run typecheck      # turbo: tsc --noEmit across workspaces
npm run dev            # turbo: api in watch mode
```

## Verified status (21 Jun 2026)
- `npm install` → clean (npm workspaces).
- `npm run build` → **all 5 workspace tasks build green**: shared-types (tsc), rail-adapters (tsc), api (Prisma generate + full Nest compile), web (Next.js — 4 pages, home static + IPO detail SSR, SEO-ready), mobile (`tsc --noEmit` typecheck clean).
- `npm run test` → **20 tests pass** (rail-adapters); api/web/mobile no tests yet (`--passWithNoTests`).

## Run the API
```
cd apps/api
cp .env.example .env        # set DATABASE_URL (Postgres), JWT_SECRET, PII_VAULT_KEY
npm run prisma:migrate      # needs Postgres
npm run start:dev
```

## Where things are
- **Rail integration:** `packages/rail-adapters` — `NseEipoAdapter` (verified vs NSE WEB API v1.20.5), `BseIbbsAdapter` (guarded template; needs domestic BSE doc), callbacks (DP/UPI status), submission worker.
- **API:** `apps/api/src/modules/*` — see `apps/api/README.md` for endpoints + the stubs to replace before production (SMS OTP, KMS vault, FCM, BullMQ, callback guard, PDF engine, seed member creds).
- **Planning docs:** in the `docs/` folder (architecture, roadmap, specs, BD brief, DPDP screens).
