# FINWAVE IPO App — Compliant Architecture & Partner-Commission Structuring

**Prepared:** 20 June 2026 · **Rev. 2** (architecture updated: independent entity, third-party broker-API rail)
**For:** FINWAVE — proposed B2C IPO information + application product (Mainboard + SME)
**Status:** Internal working document. Hand sections 1, 3 and 4 to securities counsel (and the Compliance Officer) before build/launch.

> **Key structural decisions (locked 20 Jun 2026):**
> 1. The app is a **fully independent entity — NOT Airan Finstocks**, and not itself a SEBI-registered broker.
> 2. Native UPI/ASBA apply will run through a **third-party registered-broker API partner** (the partner is the intermediary of record; the app is the independent front-end + referral layer).
> 3. **B2C-first.** The **partner/channel-commission module is deferred** until the SEBI referral/AP regime clarifies (see §3).

> **How to read this:** Statements tagged **[VERIFIED]** rest on primary regulatory sources (SEBI/NSE/NPCI/gazette) or operators' own pages, fact-checked in two research passes. Statements tagged **[JUDGMENT]** are our product/commercial recommendation built on those facts. Statements tagged **[FOR COUNSEL]** are genuine legal grey zones to confirm with a lawyer — do not treat our reading as settled.

---

## 0. Executive summary

A mobile-first IPO info + application product covering Mainboard and SME IPOs is viable and well-timed (FY2025: 80 mainboard IPOs, ₹1,630 bn raised, retail ~35× oversubscribed). But three things govern how it must be built:

1. **The application rail is the binding constraint.** An independent non-broker app legally *cannot* push an IPO bid to the exchange. Only a Syndicate Member / Registered Stock Broker / RTA / Depository Participant can. **So native apply runs through a third-party registered-broker API partner** who is the intermediary of record. The app stays an independent front-end + referral layer; the "non-broker" identity is genuine here, but it means the app depends on the partner broker for the apply rail.
2. **The partner-commission model is the highest legal risk and is currently unsettled — so it's deferred.** The strict "referrers must be Authorised Persons" rule is in abeyance with no final replacement. **MVP ships B2C without it;** the channel-partner module is added in Phase 2 once the regime clarifies. When built, partner economics should rest on account-opening + downstream value (where revenue actually exists), not per-IPO-application commissions (which generate no revenue and sit in a grey zone).
3. **SME IPOs are now meaningfully more regulated** (since the SEBI ICDR amendment of March 2025). This *helps* a quality-first app — fewer junk issues, more to explain to users — but the app's listings/disclosures must reflect the new norms.

---

## 1. Compliant architecture (entity + application rail)

### 1.1 The binding rule **[VERIFIED]**
Under SEBI's UPI-ASBA framework (Circular SEBI/HO/CFD/DIL2/CIR/P/2021/2480/1/M, 16 Mar 2021, now consolidated into the **SEBI ICDR Master Circular dated 9 Feb 2026**):

- A UPI-route IPO application **can only be submitted to** a *Syndicate Member, Registered Stock Broker, RTA, or Depository Participant*.
- It **cannot** be submitted through an SCSB (bank) — SCSBs only handle the separate **net-banking Bank-ASBA** route.
- The **investor never uploads the bid directly.** The receiving intermediary uploads bid + UPI ID to the exchange → exchange shares details with the Escrow/Sponsor Bank → bank pushes the UPI block mandate to the investor via NPCI.

**Consequence:** an unregistered "info site" structurally cannot facilitate a UPI/ASBA application. This is exactly why Chittorgarh, IPO Watch and InvestorGain stay info-only and redirect users to a broker.

### 1.2 Chosen structure — third-party broker-API rail **[JUDGMENT]**

```
   ┌─────────────────────────────┐
   │  FINWAVE IPO App / Website   │   ← independent entity, "information product"
   │  (discovery, GMP, research,  │     + front-end of the apply flow
   │   alerts, prefilled PDF)     │
   └──────────────┬──────────────┘
                  │  native "Apply" → API call (with investor consent)
                  ▼
   ┌─────────────────────────────┐
   │  PARTNER BROKER (third-party │   ← the registered intermediary of record;
   │  SEBI-registered broker/DP)  │     does KYC, receives & uploads the bid
   │  — via API integration       │
   └──────────────┬──────────────┘
                  ▼
        Exchange  →  Sponsor Bank  →  NPCI  →  investor's UPI app (mandate)
```

