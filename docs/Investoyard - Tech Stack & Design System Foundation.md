# Investoyard — Tech Stack & Design System Foundation

**Prepared:** 21 June 2026
**Purpose:** Lock the technology stack and design-system foundation so Phase 1 engineering + design can begin.
**Parent docs:** *Product & Technical Architecture* (Rev. 3); *Phase 1 Product Spec*.

> **[RECOMMENDATION]** = our recommended choice · **[DEPENDS]** = needs a team/business input to finalize.

---

# PART A — Technology Stack

## 1. What drives the choice

Investoyard must be, at once:
1. **App-first, AMC-grade** mobile (iOS + Android) — pixel-quality, fast, trustworthy.
2. **SEO-discoverable web** — T0 anonymous info pages are a primary acquisition channel (IPO info is won on Google).
3. **Multi-tenant / white-label ready** (M2/M3 later) — theming + config without forking.
4. **National scale** — burst traffic, low-bandwidth devices, multilingual.
5. **Maintainable with Indian talent** — deep, affordable hiring pool.

## 2. The key insight: web and mobile are *separate* concerns

The **SEO web layer must be server-rendered** (Google needs crawlable HTML). Flutter-web and React-Native-web are weak at SEO. So **the public web should be Next.js (React, SSR/SSG) regardless of the mobile choice.** That decision is effectively made for you. The real question is only the **mobile** stack — and whether it shares an ecosystem with the web.

## 3. Mobile stack options

| | **React Native (Expo)** | **Flutter** | **Native (Swift + Kotlin)** |
|---|---|---|---|
| UI fidelity (AMC-grade) | Very good | **Excellent** (pixel-perfect) | Excellent |
| Single codebase iOS+Android | ✅ | ✅ | ❌ (two codebases) |
| **Shares ecosystem with Next.js web** | ✅ **TypeScript everywhere** | ❌ (Dart, separate) | ❌ |
| One **design system** across app+web | ✅ easiest (shared TS tokens/logic) | ⚠️ two implementations | ⚠️ multiple |
| Indian hiring pool | **Very deep** | Growing | Deep but 2× teams |
| White-label theming | ✅ straightforward | ✅ | ⚠️ heavier |
| Dev speed / iteration | **Fast** (OTA updates via Expo) | Fast | Slower |
| Raw performance ceiling | High | **Highest (cross-platform)** | Highest |

## 4. Recommendation — ✅ LOCKED (21 Jun 2026)

**Confirmed: JS/React team → React Native stack locked.**

**Mobile: React Native (Expo) · Web: Next.js · unified by a shared TypeScript design-token system.**

**Why this combination:**
- **One language (TypeScript) across mobile + web + backend** → smaller team, shared validation/types/business logic, one design system implemented once as tokens consumed by both.
- **SEO web is solved** (Next.js SSR) — non-negotiable for T0 discovery.
- **White-label/multi-tenant theming** is clean with token-driven theming in React.
- **Deepest, most affordable hiring pool** in India for React/React Native.
- **Fast iteration** (Expo OTA updates) — important for a young consumer product.

**Choose Flutter instead IF [DEPENDS]:** your team is already Dart/Flutter-strong, or you want the absolute highest UI fidelity and accept a *separate* design-system implementation for the web. Flutter is an excellent choice for the app in isolation — the trade-off is ecosystem split from the (mandatory) React web.

**Avoid fully-native (Swift+Kotlin) for MVP** — 2× the team and time for no MVP-level benefit; revisit only if a specific performance need emerges.

## 5. Backend & platform **[RECOMMENDATION]**

Aligned to the Architecture doc (API-first, modular monolith → extract services):

| Layer | Recommendation | Note |
|---|---|---|
| **Language** | **TypeScript (Node.js)** — e.g. NestJS | Same language as front-ends; one talent pool |
| **API** | REST + OpenAPI contracts (GraphQL optional later) | Contract-first so app/web/tenants share |
| **Primary DB** | **PostgreSQL** | Relational core (users, profiles, applications, commission) |
| **Cache / hot reads** | **Redis** | IPO info, sessions, rate limiting |
| **Queue** | **SQS / Kafka** | **Queue-backed bid submission** for closing-day bursts |
| **Search** | OpenSearch/Elastic (later) | IPO/content search at scale |
| **Cloud** | **AWS** (or equivalent) | Autoscaling, managed services, India regions |
| **CDN** | CloudFront/Cloudflare | Read-heavy info pages |
| **PII vault** | Dedicated encrypted store + tokenization | PAN/bank/demat (DPDP) |
| **Auth** | Mobile-OTP first; OIDC/SSO for tenants | Tiered identity |
| **Notifications** | FCM/APNs + SMS + email providers | High-fanout IPO events |
| **CI/CD + IaC** | GitHub Actions + Terraform | Repeatable, staged rollouts |
| **Observability** | Metrics/tracing/alerting tuned for IPO-window | Datadog/Grafana/OTel |

