# Investoyard — Phase 1 Product Spec (B2C MVP)

**Prepared:** 21 June 2026
**Scope:** The launchable B2C product — AMC-grade, national. Information-first with progressive onboarding, native apply via the launch-rail house, and prefilled-PDF fallback.
**Parent docs:** *Product & Technical Architecture* (Rev. 3); *Phased Build Roadmap*; *DPDP Consent & Notice Screens*.

> **Reading:** **[MVP]** = in Phase 1 · **[P2]** = deferred to Phase 2 · **[FOR COUNSEL/BD]** = external dependency.

---

## 1. Phase 1 goals & success criteria

**Goal:** ship a trustworthy, beautiful IPO app where any Indian retail investor can discover every IPO and apply for themselves and their family — with frictionless onboarding.

**Success criteria:**
- A new user reaches full IPO information with **zero login**.
- A user can go from "interested" to "applied" in **under 2 minutes** (returning user: under 30s).
- Native apply works end-to-end through the **launch rail** on a live IPO, with the **prefilled-PDF fallback** always available.
- Stable through a **closing-day traffic peak**.
- DPDP-compliant consent, notice, withdrawal, grievance.

**Out of scope for Phase 1 [P2]:** multi-house rail routing, premium subscription tier, RHP AI summaries, white-label/multi-tenant, partner-commission module.

---

## 2. Onboarding tiers (progressive disclosure)

| Tier | Trigger | Data asked | Screens |
|---|---|---|---|
| **T0 Anonymous** | App open / web visit | none | Browse all info |
| **T1 Light account** | "Get alerts / Save / Apply" | Mobile + OTP (email optional) | OTP flow |
| **T2 Investor profile** | "Apply" tapped | PAN, demat (DP/Client ID), bank/UPI — just-in-time | Profile + consent |
| Family member | "Add family member" | Same set, per member | Repeat T2 per person |

**Rules:** no financial data before T2; each apply uses the applicant's **own** PAN/demat/bank/UPI; family = multiple T2 profiles under one login, each approving their **own** UPI mandate.

---

## 3. Screen-by-screen

### 3.1 Discovery & information (T0)

**S1 — Home / IPO Dashboard**
- Sections: **Open now**, **Upcoming**, **Closing soon** (highlighted), **Recently listed**, **SME** tab.
- Each IPO card: company name + logo, price band, lot size, min investment, open–close dates, status chip, GMP/sentiment chip *(with "unofficial" tag)*, subscription ×.
- Search + filters (Mainboard/SME, sector, status, date).
- No login wall.

**S2 — IPO Detail**
- Header: name, status, dates, price band, lot, min amount, **Apply** CTA.
- Tabs:
  - **Overview** — about the company, issue size, objects of the issue (use-of-proceeds), key dates timeline.
  - **Financials** — revenue/profit trend, key ratios; plain-language explainers.
  - **Subscription** — live QIB/NII/Retail demand (×), updated through the day.
  - **GMP/Sentiment** — value + trend, **prominent "unofficial, not advice" disclaimer** [MVP, B2C-only].
  - **SME compliance badges** (for SME issues) — EBITDA-test status, OFS%, GCP%, "meets new SEBI SME norms."
  - **Documents** — RHP/DRHP links (plain-language summary is [P2]).
- **Lot/amount calculator** — pick lots → see amount at cut-off / price band.

**S3 — Allotment Status Checker**
- Select IPO + enter PAN/application no. → status (via registrar lookup/link). Available to T0.

### 3.2 Account & profile

**S4 — Light Sign-up (T1)** — mobile number → OTP → done. Optional name/email. Marketing consent = separate, off by default (DPDP).

**S5 — Investor Profile (T2)** — collected at first apply: PAN, demat (DP/Client ID, depository), bank account / UPI ID. Just-in-time DPDP notice + **data-sharing consent to the launch-rail house**. Validate formats; tokenize + vault on save.

**S6 — Family Group** — "Add family member" → repeat T2 per member. List view of all profiles. Each member is a distinct applicant with their own credentials.

### 3.3 Application flow (T2)

**S7 — Apply: Bid Entry**
- Choose applicant (self / family member).
- Choose category (Retail; cut-off price toggle), enter lots → amount auto-calc.
- Validate against limits (e.g., retail ≤ ₹2L).
- Choose apply method: **Native (UPI/ASBA via launch rail)** or **Prefilled-PDF**.

**S8a — Native apply (UPI/ASBA)**
- Confirm bid summary → submit to launch-rail adapter → bid uploaded to e-IPO/IBBS.
- **UPI-mandate handoff screen** (see DPDP doc Screen D): instruct user to approve mandate in their UPI app; show what to verify (Verified-Merchant, bid-cum-application number, amount = blocked not debited, single PIN).
- Poll/receive status → confirmation.