- **Front end (FINWAVE):** independent app/website — discovery, engagement, content, the prefilled-PDF generator, and the apply UI. Owns the user experience and the data/research layer.
- **Application rail (partner broker):** every native "Apply" routes to a **third-party SEBI-registered broker** who is the **intermediary of record** — they hold/open the user's demat-trading account, run KYC, and upload the bid to the exchange (the bid then flows Exchange → Sponsor Bank → NPCI → the user's UPI mandate, the standard flow). The compliance umbrella for the *application itself* sits with the partner broker. **⚠️ See §1.4: there is no off-the-shelf broker API for IPO bidding — this rail must be a bespoke white-label/BD deal or a deep-link handoff, not a documented public API.**
- **Two application paths, both offered:**
  - **(A) Native UPI/ASBA** — for users who open/link a demat account with the partner broker through the in-app flow. Higher conversion, near-native UX. *Requires the broker-API partnership.*
  - **(B) Prefilled physical ASBA PDF** — for users on *any* bank/broker, to submit at their own bank. **Genuinely low-risk** (form-filling assistance, no intermediary role), needs **no** partnership, and plays to FINWAVE's existing prefilled-PDF strength. Ship this from day one as the universal "no account needed" fallback.

### 1.3 What this means for your obligations **[FOR COUNSEL]**
Because the app is genuinely independent and not the intermediary, the **SEBI/exchange application obligations (KYC, bid upload, grievance redressal for the application) sit with the partner broker** — that's the upside of this structure. But three things still attach to FINWAVE and must be confirmed with counsel:
- **The app's own role/characterisation.** A pure tech front-end + referral layer routing to a registered broker who does KYC and carries the bid is the standard fintech pattern — but confirm the app is **not** itself acting as an unregistered intermediary, and what disclosures/agreements (referral vs. tech-service-provider) keep it on the right side.
- **Disclosure & advertising.** The partner broker must be clearly disclosed in the apply flow; SEBI's advertising code and the broker's compliance review apply to IPO-related content shown around the apply CTA.
- **Data-sharing.** Passing investor PAN/bank/demat data to the partner broker needs explicit, itemised DPDP consent (see §2.2) and a data-processing agreement with the broker.

### 1.4 The broker-API partner — REALITY CHECK **[VERIFIED — changes the plan]**
**Critical finding (researched 20 Jun 2026, high confidence):** **No mainstream Indian broker exposes an off-the-shelf API to *place* an IPO/ASBA bid or generate a UPI mandate on a client's behalf.**
- Zerodha **Kite Connect v3** and **DhanHQ v2** = trading / orders / holdings / market-data only — **no IPO endpoints.**
- **Upstox** has a *read-only* IPO **data** API + an **UpLink Business** multi-client partner API — but that partner API places **equity orders only, not IPO bids.** Upstox staff stated (Dec 2024) there is no API to *apply* for IPOs.
- IPO-via-UPI-ASBA exists **only inside the brokers' own consumer apps.**

**So "plug in a third-party broker API for native apply" is not available as imagined.** Native in-app IPO apply through a partner therefore requires one of:

| Route | What it is | Reality |
|---|---|---|
| **(i) Bespoke white-label / BD deal** | A broker custom-exposes (or co-builds) IPO-bid capability for Investoyard under contract/NDA | Possible but **uncertain, slow, relationship-driven** — the broker may simply not offer it. Best BD candidates: **Upstox, Dhan, Zerodha** |
| **(ii) Deep-link / SDK handoff** | App hands the user into the partner broker's *existing* IPO apply flow (co-branded), user completes there, returns | **Most achievable near-native option** today; not a true in-app bid, but smoother than a cold redirect |
| **(iii) Own registration** | The Investoyard entity itself becomes a registered broker/DP | Full control + economics, but heavy capital/compliance — a strategic, not-MVP move |

**Caveats on the finding:** it's an absence-from-public-docs result — a private NDA-gated partner IPO API can't be fully ruled out, and Angel One (SmartAPI), 5paisa, Fyers, Groww, Paytm Money, ICICI Direct, Alice Blue, Flattrade were not deeply verified. **Action: direct BD conversations with broker partnership teams are required to confirm what's actually on offer** — don't assume from public docs alone.

