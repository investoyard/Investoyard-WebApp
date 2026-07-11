# Investoyard — Product & Technical Architecture

**Prepared:** 21 June 2026 · **Rev. 3** (flagship vision — supersedes the architecture sections of the earlier "Compliant Architecture" doc)
**Vision:** *The national IPO app of India* — AMC-grade experience, information-first, one-tap apply for the whole family, built as a scalable multi-tenant platform.
**Companion docs:** *Compliant Architecture & Partner-Commission Structuring* (Rev. 2 — compliance detail still valid); *Phased Build Roadmap*; *DPDP Consent & Notice Screens*; *IPO App Compliance Findings* (memory).

> **Tagging:** **[VERIFIED]** = primary-sourced fact · **[JUDGMENT]** = our recommendation · **[FOR COUNSEL]** = confirm with lawyers.

---

## 1. Vision & positioning

**Investoyard is the default destination for every retail IPO investor in India** — Mainboard and SME, information and application, for the investor and their whole family. The bar is **AMC-grade**: the polish, trust, speed and clarity of India's best consumer fintech/AMC apps (think Groww / Zerodha Coin / INDmoney class), not a B2B distributor tool.

**Three promises to the user:**
1. **Know every IPO** — the most complete, trustworthy, beautifully presented IPO information in India.
2. **Apply in seconds** — for yourself and your family, without leaving the app.
3. **Never miss out** — alerts, allotment, listing, lock-in — the full lifecycle.

**What makes it defensible:** Investoyard is the **consumer front end on top of an existing, revenue-generating IPO-distribution business** (empanelment with Axis Capital, Nuvama, JM Financial and other merchant bankers). The rail, the commission economics, and the regulatory standing already exist — competitors starting cold have none of that. Our job is the experience and the scale.

---

## 2. Business model (recap, locked)

One **multi-tenant platform**, three go-to-market modes — **B2C first**:

| | **M1 — B2C** *(build first)* | **M2 — Broker white-label** | **M3 — B2B2C platform** |
|---|---|---|---|
| Brand | Investoyard | Broker's | Partner's |
| Customer | Retail investors (national) | Broker's clients (SSO) | Partner's users |
| Rail | Our merchant-banker empanelment | Broker's own access | Partner's access |
| Revenue | **Shared distribution commission** + premium subs | SaaS licence + AMC | Licence / per-txn |
| GMP/grey-market | Optional, disclaimer-wrapped | **Off** | Per-tenant flag |
| Compliance exposure | Medium (distributor) | Low (tech vendor) | Low (tech vendor) |

**Revenue engine [VERIFIED/JUDGMENT]:** issuer-paid **selling/distribution commission**, shared down from the merchant-banker houses per procured application (the model the firm already runs; ~40–70% rev-share band is typical in these partner programs). The investor pays nothing. **Premium subscriptions** are a margin layer on top, not the foundation. Volume-driven → scale and family-multi-profile compound it.

---

## 3. The application rail — merchant-banker distribution + routing layer

### 3.1 How a bid actually reaches the exchange **[VERIFIED]**
Only a registered intermediary (Syndicate Member / Broker / RTA / DP) can upload a bid to **NSE e-IPO / BSE IBBS**. Investoyard reaches that rail through the firm's **existing empanelment with merchant-banker distribution houses**. Funds block in the **investor's own bank via their own UPI mandate**; shares credit to the **investor's own demat**. The investor authorizes their own UPI-PIN mandate (Verified-Merchant tag, bid-cum-application number, amount).

### 3.2 The routing/abstraction layer **[JUDGMENT — core architectural decision]**
The firm is empaneled with **multiple houses** (Axis, Nuvama, JM, …). Build a **Rail Abstraction Layer** so the app is never hard-wired to one:

```
        ┌────────────── Investoyard Application Orchestrator ──────────────┐
        │   chooses the rail per IPO, per economics, per availability       │
        └───────┬─────────────┬─────────────┬───────────────┬──────────────┘
                ▼             ▼             ▼               ▼
          Axis adapter   Nuvama adapter  JM adapter   Prefilled-PDF
          (e-IPO/IBBS)   (partner API/   (…)          ASBA (fallback,
                          portal)                      no rail needed)
```

Each **adapter** implements a common interface: `submitBid`, `triggerUPIMandate`, `getStatus`, `getAllotment`, `reconcileCommission`. Adding a new house = a new adapter (config), not a rewrite.

**Benefits:** maximal IPO coverage, per-issue commission optimization, resilience if one rail is down, and a clean path to plug in **direct e-IPO/IBBS access** later if you obtain your own syndicate empanelment.

