# Investoyard — Phased Build Roadmap

**Prepared:** 20 June 2026
**Product:** Investoyard — independent B2C IPO information + application app & website (Mainboard + SME), India
**Companion docs:** *Compliant Architecture & Partner-Commission Structuring* (Rev. 2); *DPDP Consent & Notice Screens*

> **Structure recap (locked):** independent entity, **not** a broker; native UPI/ASBA apply runs through a **third-party SEBI-registered broker API**; prefilled-PDF ASBA as the universal fallback; B2C-first; **partner/commission module deferred** until the SEBI referral/AP regime clarifies.

---

## Guiding principle for sequencing

Two things gate the schedule:
1. **The broker-API partnership** is the long pole for *native* apply (commercial + legal + technical). Don't let it block launch.
2. **The prefilled-PDF ASBA path needs no partner** — so it ships first and lets you launch a genuinely useful product (info + research + PDF apply) while the broker deal closes.

So: **Phase 0/1 deliver value without the broker. Phase 2 lights up native apply. Phase 3 adds the partner module when the law allows.**

---

## Phase 0 — Foundations (pre-build, parallelizable) · ~2–4 weeks

| Workstream | Deliverable |
|---|---|
| **Legal** | Counsel sign-off on app characterisation (tech front-end + referral, not unregistered intermediary); name/trademark clearance for "Investoyard"; privacy policy + T&Cs drafted |
| **Rail BD** | The rail is the firm's **existing merchant-banker empanelment** (Axis Capital, Nuvama, JM Financial, …) → e-IPO/IBBS access. **Open task per house:** is IPO-application submission exposed via **API** to our tech platform, or **portal-only**? Confirm commission terms in a B2C self-serve context. Pick the **launch rail** (strongest house) for Phase 1. *(Retail developer APIs like Kite/Upstox are the wrong channel — they don't do IPO bidding.)* |
| **Data sourcing** | Lock providers/feeds for: IPO master data (NSE/BSE), live subscription, GMP/sentiment, allotment (registrar), RHP/DRHP documents |
| **Design** | Brand system, app IA, core flows (discover → research → apply), DPDP consent screens (see companion doc) |
| **Entity/infra** | Company + app-store accounts, cloud, analytics, push infra, basic security baseline |

**Exit criteria:** broker shortlist in active talks; data feeds contracted; legal posture confirmed; design system approved.

---

## Phase 1 — B2C MVP: the national-app foundation · ~10–14 weeks

The launchable B2C product, AMC-grade. Includes **native apply via the launch-rail house** (your existing empanelment) **plus** the prefilled-PDF fallback. Progressive onboarding (T0 anonymous browse → T1 mobile-OTP account → T2 investor profile only at apply) per the Architecture doc §4.

**Core features**
- **Progressive onboarding** — anonymous full-info browsing; one-field (mobile+OTP) account for alerts/watchlist; PAN/demat/bank collected **only at the apply step**.
- **Native apply (launch rail)** — apply for self + family via the firm's empaneled merchant-banker rail; UPI-mandate handoff; **prefilled-PDF ASBA** as universal fallback (ships even if the launch-rail API isn't ready).
- **Unified IPO calendar** — Mainboard + SME: open/close dates, price band, lot size, issue size, status (upcoming/open/closed/listed).
- **IPO detail pages** — about the company, key financials, strengths/risks (factual), use-of-proceeds, GMP/sentiment **(with disclaimers)**, lot/min-investment calculator.
- **Live subscription tracker** — category-wise (QIB/NII/Retail) demand, refreshed through the day.
- **Allotment status checker** — registrar links / lookup.
- **Prefilled-PDF ASBA generator** — universal fallback for any bank (reuses FINWAVE's existing PDF engine).
- **Alerts & engagement** — push for IPO opening, closing-soon, allotment out, listing day; watchlist.
- **DPDP-compliant consent + itemized notice + grievance** flow (see companion doc).

**Engagement hooks (the apply-nudge layer)**
- Closing-soon countdowns; "retail subscribed N×" social proof; allotment-result notifications; listing-day + lock-in reminders to pull users back between IPOs.

**Exit criteria:** stable, fast during a live IPO window; consent/grievance flows audited; data accuracy validated against a couple of real IPOs.

---

## Phase 2 — Scale the rail + premium + moat · ~6–10 weeks

Deepens the apply experience and starts monetizing beyond commission.

- **Multi-house rail routing** — add adapters for additional empaneled houses (Architecture doc §3.2); per-IPO routing for max coverage + commission optimization; graceful failover.
- **Apply hardening** — multi-profile family flows at scale; idempotent, queue-backed bid submission for closing-day bursts; full status lifecycle (placed / mandate / allotment / refund-unblock).
- **Premium tier (T3)** — subscription-velocity analytics, anchor-investor analysis, advanced screeners.
- **Moat content** — RHP/DRHP plain-language summaries, SME compliance badges, lock-in expiry calendar, personalized nudges.
- **Reconciliation** — per-application commission attribution + settlement against each house's payouts.

**Exit criteria:** multi-house routing live on real IPOs; closing-day load test passed; premium tier converting.

---

## Phase 2.5 — The "moat" features (fast follow) · ongoing

- **RHP/DRHP plain-language summaries** + financial-health / valuation scoring.
- **SME compliance badges** — EBITDA-test status, OFS%, GCP%, use-of-proceeds, "meets new SEBI SME norms" (per the March-2025 ICDR amendments).
- **Lock-in expiry calendar** + post-listing tracking.
- **Personalized nudges** — "based on your watchlist / past applications."
- **Premium tier / subscription** — advanced data (subscription velocity curves, anchor-investor analysis) as a monetization line.

---

## Phase 3 — Partner / channel-commission module (GATED) · only when regime clarifies

**Do not build until** the SEBI referral/AP regime is settled (currently in abeyance, no final rule — see architecture doc §3).

- Partner onboarding (with the AP-registration path for material partners as the durable structure).
- Referral links + attribution; partner dashboard; payout engine built on **account-opening + downstream** economics (not per-IPO-application, which carries no revenue).
- Compliance review of the exact commission structure before go-live.

---

## Critical path & dependencies (at a glance)

```
Phase 0 (legal + rail BD + data + design)
   └── Phase 1 B2C MVP ──► LAUNCH (info + native apply via launch rail + PDF fallback)
            │
            ├── Phase 2  ──► multi-house routing + premium + moat
            │
            ├── Phase 2.5 moat features (continuous)
            └── Phase 3  ──► white-label (M2/M3) + partner module   [GATED on SEBI clarity]
```

**Biggest risks to manage:**
- **Launch-rail API not ready** → mitigated: prefilled-PDF fallback ships native-independent; native apply lights up when the rail adapter lands.
- **IPO-window load spikes** → engineer for burst (queue-backed submission, autoscaling, caching); IPOs are spiky by nature.
- **Regulatory shift on referrals** → Phase 3 partner module deliberately gated, not assumed.
- **Data-feed reliability** (GMP/subscription/allotment) → contract SLAs; GMP always shown as sentiment + disclaimer.
- **Distribute-vs-advise line** → keep editorial factual; no recommendations without RIA registration.

---

## What's still open (will firm up shortly)

- **Broker-API partner shortlist** — Round-3 research running now; will slot the named candidates into Phase 0/2.
- **Effort/timeline numbers** above are planning placeholders — they firm up once team size and the broker's integration scope are known.