**Evaluate any candidate on:** (a) whether they'll expose/handoff a real **IPO-apply** flow (not just account-opening); (b) revenue terms (account-opening payout + downstream share — also funds the future partner module, §3.3); (c) white-label/co-brand latitude; (d) DPDP/data posture; (e) IPO-window reliability/SLAs.

### 1.4 Third-party application is dead — a hard UX rule **[VERIFIED]**
Since **1 May 2022**, the **PAN of the funding bank account, the UPI ID, and the demat account must all belong to the same person.** Third-party UPI IDs/accounts are invalid for allotment.
→ The app can **never** let a partner, agent, or family member apply/fund on someone else's behalf. Every application is self-PAN, self-UPI. This kills any "partner applies for the client" carryover from the old channel-distribution model — partners can *market and onboard*, but the investor must apply themselves.

---

## 2. Investor consent & data (what the app must capture)

### 2.1 UPI-ASBA mandate consent **[VERIFIED]**
- Consent = a **single UPI-PIN authorization** in the investor's *own* UPI app.
- The mandate request must display a **"Verified Merchant" tag** + the **bid-cum-application number** + **amount** + bid details, for the user to validate before approving.
- One PIN authorizes **both** the fund block **and** the later debit-on-allotment.
- Design implication: the app's job is to present the bid accurately and hand off to the UPI mandate cleanly — do **not** attempt to capture payment credentials or auto-approve. Show the user exactly what they're authorizing.

### 2.2 DPDP Act 2023 consent layer **[VERIFIED]**
The app collects PAN, bank, demat and contact data → it is unambiguously a **data fiduciary.** Consent must be:
- **free, specific, informed, unconditional, unambiguous**, via **clear affirmative action** (no pre-ticked boxes, no bundling);
- preceded by an **itemized notice**: what data is collected, the purpose of each, a link to the privacy policy, and the means to **withdraw consent** + raise a grievance.
- DPDP Rules notified 2025; **Rule 3 effective 17 Nov 2025** — this is live, not future.

**Build, don't bolt on:** a proper consent-and-notice screen, a consent-withdrawal flow, and a grievance route. Treat marketing consent (for partner/referral comms) as a *separate* opt-in from the functional consent.

---

## 3. Partner-commission structuring — DEFERRED to Phase 2

> **Decision (20 Jun 2026):** the partner/channel-commission module is **NOT in the MVP.** The MVP launches B2C (info + research + native apply via broker API + prefilled PDF). The partner module is added once the SEBI referral/AP regime clarifies. This section is the structuring guidance for *when* you build it — and the reason it's deferred.

### 3.1 The current legal state **[VERIFIED]**
- **14 Aug 2024** — NSE circular 52/2024 (NSE/INSP/63425): *any* person referring a client to a broker must be a registered **Authorised Person (AP)**, with per-person exchange approval. Brokerages (incl. Zerodha) shut down cash referral programmes.
- **24 Jan 2025** — NSE circular 06/2025 (NSE/INSP/66284): the Aug-2024 rule was **placed in abeyance**, reverting toward the 2020 regime, and referred to the Brokers' Industry Standards Forum.
- **As of early 2026:** **no final replacement rule.** SEBI is reportedly "working on a consultation paper." **The area is genuinely unsettled.**

### 3.2 What this means **[FOR COUNSEL]**
- The strict AP-only mandate is **suspended (not enforced)** — but **nothing affirmatively sanctions paying unregistered referrers** either. It is a **compliance grey zone**, not a green light.
- **Do not architect the business on the assumption that either the strict or the lenient regime is permanent.** A final SEBI rule could land mid-build and force restructuring.

### 3.3 The revenue-math reality **[VERIFIED + JUDGMENT]**
**Retail ASBA IPO applications carry no brokerage.** There is literally **no per-application revenue** to share with partners. So "commission per IPO applied" funds itself from nothing. Partner economics must be funded by what the application *leads to*:
- **Demat/trading account opening** on Airan's rail (the real acquisition event);
- **Lifetime trading revenue** from those clients (brokerage, etc.);
- **Subscription / premium-data** revenue from the app itself;
- **Advertising** (the model Chittorgarh/IPO Watch actually run on).

### 3.4 Three defensible partner models **[JUDGMENT — confirm with counsel]**