**S8b — Prefilled-PDF apply (fallback)**
- Generate bank-ready ASBA PDF prefilled from profile → download/share → instructions to submit at their bank. (Reuses FINWAVE PDF engine.)

**S9 — Application Status & History**
- List of applications (self + family): status (submitted / mandate accepted / allotted / not allotted / unblocked), per IPO. Push updates on each transition.

### 3.4 Engagement

**S10 — Alerts & Watchlist (T1)** — watchlist add/remove; push for opening, closing-soon (e.g. T-1 day, last-few-hours), allotment out, listing day, lock-in expiry. Notification preferences screen.

**S11 — Settings / Privacy** — manage consents (per-consent withdraw), download my data, delete account, grievance officer + DPDP rights (per DPDP doc Screens E/F).

---

## 4. Launch-rail integration spec **[BD-dependent]**

Implements the **Rail Adapter** interface (Architecture §3.2) for the chosen launch house:

| Operation | Purpose |
|---|---|
| `submitBid(applicant, ipo, category, lots, price)` | Upload retail bid to e-IPO/IBBS via the house's rail; returns bid-cum-application no. |
| `triggerUPIMandate(bid, upiId)` | Initiate the sponsor-bank UPI block mandate to the investor |
| `getStatus(bid)` | Bid accepted / mandate status / errors |
| `getAllotment(bid)` | Allotment result |
| `reconcileCommission(period)` | Per-application commission attribution for settlement |

**Design requirements:** idempotent submission (safe retries), **queue-backed** for closing-day bursts, webhook or polling for status, structured error mapping to user-friendly messages, graceful fallback to prefilled-PDF if the rail is unavailable.

**Open from BD (see BD Brief):** API vs portal submission, sandbox, throughput SLA, status webhooks, commission terms, IPO coverage.

---

## 5. Data feeds & sources **[to contract — Phase 0]**

| Data | Source | Use |
|---|---|---|
| IPO master (dates, price band, lot, status) | NSE/BSE feeds / aggregator | Calendar, detail |
| Live subscription (QIB/NII/Retail) | Exchange / data provider | Subscription tab |
| GMP / sentiment | Grey-market data provider | Sentiment chip (disclaimered) |
| Allotment | Registrar (RTA) lookups | Allotment checker, status |
| RHP/DRHP documents | SEBI/exchange/issuer | Documents tab |
| Company financials | Data provider / RHP | Financials tab |

Contract SLAs; cache aggressively (read-heavy); GMP always rendered as sentiment + disclaimer.

---

## 6. Non-functional requirements

- **Performance:** sub-second info screens; offline-tolerant reads; low-bandwidth/Tier-2-3 optimized.
- **Scale:** autoscaling; CDN + caching for info; **queue-backed bid submission** for closing-day peaks; load-test to realistic peak.
- **Security/DPDP:** tokenized PII vault; encryption in transit + at rest; just-in-time itemized consent; data-sharing consent + DPA with rail house; audit logging; consent withdrawal + grievance.
- **Reliability:** graceful degradation — info stays up if a rail is throttled; clear messaging; PDF fallback always available.
- **Observability:** metrics/alerting tuned for IPO-window events.
- **Accessibility & language:** font scaling, contrast, screen-reader; **multilingual scaffolding** in Phase 1 (English first, architecture ready for Hindi/regional in Phase 2).

---

## 7. Compliance checklist (Phase 1) **[VERIFIED / FOR COUNSEL]**

- [ ] Progressive consent; no financial data before T2
- [ ] Data-sharing consent to launch-rail house + DPA
- [ ] Self-PAN/demat/bank/UPI enforced for every applicant incl. family
- [ ] UPI-mandate verification screen (Verified-Merchant / amount / app no.)
- [ ] GMP shown only with disclaimers (B2C); "distribute + inform, don't advise" — factual editorial only
- [ ] SME compliance badges reflect Mar-2025 ICDR norms
- [ ] Grievance officer + DPDP rights; consent audit logging
- [ ] [FOR COUNSEL] B2C self-serve distribution within partner-agreement terms

---

## 8. Phase 1 build checklist (epics)

1. Onboarding & identity (T0→T2, family groups, PII vault)
2. IPO data pipeline + info screens (S1–S3)
3. Apply flow + launch-rail adapter (S7–S9) + UPI-mandate handoff
4. Prefilled-PDF ASBA generator (fallback)
5. Alerts, watchlist, notifications (S10)
6. DPDP consent/notice/withdrawal/grievance (S11)
7. Design system (AMC-grade) across app + responsive/SEO web
8. Scale & reliability hardening (closing-day load)
