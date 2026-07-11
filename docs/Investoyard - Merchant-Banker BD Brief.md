# Investoyard — Merchant-Banker / Rail BD Brief

**Prepared:** 21 June 2026
**For:** Internal — to drive partnership conversations with the IPO-distribution houses the firm is empaneled with (Axis Capital, Nuvama Wealth, JM Financial, and others).
**Goal of these conversations:** confirm how Investoyard's **B2C self-serve app** can submit IPO applications through each house's rail, on what commercial terms, and pick a **launch rail** for Phase 1.

---

## 1. Why we're meeting (the one-line pitch to them)

> "We already distribute IPOs through you. We're building **Investoyard** — a consumer app that brings retail investors to *self-apply* for IPOs at scale. We want to route those applications through your rail and grow your distribution volume. We need to understand your technical and commercial model for a tech-platform partner."

**What's in it for them:** more application volume, a modern consumer funnel they don't have to build, and a distribution partner who brings the investors. You're an amplifier of their existing business, not a competitor.

---

## 2. The decisive question to resolve (per house)

**How can Investoyard submit a retail IPO application through your rail — programmatically (API) or via your partner portal only?**

This single answer determines the Phase 1 integration. Drill into:

- **(A) Is there an IPO-application / bidding API** for an empaneled tech partner — endpoints to: create/submit a retail bid to NSE e-IPO / BSE IBBS, trigger the investor's UPI mandate, fetch bid status, fetch allotment, and reconcile commission?
- **(B) If no API**, what's the submission mechanism? Portal-only (manual)? A file/batch upload? A planned API? Could you expose one for a high-volume partner?
- **(C) Onboarding model** — does the investor become *your* client, or stay Investoyard's client with the bid simply uploaded under your intermediary access? (Affects who owns the relationship.)
- **(D) UPI mandate** — does the mandate flow through your sponsor-bank setup, or do we handle the UPI handoff? Verified-Merchant tag ownership?

---

## 3. Commercial questions

- **Commission share** — what % of the issuer selling commission (per procured application) flows to us, for **retail** applications submitted via a B2C app? Same as our current distribution arrangement, or different for self-serve?
- **Per-segment economics** — retail vs. HNI/NII vs. NCDs (commission structures differ).
- **Volume incentives / slabs** — better rates at higher application volumes?
- **Payout & reconciliation** — frequency, statement format, per-application attribution (we need clean data to reconcile and, later, to run a partner module).
- **Any platform/integration fees** charged to us.

---

## 4. Technical & operational questions

- **Throughput / rate limits** — can the rail handle our **closing-day burst** (thousands of bids in the final hours)? SLA during peak?
- **Sandbox / test environment** for integration before go-live.
- **Documentation & SDKs** — what's available; integration lead time.
- **Status & webhooks** — real-time bid/allotment status callbacks, or polling only?
- **Failure handling** — retries, idempotency, reconciliation of partial failures during peak.
- **Support** — dedicated integration + IPO-window operational support.
- **IPO coverage** — do we get access to *all* mainboard + SME issues through you, or only issues you lead-manage/distribute? (Determines whether one house = full coverage or we need multiple.)

---

## 5. Compliance questions **[align with counsel]**

- Confirm our **B2C self-serve distribution** sits within our existing empanelment/partner agreement, or whether an addendum is needed.
- **Data-sharing** — what investor data must we pass, and the data-processing terms (for our DPDP DPA).
- **Disclosures** — what must Investoyard display about your role as the intermediary of record in the apply flow.
- **Advertising / content** — any restrictions on IPO content we show alongside the apply CTA (relevant to our "distribute + inform, don't advise" posture and GMP handling).

---

## 5a. Exchange API docs — status & the BSE gap **[tracked]**

- **NSE e-IPO:** ✅ have the verified **WEB API v1.20.5 (Sep 2025)** — adapter built. Just confirm member credentials + UAT access through your empanelment.
- **BSE iBBS:** ⚠️ **OUTSTANDING.** The document on hand is **India INX (GIFT-City international exchange)**, *not* domestic **BSE Limited iBBS**. The domestic iBBS API doc is **member-gated** (behind `ibbs.bseindia.com`). **Action item: obtain the domestic BSE Limited iBBS API doc + UAT credentials via BSE membership** → unblocks the `BseIbbsAdapter`. Ask each BSE-member house (or BSE directly) for: the iBBS API/web-service spec, login params (membercode/loginid/password/ibbsid), bid/IPO-order endpoint, status & allotment endpoints, domestic category codes, and UAT access.

## 6. What to request to leave with

1. **API/technical documentation** (NSE confirm; **domestic BSE iBBS — obtain**) (or a clear "portal-only" answer + roadmap).
2. **Sandbox access** for a proof-of-concept.
3. **A draft commercial term sheet** (commission %, payout, fees, volume slabs).
4. **A named technical + commercial contact** for follow-through.
5. **IPO coverage scope** confirmation.

---

## 7. Choosing the launch rail (decision scorecard)

Score each house 1–5; pick the Phase 1 launch rail on the weighted total.

| Criterion | Weight | Why it matters |
|---|---|---|
| **IPO-application API available** | ★★★★★ | Determines whether native apply ships cleanly in Phase 1 |
| **IPO coverage (all mainboard + SME)** | ★★★★ | Full coverage from one rail simplifies the MVP |
| **Commission economics (retail B2C)** | ★★★★ | The revenue engine |
| **Closing-day throughput / SLA** | ★★★★ | Reliability at peak = trust |
| **Integration lead time + support** | ★★★ | Time to launch |
| **Relationship strength / flexibility** | ★★★ | Willingness to support a B2C partner |
| **Commercial fees to us** | ★★ | Cost of the rail |

**Default plan:** pick **one strong launch rail** for Phase 1 (fastest path to live), then add others as adapters in Phase 2 for coverage + commission optimization (per Architecture doc §3.2).

---

## 8. Red flags / deal-breakers to watch

- **Portal-only with no API roadmap** → native apply can't be automated through them; either push for an integration or treat them as a Phase-2/coverage rail while another house is the launch rail.
- **Insists the investor must become *their* client** → conflicts with Investoyard owning the relationship; negotiate or route elsewhere.
- **No closing-day SLA** → reliability risk on the single most important day.
- **Commission materially worse for B2C self-serve** → check the unit economics still clear CAC.

---

## 9. Talking-points cheat sheet (for the room)

- "We bring the investors and the funnel; you provide the rail. We grow your volume."
- "We need an API to submit retail bids and trigger UPI mandates — what do you expose to tech partners?"
- "Can your rail take a closing-day surge of thousands of applications in the final hours?"
- "What's the retail commission share for B2C self-serve, and how/when is it paid?"
- "Do we get all mainboard + SME issues through you, or only the ones you manage?"
