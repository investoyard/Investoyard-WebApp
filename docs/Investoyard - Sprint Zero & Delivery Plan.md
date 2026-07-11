# Investoyard — Sprint Zero & Delivery Plan (Phase 1)

**Prepared:** 21 June 2026
**Purpose:** Engineering kickoff plan — repo structure, environments, CI/CD, conventions, and the epic→sprint breakdown for the Phase 1 B2C MVP.
**Stack (locked):** React Native (Expo) · Next.js · Node.js/NestJS — unified TypeScript · PostgreSQL + Redis + queue · AWS.
**Parent docs:** *Phase 1 Product Spec*, *Data Model & API Contracts*, *Wireframe Screen Flow*, *Tech Stack & Design System*.

> Effort/sprint counts are planning defaults (2-week sprints); they scale with team size — confirm once the team shape is set.

---

## 1. Monorepo structure

One TypeScript monorepo (pnpm workspaces + Turborepo) so app/web/backend share tokens, types, validation, and the API client.

```
investoyard/
├── apps/
│   ├── mobile/            # React Native (Expo) — the app
│   ├── web/               # Next.js (SSR/SSG) — SEO web + responsive
│   └── api/               # NestJS — backend (REST/OpenAPI)
├── packages/
│   ├── design-tokens/     # Style Dictionary → RN + web theme tokens
│   ├── ui-web/            # shared web components (React)
│   ├── ui-mobile/         # shared RN components
│   ├── types/             # shared DTOs / domain types
│   ├── api-client/        # generated from OpenAPI; used by app + web
│   ├── validation/        # shared zod schemas (PAN/IFSC/UPI/amount rules)
│   └── config/            # eslint, tsconfig, prettier presets
├── infra/                 # Terraform (IaC) — AWS resources
├── .github/workflows/     # CI/CD pipelines
└── docs/                  # the planning docs in this folder
```

> **Note:** RN and Next.js can't share *UI primitives* (different render layers), so `ui-web` and `ui-mobile` are separate — but they consume the **same `design-tokens`**, and share `types`, `api-client`, and `validation`. That's where the unified-TypeScript payoff lives.

---

## 2. Environments

| Env | Purpose | Notes |
|---|---|---|
| **local** | Developer machines | Dockerized Postgres/Redis; mocked rail adapter |
| **dev** | Shared integration | Auto-deploy on merge to `develop` |
| **staging** | Pre-prod / QA / UAT | Prod-like; rail **sandbox** creds; load tests run here |
| **prod** | Live | Manual promote; blue-green / canary |

- **Region: AWS ap-south-1 (Mumbai)** — data residency aligned to DPDP.
- Secrets in AWS Secrets Manager / SSM; **PII vault** separate, encrypted.
- Per-env config via env vars + tenant/feature-flag service.

---

## 3. CI/CD (GitHub Actions)

**On every PR:** lint · typecheck · unit tests · build all affected packages (Turborepo affected-graph) · OpenAPI contract check.

**On merge:**
- `api` → build image → push → deploy (ECS/Fargate) via Terraform; run DB migrations (gated).
- `web` → deploy (Vercel or AWS Amplify) with preview URLs per PR.
- `mobile` → EAS build (Expo); internal distribution (TestFlight / Play internal) on staging; OTA updates for JS-only changes.

**Quality gates:** coverage threshold, no high-severity vulns (dependency scan), successful migration dry-run.

---

## 4. Conventions

- **Trunk-ish flow:** `main` (prod) ← `develop` ← feature branches; PR review required.
- **Commits:** Conventional Commits; PR templates.
- **Testing:** unit (Jest), API contract tests, e2e on critical flows (Detox/Playwright) — apply flow + onboarding are must-cover.
- **API-first:** define OpenAPI before implementing; `api-client` generated, not hand-written.
- **Definition of Done:** code + tests + docs + a11y check + reviewed + deployed to dev.

---

## 5. Sprint Zero (foundation) — before feature sprints

**Goal:** a deployable skeleton so feature sprints run on rails.

