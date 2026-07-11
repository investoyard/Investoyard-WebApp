# Investoyard — DPDP Consent & Notice Screens (spec + copy)

**Prepared:** 20 June 2026
**Scope:** Consent, itemized notice, data-sharing consent (to the partner broker), withdrawal, and grievance flows for the Investoyard app/website.
**Legal basis:** Digital Personal Data Protection Act 2023 (DPDP) + DPDP Rules 2025 (Rule 3 effective 17 Nov 2025); SEBI UPI-ASBA consent mechanics.

> **[FOR COUNSEL]** This is a product/UX spec with draft copy, not legal advice. Have counsel and your DPO/grievance officer finalize the exact wording, retention periods, and the data-processing agreement (DPA) with the partner broker before launch. Draft copy below is marked *[DRAFT COPY]*.

---

## 0. Principles the screens must satisfy **[VERIFIED against DPDP]**

Consent under DPDP must be **free, specific, informed, unconditional, unambiguous, with a clear affirmative action**, and must be preceded by an **itemized notice**. Concretely, that means:

- **No pre-ticked boxes.** Every consent is an explicit tap/toggle by the user.
- **No bundling.** Functional consent (needed to run the service) is kept **separate** from optional consents (marketing, partner promos).
- **Granular & itemized.** The notice lists *each* data category, *why* it's collected, and *who* it's shared with.
- **Withdrawable as easily as given.** A visible "Manage / withdraw consent" control.
- **Plain language**, with the **right to withdraw, the grievance route, and the Data Protection Board complaint right** stated.
- **Data minimization** — only ask for what each step needs, when it needs it (don't collect PAN/bank before the user chooses to apply).

---

## 1. Data inventory (what Investoyard collects, and when)

| Data | Collected at | Purpose | Shared with |
|---|---|---|---|
| Name, mobile, email | Sign-up | Account, alerts, login | — (internal) |
| Device / app-usage analytics | On use (with consent) | Product analytics, crash fixes | Analytics processor (DPA) |
| Watchlist / preferences | In-app | Personalization, nudges | — (internal) |
| **PAN** | Only at **apply** step | IPO application (ASBA), KYC by broker | **Partner broker** |
| **Bank / UPI ID** | Only at **apply** step | UPI-ASBA mandate (funds block) | **Partner broker → sponsor bank/NPCI** |
| **Demat (DP/Client ID)** | Only at **apply** step | Allotment credit | **Partner broker / depository** |
| Marketing preferences | Optional opt-in | Promotional comms | — (and partners only if separately consented) |

**Rule:** sensitive financial identifiers (PAN/bank/demat) are requested **only when the user initiates a real application**, never at sign-up.

---

## 2. Screen-by-screen spec

### Screen A — First-run / sign-up consent
**Shows:** short itemized notice + link to full Privacy Notice. Two **separate** controls:

- ☐ *(required to use the app)* **Service consent** — "I agree to Investoyard processing my account and usage data to provide IPO information, alerts and app features." → enables the app.
- ☐ *(optional)* **Marketing consent** — "Send me IPO updates, offers and promotional messages." → off by default; app works without it.

*[DRAFT COPY — notice preamble]*
> **Your data, your control.** Investoyard is an independent IPO **information** platform — we are not a stockbroker. To use the app we process the data listed below. You can withdraw any consent anytime under **Settings → Privacy → Manage consent**. You can raise concerns with our Grievance Officer (details in §4) and, if unresolved, complain to the Data Protection Board of India.

> **What we collect now:** your name, mobile, email (to create your account and send alerts) and app-usage data (to run and improve the app). We ask for PAN, bank and demat details **only later, and only if you choose to apply for an IPO.**

### Screen B — Apply step: data-collection notice (just-in-time)
Triggered when the user taps **Apply (native UPI)**. Before collecting PAN/bank/demat:

*[DRAFT COPY]*
> **Applying for [IPO name]**
> To place your IPO application, your details are submitted to our partner broker, **[Partner Broker name] (SEBI Reg. No. [____])**, who is the registered intermediary that places your bid on the exchange. Investoyard does not place the bid itself.
> We will collect and share with **[Partner Broker]**: your **PAN, bank/UPI ID, and demat account details**, for the sole purpose of submitting and tracking this IPO application.

### Screen C — Data-sharing consent (to partner broker) **[critical for the broker-API rail]**
A distinct, explicit consent — **not** bundled with Screen A.

- ☐ **I consent to Investoyard sharing my PAN, bank/UPI and demat details with [Partner Broker] (SEBI Reg. [____]) to process my IPO application(s).**
- Link: "How [Partner Broker] uses your data" (their notice) + Investoyard's DPA summary.
- State purpose limitation: *"Used only for IPO application processing and regulatory/KYC requirements. Not used for unrelated marketing without your separate consent."*

### Screen D — UPI-ASBA mandate handoff **[VERIFIED SEBI mechanics]**
Before the UPI app opens, show the user what they're about to authorize:

*[DRAFT COPY]*
> **Authorize your IPO payment block**
> You'll now approve a UPI mandate in your UPI app. Please check:
> • a **"Verified Merchant"** tag is shown
> • the **bid-cum-application number** matches
> • the **amount** = ₹[____] (this is *blocked*, not debited; debited only if shares are allotted)
> One UPI-PIN approves both the block and any debit on allotment. **Never approve a mandate where the merchant is not verified or the amount looks wrong.**

> ⚠️ The bank account, UPI ID, PAN and demat must **all be your own** — third-party applications are rejected at allotment.

### Screen E — Consent management (Settings → Privacy)
- List every consent given, with date, and an individual **Withdraw** toggle for each.
- Withdrawing **marketing** = stops promos, app still works.
- Withdrawing **data-sharing/service** = explain the consequence ("you won't be able to apply for IPOs through the app") before confirming.
- **Download my data** and **Delete my account/data** actions (with retention caveat below).

### Screen F — Grievance & rights
- Named **Grievance Officer**, email, response-time commitment.
- One-line statement of DPDP rights: access, correction, erasure, grievance, nominate, and **complain to the Data Protection Board of India**.

---

## 3. Consent record-keeping (back-end requirements)

- **Log each consent** with: user ID, consent type, exact notice version/text shown, timestamp, and channel.
- **Versioning** — if the notice text changes, re-consent or notify per counsel's guidance.
- **Withdrawal log** — record withdrawals and propagate (e.g. signal the partner broker to stop processing where applicable).
- **Retention** — define and document retention periods per data type *(set with counsel; financial/KYC data shared with the broker is typically retained by the broker per SEBI/PMLA rules even after app deletion — disclose this).* 

---

## 4. Items to finalize with counsel / DPO **[FOR COUNSEL]**

1. **Grievance Officer** name + SLA; whether a **Data Protection Officer** is required (depends on Significant-Data-Fiduciary classification).
2. **Retention periods** per data type, and the disclosure that the partner broker retains KYC/application data independently.
3. **DPA with the partner broker** — roles (who is fiduciary vs. processor for the shared data), security obligations, breach-notification flow.
4. **Children's data** — DPDP requires verifiable parental consent for under-18s; confirm age-gating (IPO investors should be adults, but app sign-up may not be — gate accordingly).
5. **Breach-notification** procedure to the Board and affected users.
6. Final **plain-language wording** of all notices (the *[DRAFT COPY]* above is a starting point, not approved text).

---

## 5. Quick build checklist

- [ ] Separate service vs. marketing consent at sign-up (no pre-tick, no bundle)
- [ ] Just-in-time financial-data notice at apply step
- [ ] Distinct data-sharing consent to partner broker
- [ ] UPI-mandate verification screen (Verified Merchant / amount / app no.)
- [ ] Self-PAN/UPI/demat enforcement + warning
- [ ] Consent management screen (per-consent withdraw)
- [ ] Download-data + delete-account actions
- [ ] Grievance Officer + DPB rights statement
- [ ] Consent + withdrawal audit logging with notice versioning