### 3.3 Open dependency to resolve in BD **[FOR BD]**
Per house: **is IPO-application submission exposed as an API to a tech sub-platform, or portal-only?** (Nuvama's public "API Connect" is a *trading* API, not confirmed for IPO submission.) If portal-only, options: (a) a deeper integration the house builds, or (b) your own syndicate-member empanelment for direct exchange access. The **prefilled-PDF ASBA fallback ships regardless** and needs no rail.

---

## 4. User journey & progressive onboarding **[the explicit design principle]**

**Collect nothing until it's needed.** Friction-free to start; financial/KYC details only when the user chooses to apply. This maximizes top-of-funnel *and* satisfies DPDP data-minimization.

| Tier | User state | Data collected | Unlocks |
|---|---|---|---|
| **T0 — Anonymous** | Just browsing (esp. web/SEO) | None | Full IPO calendar, detail pages, GMP/sentiment, subscription data — *read everything* |
| **T1 — Light account** | "Save / get alerts" | **Mobile + OTP** only (email optional) | Watchlist, push alerts, personalization, premium trial. **This is the "easy registration for info access."** |
| **T2 — Investor profile** | "Apply to this IPO" | PAN, demat (DP/Client ID), bank/UPI — *just-in-time* | Apply for self; create **family-group** profiles |
| **T3 — Premium** | Wants advanced features | Payment for subscription | Subscription-velocity analytics, deep RHP tooling, etc. |

**Design rules:**
- **No PAN/bank wall at sign-up.** A new user reaches full information with zero or one-field friction.
- **Just-in-time KYC** at the apply step (T2) — the only place sensitive data is asked, with its own DPDP notice + data-sharing consent to the rail house (see DPDP doc).
- **Family group** = multiple T2 profiles under one login, **each with their own PAN/demat/bank/UPI**, each approving their own UPI mandate (compliant; never one wallet funding many).
- **Returning-user speed:** stored (tokenized) profiles → repeat applications in seconds.

---

## 5. AMC-grade experience principles **[JUDGMENT]**

1. **Trust-first visual design** — clean, calm, institutional-grade; no "tip/jackpot" styling. Trust is the moat for a financial app.
2. **Speed & responsiveness** — sub-second screens; instant data; works on low-end devices and Tier-2/3 bandwidth.
3. **Clarity over jargon** — plain-language IPO explanations; "what is GMP / cut-off / lot size" inline; every number has a tooltip.
4. **Information density done elegantly** — power users get depth (subscription curves, financials) without overwhelming new users (progressive reveal).
5. **National & inclusive** — **multilingual** (Hindi + major regional languages) for true national reach; accessibility (font scaling, contrast, screen-reader).
6. **Consistent design system** — shared component library across app + web + white-label tenants (theming via tokens).
7. **Disclaimer-native** — GMP and any sentiment data always carry clear "unofficial / not advice" framing, designed in, not bolted on.

---

## 6. Feature architecture (capability map)

**Information layer (T0+)**
- Unified Mainboard + SME calendar; IPO detail pages (about, financials, strengths/risks, use-of-proceeds, lot calculator).
- Live subscription tracker (QIB/NII/Retail demand); GMP/sentiment (disclaimered); allotment-status checker.
- **RHP/DRHP plain-language summaries**; **SME compliance badges** (EBITDA test, OFS%, GCP%, per the Mar-2025 ICDR norms).

**Application layer (T2+)**
- Apply for self + family (multi-profile); UPI-mandate handoff; native via rail adapter, prefilled-PDF fallback.
- Application status (placed / mandate accepted / allotment / refund-unblock); order history.

**Engagement layer (T1+)**
- Push/in-app alerts (opening, closing-soon, allotment, listing, lock-in expiry); watchlist; personalized nudges; lifecycle retention.

**Premium layer (T3)**
- Subscription velocity analytics, anchor-investor analysis, advanced screeners, alerts pro.

**Platform/white-label layer (M2/M3)**
- Per-tenant theming, SSO, broker back-office adapters, content feature-flags (GMP on/off, official-only mode), tenant admin.

---

## 7. Technical architecture (mature, scalable)

### 7.1 Shape **[JUDGMENT]**
**Cloud-native, API-first, multi-tenant SaaS.** Start as a **modular monolith with clear service boundaries**, extract high-load services (data ingestion, bid orchestration, notifications) into independent services as scale demands — avoids premature microservice sprawl while keeping seams clean.

### 7.2 Core services / modules
- **Identity & Profile** — auth (mobile OTP, optional SSO for tenants), tiered profiles, family groups, tokenized PII vault.
- **IPO Data Service** — ingestion pipeline from NSE/BSE, RTAs, RHP repositories, GMP/subscription feeds; normalization; the single source of truth powering all tenants.
- **Application Orchestrator** — the rail abstraction layer (§3.2); per-IPO routing; bid submission; UPI-mandate trigger; idempotent + queue-backed for closing-day bursts.
- **Payments/Mandate** — UPI-mandate orchestration (handoff to user's UPI app), status reconciliation. (No fund custody — funds block in investor's bank.)
- **Notifications** — push/SMS/email/in-app; high-fanout for closing-day + allotment events.
- **Content/CMS** — IPO editorial, summaries, multilingual content, disclaimers.
- **Commission & Settlement** — per-application attribution, reconciliation with each house's payouts, partner-share accounting (for the future M-partner module).
- **Analytics & Personalization** — funnel, engagement, nudges, premium features.
- **Tenant & Config** — multi-tenancy, theming, feature flags, white-label admin.

### 7.3 Clients
- **Mobile app-first** — cross-platform (Flutter or React Native) for fast iteration across iOS/Android at national scale; native where performance demands.
- **Web** — responsive PWA + **SEO-optimized public pages** (IPO info is won on Google — this is a primary acquisition channel and Chittorgarh's moat).

### 7.4 Scale & reliability — the closing-day problem **[JUDGMENT — design driver]**
IPO traffic is **extremely spiky**: huge surges on closing day / final hours, and on allotment day. Architect for burst, not average:
- **Autoscaling + statelessness**; **CDN + aggressive caching** for read-heavy info pages.
- **Queue-based bid submission** (absorb spikes, smooth into the rail's rate limits, retry safely — idempotent).
- **Graceful degradation** — info stays up even if a rail is throttled; clear user messaging; prefilled-PDF fallback always available.
- **Load-test against realistic closing-hour peaks** before every major IPO season.

### 7.5 Security & data **[VERIFIED requirements + JUDGMENT]**
- **PII vault & tokenization** for PAN/bank/demat; encryption at rest + in transit.
- **DPDP-compliant** consent, notice, withdrawal, grievance (see DPDP doc); itemized just-in-time consent at T2; **data-sharing consent + DPA** with each rail house.
- **Audit logging** of consents, applications, data sharing; notice versioning.
- **Tenant data isolation** for white-label.
- Plan for **Significant Data Fiduciary** obligations if user base scales (DPO, audits) — likely at national scale.

### 7.6 Engineering practices
API-first contracts, CI/CD, IaC, observability (metrics/tracing/alerting tuned for IPO-window events), feature flags, staged rollouts.

---

## 8. Compliance posture (carry-forward) **[VERIFIED / FOR COUNSEL]**

- **Distribute + inform, do NOT advise.** Recommendations need RIA registration. Investoyard surfaces information and enables applications; it does not tell users which IPO to buy. Keep editorial factual.
- **Distribution commission structuring** — already operating under formal empanelments; confirm with counsel that the **B2C self-serve form** stays within partner-agreement terms + SEBI distribution norms (a check, not a blocker).
- **Self-PAN/demat/bank/UPI** for every application incl. family (post-2022 third-party rule). **[VERIFIED]**
- **GMP** = unofficial, unregulated data → disclaimer-native in B2C; **off** for regulated/white-label tenants. **[VERIFIED]**
- **SME norms** (₹1cr EBITDA test, 20% OFS cap, GCP caps, no promoter-loan repayment, 200 min allottees) reflected in listings + compliance badges. **[VERIFIED]**
- **DPDP** progressive consent per §4 + DPDP doc. **[VERIFIED]**
- **Partner/channel-commission module** remains **deferred** until the SEBI referral/AP regime settles. **[VERIFIED]**

---

## 9. How this maps to the build phases

- **Phase 1 (B2C MVP):** T0–T1 info experience + T2 apply via **one** rail adapter (your strongest house) + prefilled-PDF fallback + alerts + DPDP. The national-app foundation, shipped.
- **Phase 2:** more rail adapters (multi-house routing), native-apply hardening, premium tier (T3), moat features (RHP summaries, SME badges, lock-in calendar).
- **Phase 3:** white-label/multi-tenant (M2 brokers, M3 partners); partner-commission module *(gated on SEBI clarity)*.
- Multilingual + scale-hardening run continuously from Phase 1, deepening into Phase 2.

*(See the Phased Build Roadmap for sequencing; it will be updated to match this Rev. 3 framing.)*

---

## 10. Open items to resolve

1. **[BD]** Per house (Axis/Nuvama/JM/…): IPO-application **API vs portal** submission? Commission terms in a B2C context? → resolves the §3.3 dependency.
2. **[FOR COUNSEL]** B2C self-serve distribution within existing partner agreements + SEBI norms; SDF/DPO threshold; distribute-vs-advise line in editorial.
3. **[PRODUCT]** Which house is the **launch rail** for Phase 1 (the first adapter)?
4. **[PRODUCT]** Mobile stack decision (Flutter vs React Native vs native) — informed by team skills.
5. **[DATA]** Contract the data feeds: IPO master (NSE/BSE), live subscription, GMP source, allotment (RTA), RHP repository.
6. **[BRAND]** "Investoyard" trademark + domain + app-store name clearance.