- [ ] Monorepo scaffold (pnpm + Turborepo); the 3 apps + shared packages booting.
- [ ] CI/CD pipelines green (lint/test/build/deploy to dev).
- [ ] Terraform baseline: VPC, RDS Postgres, Redis, queue, secrets, ECS, CDN (ap-south-1).
- [ ] **Data model migrated** (from Data Model doc §2) — minus `[PROVISIONAL — RAIL]` specifics.
- [ ] Auth skeleton (mobile OTP) + JWT.
- [ ] **Design tokens v0** + a few core components (button, input, card) in both `ui-web` and `ui-mobile`.
- [ ] OpenAPI spec v0 + generated `api-client`.
- [ ] PII vault + tokenization service stub.
- [ ] Observability baseline (logs/metrics/alerts).
- [ ] Mocked **Rail Adapter** (so apply flow can be built before the real rail is confirmed).

---

## 6. Epic → sprint plan (Phase 1)

Three parallel tracks (Backend · Frontend(app+web) · Design) feeding integrated sprints. ~2-week sprints.

| Sprint | Theme | Key deliverables | Screens |
|---|---|---|---|
| **S0** | Foundation | Repo, CI/CD, infra, data model, auth skeleton, tokens v0, mocked rail | — |
| **S1** | Identity + data spine | OTP auth end-to-end; **IPO data ingestion pipeline** (calendar/detail) + first data feeds; design system core | S4 |
| **S2** | Discovery | Home dashboard, IPO detail + tabs (overview/subscription/GMP/docs), search/filter; web SEO pages | S1, S2 |
| **S3** | Profiles + compliance | Investor profile + family (PII vault), **DPDP consent/notice/withdraw/grievance**, allotment checker | S5, S6, S3, S11 |
| **S4** | Apply (rail-independent) | Bid entry, **prefilled-PDF ASBA**, applications model + history; watchlist + alerts | S7, S8b, S9, S10 |
| **S5** | Native apply *(rail-gated)* | **Real Rail Adapter** (NSE e-IPO/BSE IBBS), UPI-mandate handoff, status webhooks/polling | S8a |
| **S6** | Harden + launch | Closing-day load test, queue tuning, error/empty states, i18n scaffolding, store submission | polish |

**Dependency notes:**
- **S5 (native apply) is gated** on the rail research/BD outcome (API vs portal, sandbox, credentials). If not ready, ship Phase 1 with **PDF fallback + redirect**; light up native apply when the rail is confirmed (per Roadmap). S4 deliberately delivers a *complete, launchable* apply path without the rail.
- Design runs ~1 sprint ahead (hi-fi mockups from wireframes once brand palette lands).
- Data-feed contracts (Phase 0) must be in place by **S1**.

**Indicative timeline:** ~12–16 weeks for S0–S6 depending on team size (parallelism assumed). A leaner team serializes tracks and extends.

---

## 7. Suggested team shape (lean Phase 1)

| Role | Focus |
|---|---|
| Tech lead / architect | Architecture, rail adapter, reviews |
| 2× backend (Node/NestJS) | API, data pipeline, queue, PII vault |
| 2× frontend (RN + Next.js) | App + web (shared TS) |
| 1× designer (product/UX) | Design system + hi-fi screens |
| 1× QA | e2e, IPO-window load testing |
| PM / BD (part) | Rail BD, data-feed contracts, compliance liaison |

*(Adjust to actual hiring/agency decision.)*

---

## 8. Pre-kickoff dependencies (owner = business)
1. Brand identity (logo + palette + trademark) → unblocks design tokens / hi-fi.
2. Launch-rail house + sandbox creds (from BD) → unblocks S5.
3. Data-feed contracts (IPO master, subscription, GMP, allotment, RHP) → unblocks S1.
4. AWS account + DevOps owner → unblocks S0 infra.
5. Counsel sign-off on B2C distribution + DPDP specifics → unblocks consent copy.

---

## 9. First-week checklist (do now)
- [ ] Create the monorepo + CI skeleton.
- [ ] Stand up AWS baseline (ap-south-1) via Terraform.
- [ ] Run the data-model migration (non-rail parts).
- [ ] Start the rail BD conversations (BD Brief) in parallel.
- [ ] Kick off brand/design tokens.