> Note: if Flutter is chosen for mobile, only the mobile layer changes (Dart); web (Next.js) and the entire backend recommendation stand.

## 6. Locked stack summary (recommended)

```
Mobile (iOS+Android) ─ React Native (Expo, TypeScript)
Web (SEO + responsive) ─ Next.js (React, TypeScript, SSR/SSG)
Design system ─ shared TypeScript design tokens (one source of truth)
Backend ─ Node.js/NestJS (TypeScript), REST + OpenAPI
Data ─ PostgreSQL + Redis + (SQS/Kafka) ; PII vault + tokenization
Cloud ─ AWS + CDN ; CI/CD GitHub Actions + Terraform
Multi-tenant ─ token-based theming + feature flags from day one
```

---

# PART B — Design System (AMC-grade)

A single design system, implemented as **tokens**, consumed by app + web + (later) white-label tenants. Tooling: **Figma** (design source) → **Style Dictionary** (token pipeline) → TS tokens for RN + Next.js.

## 1. Design principles (the AMC-grade bar)
Trust-first · fast · jargon-light · elegant information density (progressive reveal) · disclaimer-native · inclusive (multilingual + accessible) · consistent across surfaces. *(Full rationale in Architecture doc §5.)*

## 2. Design tokens (structure — values are a design task)

- **Color** — semantic tokens, not raw hex: `brand/primary`, `brand/secondary`, `bg/surface`, `text/primary`, `text/muted`, `state/success|warning|danger|info`, `data/positive|negative` (for GMP/subscription). *Palette direction:* calm, institutional, high-trust (deep blue/teal family is conventional for Indian fintech trust — final brand palette TBD with the Investoyard brand work).
- **Typography** — one clean, screen-legible family (e.g. Inter/Plus Jakarta-class) with a type scale: `display, h1–h3, body-lg, body, caption, mono` (mono for figures). Indian-language glyph coverage required (Devanagari etc.).
- **Spacing** — 4-pt base scale (4/8/12/16/24/32/48…).
- **Radius / elevation** — small radius set (sm/md/lg/pill); restrained shadows (trust = calm, not flashy).
- **Motion** — subtle, purposeful (150–250ms); no gimmicks.

## 3. Theming for multi-tenant / white-label
All visuals reference **semantic tokens**; a tenant = a **token override + logo + feature flags** (incl. GMP on/off, official-only mode). No hard-coded colors anywhere → white-label is config, not a fork.

## 4. Core component inventory (Phase 1)
Buttons (primary/secondary/text), inputs (text, OTP, numeric, dropdown), **IPO card**, status chips (open/closed/listed; GMP "unofficial" chip), tabs, data tables (subscription/financials), bid/lot stepper, bottom sheets, modals, toasts, skeleton loaders (fast-feel), empty states, **consent/notice screens** (DPDP), notification list, profile/family cards, disclaimer banners. Build as a shared library with Storybook.

## 5. Iconography, imagery, motion
Single consistent icon set (line style); company-logo handling (fallback monograms); restrained illustration for empty/success states; skeletons over spinners for perceived speed.

## 6. Accessibility & language
WCAG-minded: contrast, scalable type, screen-reader labels, large tap targets. **i18n from the start** (string externalization) — English at launch, architecture ready for Hindi + regional in Phase 2.

## 7. Design-to-code workflow
Figma (components + tokens) → Style Dictionary → platform tokens (RN + web) → shared component library (Storybook) → consumed by app + web. One change propagates everywhere.

---

# Decisions to confirm before kickoff

1. ~~**Mobile stack**~~ ✅ **LOCKED — React Native (Expo) + Next.js + Node, unified TypeScript** (JS/React team confirmed).
2. **Brand identity** — Investoyard logo + final color palette + name/trademark clearance (feeds the design tokens).
3. **Cloud account / region** + DevOps baseline.
4. **Launch-rail house** (from the BD conversations) — sets the first adapter.
5. **Team shape** — in-house vs. agency vs. hybrid for Phase 1 (affects stack + timeline).
