# Investoyard — Project Guide (CLAUDE.md)

> Auto-loaded each session. Investoyard is an **independent project** (it was split out of an
> unrelated `D:\FINWAVE AOF` account-opening-forms project on 2026-06-21 — they are NOT related).

## What this is
**Investoyard** — a B2C **IPO information + application** platform for India (Mainboard + SME).
Independent product that consumes the operator's existing **merchant-banker IPO-distribution
empanelment** (Axis Capital / Nuvama / JM Financial) as its application rail. Brand: indigo
`#3c2e7e` + gold `#ffcb32`. Tagline direction: "Investing in IPOs, has never been this easy."

Three business models, one platform (build order): **M1 B2C (now)** → M2 broker white-label → M3 B2B2C.

## Status (as of 2026-06-21)
A complete, building **vertical slice** exists; everything runs on **mock/seeded data** until the
live API+DB are hosted. `npm run build` → **7/7 workspace tasks green**; rail-adapters has **20 passing tests**.

## Monorepo (npm workspaces + Turborepo, unified TypeScript)
```
apps/
  api/      NestJS — auth(OTP+JWT) · profiles(+family, PII vault) · ipo · applications
            (queue-backed apply) · rail · queue · consent · watchlist · devices · Prisma/Postgres + seed
  web/      Next.js — SEO IPO dashboard + detail (subscription/GMP/SME), multilingual via ?lang=
  mobile/   Expo/React Native — home · detail · OTP login · family KYC(+consent) · apply
            · applications/allotment history · language toggle · branded (logo via react-native-svg)
packages/
  rail-adapters/  NSE e-IPO (verified v1.20.5) + BSE iBBS (guarded template) + callbacks + submission worker
  shared-types/   one contract for api/web/mobile
  design-tokens/  brand palette + scales ("calm & data-clear")
  i18n/           en + hi live; ta/te/bn/mr scaffolded
docs/             all planning/strategy/compliance docs (architecture, roadmap, specs, BD brief, DPDP, etc.)
```

## Commands (from repo root)
```
npm install        # all workspaces
npm run build      # turbo build/typecheck all
npm run test       # turbo test (rail-adapters: 20 tests)
npm run dev        # turbo dev (web on :4300 — port chosen to avoid Windows-reserved 3000/3001)
```
- Web alone: `cd apps/web && npm run dev` → http://localhost:4300
- Mobile: `cd apps/mobile && npm run start` → Expo Go / simulator
- **Run the full live stack** (Docker Postgres → API → apps on real data): see `RUNNING.md`
- **Deploy** (Vercel web / EAS Android — need your accounts): see `DEPLOY.md`

## Conventions
- **Design = "calm & data-clear"** (Apple discipline + functional financial color, NOT apple.com-minimal).
  Neutral white/`#f5f5f7` base, near-black text, hairline borders; brand indigo only on CTAs/links;
  **semantic color (green/red) only for financial signals** (GMP, gains, status). Tokens in `packages/design-tokens`.
- **One type contract** — add shared view types to `packages/shared-types`, consume everywhere.
- **i18n** — add UI strings to `packages/i18n` (en + hi at minimum). Hindi is first-pass machine quality → needs native review.
- TypeScript everywhere; keep web pages server-rendered (SEO).

## Domain & compliance rules (MUST follow)
- **Self-PAN rule:** every IPO application (incl. family members) uses that person's **own PAN + demat
  + bank/UPI** — never one wallet funding another (post-2022 third-party-ASBA ban). The family feature is
  multi-profile, each approving their own UPI mandate.
- **GMP** = unofficial/unregulated grey-market data → always render with the "not investment advice"
  disclaimer; keep it OFF for any future regulated/white-label tenant.
- **Distribute + inform, don't advise** — no buy/sell recommendations without RIA registration.
- **DPDP** — collect financial data just-in-time (only at apply), explicit itemized consent + data-sharing consent to the partner broker.
- **Partner-commission module is DEFERRED** until the SEBI referral/AP regime settles (currently unsettled).

## Application rail
- Native apply rides the operator's **merchant-banker empanelment → NSE e-IPO / BSE iBBS** (standardized
  member API, parameterized by member credentials). `packages/rail-adapters` implements it.
- **NSE** adapter is built against the **verified WEB API v1.20.5** (the real doc; auth, transactions/add,
  addbulk for family, ipomaster, allotment, DP/UPI callbacks).
- **BSE** adapter is a **guarded template** — the doc on hand was India INX (international exchange), NOT
  domestic BSE Limited iBBS. Obtain the domestic BSE iBBS API doc via BSE membership to enable it.
- Source API docs (NSE zip + India INX pdf) are at `D:\Claude\IPO Application\`.

## Stubs to replace for production (all marked `TODO(prod)` in code)
SMS OTP delivery · PII vault → AWS KMS (currently AES dev stub) · FCM push · BullMQ submission
(currently inline) · callback auth guard enablement · real NSE member creds + UAT · FINWAVE prefilled-ASBA
PDF engine · in-memory auth/profiles/applications → live API · web `?lang=` → per-locale `/[lang]/` SEO routes.

## Human-action items (the real bottleneck — see docs/Investoyard - Project Status & Handoff.md)
Counsel sign-offs (structure, partner commission, DPDP) · merchant-banker BD (API-vs-portal, launch rail,
UAT creds) · domestic BSE iBBS doc · native Hindi review · white logo variant + trademark · host API+DB.

## Read next
`docs/Investoyard - Project Status & Handoff.md` (the master index) and `RUNNING.md`.
