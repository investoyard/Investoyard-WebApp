# Investoyard — Project Status & Handoff

**Updated:** 21 June 2026
**What this is:** the single map of everything produced — strategy docs + the codebase — with what's verified, what's run-ready, and what now needs human action.

---

## 1. Where we are

Investoyard is a **B2C IPO information + application platform for India** (Mainboard + SME), operated as an **independent** product that consumes the firm's existing **merchant-banker IPO-distribution empanelment** (Axis Capital / Nuvama / JM Financial) as its application rail. Strategy is settled, compliance is mapped, and a **complete, building vertical slice of the product exists** — DB schema → API → tested rail integration → SEO web → mobile app, branded and multilingual.

**Three business models, one platform** (build order): **M1 B2C first** → M2 broker white-label → M3 B2B2C. Design philosophy: **"calm & data-clear"** (Apple discipline + functional financial color). Brand: indigo `#3c2e7e` + gold `#ffcb32`.

---

## 2. Strategy & compliance docs (in `D:\Investoyard\docs\`)

| Doc | Purpose |
|---|---|
| **Compliant Architecture & Partner-Commission Structuring** (Rev. 2) | Legal structure, rails, partner-commission options — the counsel-facing doc |
| **Product & Technical Architecture** (Rev. 3) | The national-app vision, multi-tenant architecture, progressive onboarding |
| **Phase 1 Product Spec** | Screen-by-screen MVP scope |
| **Phase 1 Data Model & API Contracts** | Postgres model + REST/OpenAPI |
| **Phase 1 Wireframe Screen Flow** | S1–S11 wireframes + flow |
| **Tech Stack & Design System Foundation** | Locked stack + design tokens |
| **Sprint Zero & Delivery Plan** | Repo, CI/CD, epics → sprints |
| **Rail Integration Spec (NSE e-IPO + BSE)** | Verified NSE API mapping; BSE doc gap |
| **Merchant-Banker BD Brief** | What to take into Axis/Nuvama/JM conversations |
| **Phased Build Roadmap** | MVP → Phase 2/3 sequencing |
| **DPDP Consent & Notice Screens** | Consent UX spec |

*(Verified research findings live in memory: SEBI UPI-ASBA, DPDP, SME norms, referral regime, NSE API v1.20.5, BSE/India-INX distinction.)*

---

## 3. The codebase (`D:\Investoyard\`)

Monorepo — npm workspaces + Turborepo, unified TypeScript. **`npm run build` → 7 tasks green.**

```
investoyard/
├── apps/
│   ├── api/      NestJS — auth(OTP+JWT) · profiles(+family, PII vault) · ipo · applications
│   │             (queue-backed apply) · rail · queue · consent · watchlist · devices
│   │             + Prisma/Postgres schema + seed + callback endpoints
│   ├── web/      Next.js — SEO IPO dashboard + detail (subscription/GMP/SME), multilingual (?lang=)
│   └── mobile/   Expo/RN — home · detail · OTP login · family KYC (+consent) · apply
│                 · applications/allotment history · multilingual toggle · branded
└── packages/
    ├── rail-adapters/   NSE e-IPO (verified v1.20.5) + BSE iBBS (guarded) + callbacks
    │                    + submission worker — 20 passing tests
    ├── shared-types/    one contract for api/web/mobile
    ├── design-tokens/   brand palette + scales (calm & data-clear)
    └── i18n/            en + hi live; ta/te/bn/mr scaffolded
```

**To run locally:** see `RUNNING.md` (Docker Postgres → API migrate+seed → web + mobile). ~4 commands.

---

## 4. Verified vs run-ready vs stubbed

- **Verified in-session:** full `npm run build` across all 7 workspaces (incl. Nest compile, Next build, RN typecheck); **20 rail-adapter unit tests pass**; the NSE callback-auth scheme matches the doc's exact example; the live web dev server served 200s.
- **Run-ready (not run here — no Postgres/Docker in the build env):** the live end-to-end (DB + API + apps on seeded data). Bring it up via `RUNNING.md`.
- **Stubs to replace before production** (all marked `TODO(prod)` in code): SMS OTP delivery · PII vault → AWS KMS (currently AES dev stub) · FCM push · BullMQ submission (currently inline) · callback auth guard enablement · real NSE member credentials + UAT · FINWAVE prefilled-ASBA PDF engine · in-memory auth/profiles/applications → live API.

---

## 5. What needs YOU (human-action items) — the real bottleneck now

**Legal / compliance** *(send the Rev.2 architecture doc + the [FOR COUNSEL] items)*
- [ ] Confirm the independent-app + merchant-banker-rail structure and the app's characterisation (tech/referral, not unregistered intermediary)
- [ ] Sign off the **partner-commission** approach (deferred module) given the unsettled SEBI referral regime
- [ ] Confirm B2C self-serve distribution sits within existing partner agreements; DPDP specifics; SDF/DPO threshold

**Business development**
- [ ] Take the **BD Brief** into Axis / Nuvama / JM — resolve **API vs portal** submission + commission in a B2C context; pick the **launch-rail** house + get **UAT credentials**
- [ ] Obtain the **domestic BSE Limited iBBS API doc** (the file on hand was India INX) → unblocks `BseIbbsAdapter`

**Brand / content**
- [ ] **Native Hindi review** of the i18n strings (first-pass machine quality currently); commission the other languages
- [ ] Provide the **white logo variant** (for the indigo splash / dark mode) + confirm the typeface
- [ ] Trademark + domain/app-store name clearance for "Investoyard"

**Infra / data**
- [ ] Run the stack locally (`RUNNING.md`); stand up AWS (ap-south-1) for shared envs
- [ ] Contract live **data feeds** (IPO master, subscription, GMP, allotment/RTA, RHP)

---

## 6. Suggested next phases (engineering)

1. **Go live locally** — run via `RUNNING.md`, confirm the seeded end-to-end, fix anything real.
2. **Harden the launch rail** — wire the real NSE member creds + UAT; enable callbacks + BullMQ; swap the PII vault to KMS.
3. **Finish the apply lifecycle** — real UPI-mandate handoff, allotment reconciliation, push alerts.
4. **Web SEO i18n** — migrate `?lang=` to per-locale `/[lang]/` static routes.
5. **Phase 2** — multi-house rail routing, premium tier, RHP summaries; then **Phase 3** white-label.

---

### One-line status
**Strategy done · compliance mapped · a complete, building, branded, multilingual vertical slice exists · the bottleneck is now human (counsel, BD, running it), not code.**