| Model | What partner does | How paid | Risk | Best for |
|---|---|---|---|---|
| **A. Authorised Person (AP)** | Onboards clients to Airan, ongoing relationship | Exchange-sanctioned revenue-share on the client's trading | **Lowest** — this is the regulator's intended channel | Your serious, high-volume legacy channel partners |
| **B. Flat marketing / app-promotion fee** | Promotes the *app/brand*, drives installs — no client-specific securities solicitation, no per-trade link | One-time / periodic flat marketing fee, **not** linked to any transaction | **Medium** — grey zone; defensible if genuinely de-linked from securities activity | Lighter affiliates, content/social promoters |
| **C. In-app referral links (B2C virality)** | Existing users invite friends | Non-cash rewards / points, or flat credit — **not** transaction-linked cash | **Medium** — mirrors what brokers shifted to post-Aug-2024 | Organic user growth |

**Recommendation:** make **Model A (AP registration)** the backbone for your material legacy channel partners — it's the durable, regulator-blessed path and it directly captures the account-opening + downstream economics that actually fund commissions. Layer **B** and **C** for lighter promotion, structured carefully to avoid transaction-linked payments to unregistered persons. **Get the exact structure of B and C signed off by counsel** given the unsettled regime.

### 3.5 What to avoid **[JUDGMENT]**
- Per-IPO-application or per-trade cash commission to **unregistered** partners.
- Anything that looks like unregistered securities solicitation/advice for compensation.
- Letting partners apply on clients' behalf (also barred by the third-party rule, §1.4).

---

## 4. SME IPO regulatory tightening (and why it helps you)

SEBI board 18 Dec 2024; **ICDR Amendment gazetted 8 Mar 2025; operative in 2026** **[VERIFIED]**:

1. **Profitability test** — issuer needs **min ₹1 crore operating profit (EBITDA)** from operations in **≥2 of the 3 preceding FYs** (Reg. 229(6)).
2. **OFS cap** — Offer-for-Sale ≤ **20% of issue size**; a selling shareholder can't offload >50% of pre-issue holding (>20% holders capped at 50%, <20% holders at 10%).
3. **GCP cap** — General Corporate Purpose allocation ≤ **lower of 15% or ₹10 crore** (combined GCP + unidentified-acquisition cap 25%).
4. **No promoter-loan repayment** — proceeds can't repay promoter / promoter-group / related-party loans.
5. **Min allottees** raised **50 → 200** (Reg. 268(1)).

**Impact on the app [JUDGMENT]:** fewer, higher-quality SME issues; richer data to surface (eligibility flags, OFS%, GCP%, use-of-proceeds). Turn compliance into a **feature** — show users "meets new SEBI SME norms" badges, EBITDA-test status, and use-of-proceeds breakdowns. Make sure listing data and any "risk" flags reflect these norms; **don't editorialize into advice** (see §5 on GMP).

---

## 5. Competitor landscape & where to win

### 5.1 The two models **[VERIFIED]**
- **Info portals** — Chittorgarh, IPO Watch, InvestorGain: publish GMP, live subscription, allotment for **both** Mainboard + SME; **do not execute applications**; monetize via **broker affiliate/lead-gen + advertising**; redirect users to brokers (Zerodha referral codes etc.).
- **Broker rails** — Groww, Zerodha, Angel One, Paytm Money: execute applications on their **own** rail; monetize on **brokerage / account-opening.**

**FINWAVE's structural edge [JUDGMENT]:** unlike the pure info portals that merely *redirect* to a broker, FINWAVE combines a Chittorgarh-grade info/research experience **with a near-native in-app apply flow** (via the broker-API partner) — so the user never leaves the app at the critical moment. You don't own the broker economics (the partner does), but you capture the engagement, the data layer, the account-opening referral revenue, and the user relationship — which the redirect-only portals give away.

### 5.2 GMP — handle with care **[VERIFIED]**
GMP = grey-market price − issue price. The grey market is **unregulated, unofficial, OTC, no governing body, no formal contracts.** SEBI's "when-listed" platform is only a proposal. → Surface GMP as **market-sentiment data with clear disclaimers**, never as a recommendation. Same for Kostak / Subject-to-Sauda. This matters more for you than for an unregistered portal, because content sits under Airan's regulated umbrella.

### 5.3 Where a new entrant differentiates **[JUDGMENT]**
- **Best-in-class IPO intelligence:** live subscription velocity (QIB/NII/retail demand curves), plain-language RHP/DRHP summaries, financial-health + valuation scoring, anchor-investor analysis.
- **SME done responsibly:** deep SME coverage *with* the new-norms compliance flags — a niche the big broker apps treat as an afterthought.
- **Full lifecycle:** most apps go dark after allotment. Own allotment-status alerts, **lock-in expiry calendar**, listing-day tracking → retention between IPOs.
- **Trust:** lead with Airan's SEBI registration as the credibility moat the pure info-sites lack.

---

## 6. MVP feature set **[JUDGMENT]**

**Tier 1 — launch (the engagement + apply core):**
- Unified **Mainboard + SME IPO calendar** (open/close, price band, lot size, GMP, subscription %).
- **Apply** — (A) native UPI/ASBA via the **third-party broker API** partner; (B) prefilled physical ASBA PDF for any bank (ships even before the API partner is live).
- **Live subscription tracker** (category-wise demand, refresh through the day).
- **Allotment status checker** (registrar integration / links).
- **Push alerts:** IPO opening, closing-soon, allotment out, listing day.
- **GMP + sentiment** (with disclaimers).
- **DPDP-compliant consent + grievance** flow.

**Tier 2 — fast follow (the moat):**
- **RHP/DRHP plain-language summaries** + financial-health score.
- **SME compliance badges** (EBITDA test, OFS%, GCP%, use-of-proceeds).
- **Lock-in expiry calendar** + post-listing tracking.
- **Watchlist + personalized "you may want to apply" nudges.**

**Tier 3 — Phase 2 (gated on regulatory clarity):**
- **Partner/channel-commission module** + in-app referral links (per §3 — only once the SEBI referral/AP regime is settled).

**Engagement hooks that drive applications [JUDGMENT]:** closing-soon countdowns, "retail subscribed X×" social proof, allotment-result notifications (highest re-open rate), and lock-in/listing alerts to pull users back between IPOs.

---

## 7. Action checklist (before build/launch)

**Legal / compliance — do first:**
1. **[FOR COUNSEL]** Confirm the app's characterisation as an independent tech-front-end + referral layer to a registered partner broker keeps it clear of "unregistered intermediary" exposure — and the right contract type (referral vs. tech-service-provider) and disclosures (§1.3).
2. **[FOR COUNSEL]** Review the **broker-API partnership agreement**: who owns the client, revenue terms, data-sharing/DPA, disclosure of the broker in the apply flow, liability for the application/grievances.
3. Build the **DPDP consent + notice + withdrawal + grievance** layer, including explicit **data-sharing consent** for passing investor data to the partner broker (§2.2).
4. *(Phase 2 only)* **[FOR COUNSEL]** Sign off the **partner-commission structure** (§3.4) and re-check the post-24-Jan-2025 SEBI referral position before building the partner module.

**Product:**
5. **Select & contract the broker-API partner** (§1.4) — now on the MVP critical path. Shortlist 2–3, compare IPO-application API capability, commercials, white-label latitude, DPDP posture, IPO-window SLAs.
6. Lock the prefilled-PDF ASBA generator as the universal, low-risk fallback that ships **before** the API partner is live (reuse FINWAVE's existing PDF engine).
7. Source live data feeds: GMP, subscription, allotment (registrar), RHP documents.

**Open questions still worth a Round-3 research pass (optional):**
- Final/post-Jan-2025 SEBI position on broker referrals + permitted AP commission structures (needed before Phase-2 partner module).
- Which brokers expose a production **IPO-application API** (not just account-opening) suitable for white-label — to seed the partner shortlist.
- SME norms interplay with promoter lock-in, draft-document public-comment period, monitoring-agency requirements.

---

### Source confidence note
Regulatory mechanics (UPI-ASBA rail, intermediary upload, DPDP consent, ICDR Master Circular, SME amendments, the NSE referral circulars) are **primary-sourced, high-confidence.** Market-size figures rest on a single high-quality source (KPMG FY2025). The referral/incentive regime is **time-sensitive and unsettled** — re-verify immediately before launch. Competitor teardown is anchored on the three info-portals (verified via their own pages); broker-rail UX beyond Zerodha is less deeply verified.
