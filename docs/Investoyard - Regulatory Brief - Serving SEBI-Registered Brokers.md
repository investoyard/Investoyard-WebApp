# Investoyard — Regulatory Brief: Serving SEBI-Registered Stock Brokers

**Prepared:** 15 October 2026
**For:** Sir / Safal Capital Services Private Limited — review, then hand §0, §2 and §7 to securities counsel and the Compliance Officer.
**Status:** Internal working document. **Not legal advice.**

> **How to read the tags**, kept from the June 2026 architecture note so the two documents read the same way:
> **[VERIFIED]** — rests on a named circular/regulation found in research, or on our own code and database, which is stated.
> **[JUDGMENT]** — our reading or recommendation built on those facts.
> **[FOR COUNSEL]** — a genuine grey zone. Do not treat our reading as settled.
> **[UNVERIFIED]** — we looked and could not confirm. Treated as an open question, not as a fact.

> **A caution about this brief's own sources.** Much of what is publicly searchable on these frameworks is law-firm and compliance-vendor commentary, not SEBI's own text. Where that is all we found, it is marked. **Every circular cited here should be read in the original on sebi.gov.in before anything is signed**, and the broker's own Compliance Officer will do that anyway — they are the one SEBI holds responsible.

---

## 0. The one question that decides everything else

Our business with a broker is **not one thing**, and the regulatory answer is completely different depending on something nobody has written down yet:

> **When a client of a white-label broker applies for an IPO through their branded site, whose exchange membership / empanelment carries that bid to the exchange?**

Two possible answers, and they are not variations — they are different businesses:

**(A) The broker's own membership.** They are the intermediary of record. They receive and upload the bid. We are a **technology service provider** to a regulated entity: our exposure is an outsourcing and cybersecurity one, and the SEBI-facing obligations are theirs.

**(B) Our (Safal's) merchant-banker distribution empanelment.** The bid goes up under *our* rail, and the broker has effectively **referred a client to us**. We are then much closer to being the intermediary, and the broker is doing distribution — which raises the referral/Authorised-Person questions the June 2026 note already parked as unsettled.

**Today the live architecture points at (B)** — `CLAUDE.md` records that the application rail consumes *"the operator's existing merchant-banker IPO-distribution empanelment (Axis Capital / Nuvama / JM Financial)"*, and that subscription polling uses *"the operator's own member"*. **[VERIFIED — our own code and configuration]**

**[FOR COUNSEL] This must be answered before the first broker goes live with a bid.** Everything in §2 assumes (A). If the answer is (B), §2 still applies *and* the referral analysis from the June 2026 note reopens.

**[JUDGMENT]** If the commercial intent is "the broker keeps their client", then (A) is the structure to build toward, and the rail needs to accept *the broker's* member credentials rather than ours. That is a real piece of engineering, not a contract clause.

---

## 1. We sell three different things, and they carry very different risk

This distinction matters more than any single circular, because **two of the three are live today and the risky one is not.**

| Surface | Live? | What actually happens | Who places a bid | Risk |
|---|---|---|---|---|
| **White-label site** | **LIVE** (FINWAVE, `newipo.finwave.co`) | Their brand on our IPO information site | **Nobody** — information only | Low. But the advertising and association rules in §3 apply in full. |
| **Partner Print-PDF API** | **LIVE** | Partner posts final applicant data; we return a filled ASBA form | **Nobody** — the investor submits the paper form at their own bank | Low. This is form-filling assistance, the same position the June 2026 note called *"genuinely low-risk"*. |
| **Rail bid (UPI / ASBA to the exchange)** | **NOT LIVE** — blocked on NSE UAT credentials | A bid is uploaded to the exchange | **Unresolved — see §0** | Highest. Nothing here should go live before §0 is answered. |

**[JUDGMENT] This is the most useful thing in this brief.** The surface that carries the hard regulatory questions has never been switched on, so there is time to answer them properly rather than retrofit. It also means a broker asking *"are you SEBI compliant?"* today is really asking about §2 — vendor and cyber obligations — not about intermediation.

---

## 2. Because our customer is regulated, their rules reach us

A SEBI-registered broker cannot hand its obligations to a vendor. Everything below lands on **them**, and they will push it down to **us** by contract. Expect each of these in a broker's vendor due-diligence pack.

### 2.1 Outsourcing — the foundational one **[VERIFIED]**
**SEBI Circular CIR/MIRSD/24/2011, 15 December 2011**, *Guidelines on Outsourcing of Activities by Intermediaries*, carried forward as a section of the **Master Circular for Stock Brokers** (the June 2025 consolidation lists it as item 86).

- An intermediary **may not outsource its core business activities and compliance functions.** For a stock broker the circular names *execution of orders* and *monitoring of trading activities of clients* as core.
- The broker's **board remains responsible** for the outsourcing policy and the outsourced activity.
- The broker must have a written policy, assess the risks (operational, reputational, legal, concentration, exit-strategy, systemic), and conduct due diligence on us.

**[JUDGMENT]** An IPO *information* site and a *form-filling* API are not order execution, so they read as non-core and outsourceable. **A bid-upload path is much closer to the core**, which is another reason §0 must be settled first.

**[JUDGMENT] What we must produce:** a written **exit plan** (how a broker leaves us and takes their data), a **concentration-risk answer** (what happens to their IPO channel if we fail), and a standing **right of audit and SEBI inspection** flowed down to us in the contract. These are not optional extras — they are what the circular tells the broker to obtain.

### 2.2 Cybersecurity — CSCRF **[VERIFIED as to existence; details from secondary sources]**
SEBI's **Cybersecurity and Cyber Resilience Framework (CSCRF)**, August 2024, applies to regulated entities including stock brokers.

The consistent theme across every source we read: **the broker may outsource the activity but not the accountability.** They remain liable for confidentiality, integrity and availability of their data in our hands.

**[JUDGMENT] Expect to be asked for, and we do not have today:**
- **ISO 27001** or equivalent certification — repeatedly described as the expectation for material vendors.
- **VAPT by a CERT-In empanelled vendor**, with a report we can hand over.
- A **SOC 2** report — an NSE system-audit checklist item quoted in research asks brokers whether they hold SOC-II reports from third-party cloud/SaaS vendors. **[UNVERIFIED — seen in a secondary summary of an NSE checklist, not in the checklist itself.]**
- A **third-party risk register** entry: the broker must list us, and will ask us to list *our* sub-processors.
- **Data localisation** — investor and trading data primarily stored in India. **We are well placed here**: everything runs on the operator's own server in India, with no cloud provider in the chain. **[VERIFIED — our own infrastructure]** That is a genuine selling point, and it should be stated in the vendor pack.
- An **incident-response and breach-notification** path to the broker, with a defined timeline.

### 2.3 Technology glitches **[VERIFIED — framework revised]**
SEBI revised the technical-glitch framework by **circular dated 9 January 2026**, superseding the 25 November 2022 framework.

What the research consistently reports:
- It applies to brokers offering **IBT / STWT trading platforms** above a client threshold.
- A glitch is a malfunction that stops or slows **trading** (login, order placement) for five minutes or more.
- Reporting runs to the exchange within hours, a preliminary report by T+1, and a root-cause analysis within about 14 working days.
- **Explicitly excluded:** problems at the exchange, bank payment gateways, and **account-opening/KYC**.

**[JUDGMENT]** An IPO application platform is not an IBT/STWT trading platform, and the exclusions lean our way. **[FOR COUNSEL / ASK THE EXCHANGE]** But this is not settled by the text we found, and the consequence of being wrong is the broker missing a reporting deadline because *our* platform was down. **Whatever the legal answer, we should give partners a glitch/downtime notification path by contract** — it costs us nothing and it is the first thing a Compliance Officer will ask for.

### 2.4 Cloud **[UNVERIFIED in detail]**
SEBI has a framework for adoption of cloud services by regulated entities. **We did not verify its text in this pass.** It is likely to matter little for us *because we are not on cloud* — but if we ever move the white-label hosting to a cloud provider, this becomes a live obligation on every broker we serve, and it should be read first.

### 2.5 Records, inspection and data **[JUDGMENT]**
- The broker must be able to **produce records to SEBI and the exchange**. If application records sit in our database, the contract must guarantee production and retention periods.
- **DPDP Act 2023** governs the investor data we hold. We already vault PII and capture itemised consent. **[VERIFIED — our own code]**
- **The partner print channel already stores the exact received payload immutably** (`Application.partnerPayload`), which is the right shape for a records obligation. **[VERIFIED — our own code]**

---

## 3. The rule most likely to catch us by surprise: association and return claims

**[VERIFIED]** On **22 October 2024** SEBI issued a circular restricting regulated entities from associating with persons who:
- give **investment advice or recommendations** without registration, or
- make **claims of returns or performance**, express or implied, in respect of a security, unless SEBI has permitted the claim.

It rests on amendments notified **26 August 2024** (SEBI (Intermediaries) (Amendment) Regulations, 2024, and companion amendments for exchanges/clearing corporations and depositories). Existing contracts had to be terminated within three months. A carve-out exists for **"Specified Digital Platforms"**; the recognition framework was at draft/consultation stage in late 2024 and **[UNVERIFIED]** whether it has been finalised.

### Why this is pointed at us specifically
We are **not SEBI-registered**. We would be associating with registered brokers. So the question is whether anything we publish is a *return or performance claim*.

**Grey Market Premium is exactly that shape.** Our own product shows "Exp. Premium" and an *"Est. gain at GMP"* figure. On our own B2C site that is a product decision with a disclaimer. **On a broker's branded site it is the broker making an implied return claim through us.**

### This is already handled in the product — and it is worth knowing how **[VERIFIED — our own code and live database]**
- Registering a tenant as a white-label forces `gmpEnabled: false` **and writes a `locked: true` setting** so it cannot be turned back on by the partner.
- Checked against the live database today: **FINWAVE carries `gmpEnabled: false` with `locked: true`.** The public registry serves `gmpEnabled: false` for them.
- `CLAUDE.md` already states the standing rules: *"Distribute + inform, don't advise — no recommendations, ratings or review scores"*, and GMP always with its disclaimer.

**[JUDGMENT]** That is a strong, enforced control and it should be stated plainly to every broker's compliance team — it is a reason to trust us, not a limitation to apologise for.

**[JUDGMENT] One gap we found while checking:** the GMP lock is applied **at registration**, for `kind: 'whitelabel'`. A tenant created as a Standard partner and later converted would not get the locked setting automatically. Small, and worth closing before the second white-label goes live.

**[FOR COUNSEL]** Two further questions this raises:
1. Does an **IPO subscription figure, allotment data or listing-performance history** count as a performance claim? Our reading is no — it is published exchange fact, not a claim about future return — but it is worth one line of advice.
2. Does our **own B2C site** publishing GMP affect a broker's ability to associate with us at all, even though their white-label has it switched off? **This is the question we would most want answered**, because the answer may be that the association rule looks at the *entity*, not the surface.

---

## 4. Grievance redressal — it must point at the broker, not at us

**[VERIFIED]** SCORES 2.0 (live from 1 April 2024) auto-routes complaints to the regulated entity with a uniform redressal timeline (reported as 21 calendar days; one secondary source says 30 — **check the circular**). Brokers must stay enrolled on SCORES and register on the **ODR portal**; the intermediary remains *directly responsible* for redressal.

**[JUDGMENT]** On a white-label site, an investor with a complaint must reach **the broker's** grievance officer and **the broker's** SCORES/ODR route. If they reach ours, we have inserted ourselves into a regulated process we are not party to.

**Already built for this [VERIFIED — our own code]:**
- A white-label **never inherits our identity**. Our legal name is substituted only for our own channel; a partner gets only their own trade name, and where they have supplied nothing the footer prints **nothing** rather than ours.
- **Grievance officer name and email are BLOCKING items** in the partner's content-gap list — a partner cannot be considered ready without them.
- About / Terms / Privacy / Disclaimer are **per-tenant**; an unpublished page reads *"not yet published"* and **never falls back to ours**. Verified live today: all four of FINWAVE's pages return empty, so their site shows the "not published" state rather than our Terms.

**[JUDGMENT] The remaining gap is ours to close with the partner, not in code:** FINWAVE has **not yet entered** their registered name, grievance officer or support contact. Until they do, their site is live without a complaint route. That should be a go-live gate in the partner onboarding checklist.

---

## 5. Exchange-level requirements — the biggest genuine unknown

**[UNVERIFIED — and we should not guess]** We could not find, in public circulars, a vendor-empanelment or software-approval regime that covers an **IPO/ASBA client-facing platform** supplied to a broker.

What we did find, and what it suggests:
- Exchanges run a defined **approval process for broker software**, deciding within fifteen working days of a complete application, and must satisfy themselves that SEBI/exchange software requirements are met.
- There is a formal **vendor/ASP empanelment** regime, clearly established for **algo trading** tools, where third-party providers must be empanelled and each algorithm registered.
- NSE's empanelment page references a master circular **NSE/INVG/73992 dated 30 April 2026**.
- **Nothing found for IPO/ASBA platforms specifically, and nothing found for BSE vendor approval at all.**

**[JUDGMENT] Do not conclude from this that no approval is needed.** Absence from public search is not absence from the rulebook — the June 2026 note made exactly this point about broker IPO APIs, and was right to. **The answer should come from the exchange, in writing**, through the broker's membership desk or ours.

**Questions to put to NSE and BSE in writing:**
1. Does a broker need exchange approval to deploy a third-party white-label platform through which their clients submit IPO applications?
2. Is there a vendor empanelment category that covers an IPO/ASBA application platform, as there is for algo vendors?
3. Does a system audit of the broker extend to our platform, and in what form?
4. Under which membership must an IPO bid originating from a white-label site be uploaded — the broker's, or the distributor's empanelment? *(This is §0, asked of the people who actually decide it.)*

**[UNVERIFIED] Also worth confirming:** search results referred to **"SEBI (Stock Brokers) Regulations, 2026"**, which suggests the broker regulations were recast this year. If so, the Master Circular items cited here may have moved. Read the current consolidation.

---

## 6. What we already have that answers a broker's due diligence

Stated plainly because this is the half of the conversation we are strong in. All **[VERIFIED — our own code, configuration and live database]**.

| What a broker will ask | Where we stand |
|---|---|
| Where is our data stored? | On a single server in India. **No cloud provider in the chain**, so no cross-border processing question. |
| Can another partner see our clients? | No. Row-level security scopes applications and investor profiles per tenant; partner reports are scope-locked to their own tenant. |
| Is PII encrypted? | Yes — PAN and bank data are vault-tokenised, with an envelope-encrypted key. |
| Is there an audit trail? | Yes — `AuditLog`, plus a per-call Partner API log and an immutable payload snapshot on every print. |
| Can you make a return claim to our clients? | No — GMP is **force-disabled and locked** for every white-label tenant. |
| Will our clients see your brand? | No — identity, legal entity, footer, legal pages, browser tab and favicon are all per-tenant, and ours are never inherited. |
| Will our clients see your Terms? | No — an unpublished legal page says so rather than serving ours. |
| Do you give investment advice? | No. Standing product rule: distribute and inform, no recommendations, ratings or review scores. |
| DPDP consent? | Itemised, just-in-time, with a vaulted PII store. |

### Gaps we can see in our own position **[JUDGMENT]**
These are ours to fix, and a competent broker's audit will find them:

1. **No ISO 27001, no SOC 2, no CERT-In VAPT report.** The single biggest commercial blocker to a serious broker's vendor onboarding. Everything else on the list above is worth less without one of these.
2. **No documented BCP/DR, RTO or RPO.** We run on one Windows server. A broker whose IPO channel depends on us will ask what happens when it fails, and today we have no answer on paper.
3. **No status page or formal incident-notification path** to partners — see §2.3.
4. **No vendor security pack / DPA template** to hand a broker's compliance team. Every onboarding will otherwise be bespoke.
5. **No per-tenant control over whether a partner's clients can place a rail bid.** Checked today: the tenant feature flags are `gmpEnabled`, `familyApply`, `watchlistEnabled`, `maxFamilyMembers`, `upiCap`, `whatsappChannel` — **there is no flag that turns the apply/bid surface off for one partner**. Given §0 is unresolved, that control should exist before the rail goes live.
6. **The GMP lock is applied at registration only** — see §3.
7. **Email has never been proven end to end**, and `investoyard.com`'s SPF currently authorises Microsoft 365 while the platform sends through a different provider. Partner activation links and grievance correspondence both depend on mail arriving.

---

## 7. Questions for sir

These are the ones we genuinely cannot answer from the code or from public circulars.

1. **§0 — whose membership carries the bid?** Everything else follows from this. If the intent is that the broker remains the intermediary of record, the rail must take *their* credentials, and that is engineering work nobody has scoped.
2. **Is the white-label offer meant to include the rail bid at all**, or is the commercial offer information + print forms, with the broker's own existing IPO channel doing the bidding? The second is dramatically simpler and is what is live today.
3. **Do we intend to pay brokers anything per application or per client?** If so the referral / Authorised Person analysis from the June 2026 note reopens, and it was parked as unsettled for good reason.
4. **Should our own B2C site keep publishing GMP** once we are a vendor to registered brokers? See §3 — the association rule may look at the entity rather than the surface, and this is the question we would put to counsel first.
5. **Who is our Compliance Officer for this line of business**, and will we commit to ISO 27001 / VAPT? Without it, serious brokers will not clear vendor onboarding whatever the contract says.

---

## 8. Recommended sequence **[JUDGMENT]**

1. **Counsel opinion on §0 and §3.4** before any bid rail goes live, and before the second white-label signs.
2. **Write to NSE and BSE** with the four questions in §5. Get it in writing.
3. **Build the vendor pack** — data-flow diagram, sub-processor list, retention and exit plan, DPA, incident-notification SLA. This is a week of work and it unblocks every broker conversation.
4. **Commission a VAPT** by a CERT-In empanelled vendor; plan for ISO 27001.
5. **Close the product gaps** in §6: the per-tenant apply switch, the GMP lock on conversion, and a documented DR position.
6. **Make the partner go-live checklist a gate** — registered name, grievance officer and support contact entered before their domain serves a single client. FINWAVE is live without them today.

---

## Sources

Primary circulars should be read on sebi.gov.in; several items below are secondary commentary and are flagged as such in the text.

- [SEBI — Guidelines on Outsourcing of Activities by Intermediaries (CIR/MIRSD/24/2011)](https://www.voiceofca.in/siteadmin/document/SEBI_Guidelines_outsourcing.pdf)
- [Master Circular for Stock Brokers (19 June 2025 consolidation, as republished by MSEI)](https://www.msei.in/SX-Content/Circulars/2025/June/Circular-17380.pdf)
- [Delegation Without Abdication: Inside SEBI's Outsourcing Rules for Intermediaries](https://www.indialaw.in/blog/regulatory/sebi-outsourcing-guidelines/)
- [SEBI CSCRF — compliance guidance for stock brokers and trading members (secondary)](https://www.bachao.ai/blog/sebi-cscrf-compliance-stockbrokers-2026-complete-guide)
- [Vendor risk management under RBI, SEBI and IRDAI guidelines (secondary)](https://shieldbyteinfosec.com/blog/vendor-risk-management-under-rbi-sebi-and-irda-guidelines/)
- [SEBI circular dated 9 January 2026 — review of the framework for technical glitches in stock brokers' electronic trading systems (secondary)](https://www.mehta-mehta.com/the-sebi-circular-dated-january-09-2026-review-of-framework-to-address-the-technical-glitches-in-stock-brokers-electronic-trading-systems/)
- [JSA Prism — technical glitches framework (secondary)](https://www.jsalaw.com/wp-content/uploads/2025/04/JSA-Prism-Securities-April-2025-Technical-Glitches.Final_.pdf)
- [SEBI directs regulated entities to end ties with unregistered advisors — 22 October 2024 circular (press)](https://www.business-standard.com/finance/news/sebi-gives-3-month-window-to-end-associations-with-unregistered-entities-124102201169_1.html)
- [Registered entities to cut ties with unregistered financial advisors (legal commentary)](https://www.lexology.com/library/detail.aspx?g=a0db81bf-7f03-4b71-b253-f0ea0d0c79ff)
- [Draft SEBI circular on recognition as a Specified Digital Platform](https://taxguru.in/sebi/draft-sebi-circular-recognition-digital-platform.html)
- [SEBI — Trading Software and Technology (Chapter 2, software approval timelines)](https://www.sebi.gov.in/sebi_data/commondocs/jul-2021/Chapter%202%20-%20Trading%20Software%20and%20Technology_p.pdf)
- [NSE — empanelled vendors for trading members](https://www.nseindia.com/static/trade/platform-services-non-neat-empanelled-vendors-of-the-exchange)
- [NSE circular — distribution of third-party products by trading members](https://groups.google.com/g/secmarkupdates/c/nNz73pWif3I)
- [SEBI circular on Online Dispute Resolution](https://eclerx.com/wp-content/uploads/2023/11/SEBI-Circular-for-Online-Dispute-Resolution.pdf)
- [SEBI (Stock Brokers) Regulations, 2026 — key provisions (secondary; confirms a 2026 recast exists)](https://www.scconline.com/blog/post/2026/01/10/sebi-stock-broker-regulation-2026-explained/)

**Related internal documents:** `docs/FINWAVE IPO App - Compliant Architecture & Partner Commission Structuring.md` (June 2026 — the B2C/referral direction, still the authority on the UPI-ASBA rail rule, the self-PAN rule and the deferred commission module) and `docs/Investoyard - DPDP Consent & Notice Screens.md`.

---

# Appendix A — the five follow-up questions (15 October 2026)

> Everything measured here was measured on this server on 15 October 2026 and is tagged
> **[MEASURED]**. Where a figure rots, the date beside it is what it was true on.

---

## A1. ISO 27001, SOC 2, VAPT — "is our product compatible with all this?"

**Yes. The product is not the obstacle — the operation is.** These are three different
things and it is worth not treating them as one:

| | What it actually certifies | Can we start today? |
|---|---|---|
| **VAPT** | A *test* of the running system by a (preferably CERT-In empanelled) firm | **Yes, immediately.** Nothing needs redesigning first. |
| **ISO 27001** | The **organisation's** information-security management system — policies, risk register, access control, supplier management, incident process, internal audit | Yes, but it is 4–6 months of management work, not engineering |
| **SOC 2** | A US/AICPA attestation. Type I is a point in time; **Type II needs 3–12 months of evidence first** | Only after the controls exist and are producing evidence |

**[JUDGMENT] Indian brokers ask for ISO 27001 and a VAPT report first.** SOC 2 comes up
mainly where a counterparty is US-facing. Do the VAPT now; treat ISO 27001 as the
commercial unlock; raise SOC 2 only when a broker actually asks.

### What the product already has, and it is more than most vendors bring **[MEASURED]**
Data in India on our own hardware with **no cloud provider and so no sub-processor chain**
· PII vault-tokenised with an envelope-encrypted key · row-level security scoping
applications and investor profiles per tenant · an `AuditLog` plus a per-call Partner API
log · an immutable payload snapshot on every print · per-tenant isolation that a partner's
own reports cannot see past.

### What would fail an audit today, in the order an auditor will find it **[MEASURED]**
1. **There are no application logs at all.** `web.config` sets `loggingEnabled="false"`,
   which `CLAUDE.md` records four times as a *diagnosis* obstacle. It is also a
   **compliance** obstacle: every one of these frameworks asks you to demonstrate
   monitoring and detection, and none of that can be shown without logs. This is the
   cheapest item on the list and the one that appears in every report.
2. **No backups.** See A2 — this is the serious one.
3. **No documented BCP/DR, RTO or RPO.**
4. **No policies, risk register, access-review evidence or supplier-management records.**
   ISO 27001 is mostly this, and none of it exists in writing.
5. **`RAIL_CALLBACK_AUTH` is in pass-through**, already a standing open item.
6. **No DPA or vendor security pack** to hand a broker's compliance team.

**[JUDGMENT] The honest summary for sir: nothing in the architecture needs changing to
pass. What is missing is paperwork, logging and backup — and of those, only backup is
urgent.**

---

## A2. BCP/DR — "what can we do and what's required?"

### What we found, and it is worse than "undocumented" **[MEASURED 15 Oct 2026]**

> **THERE IS NO BACKUP OF THIS PLATFORM. NONE.**

- **No database dump exists anywhere on either drive.** The `backups` folder in
  `C:\ProgramData\Investoyard\` holds only small JSON snapshots taken before individual
  repair scripts — change-safety nets, not backups. The largest is 3 MB.
- **216 MB of Postgres data and 156 MB of uploads (204 files) sit on this machine's disk
  and nowhere else.** The uploads are every DRHP, ASBA template, registrar file and
  partner logo.
- **All five PII vault keys are on this machine**, including the primary. `CLAUDE.md` has
  said *"Back it up OFF this machine"* since 28 September. It has not been done. **Losing
  that key loses every vaulted PAN and silently breaks the self-PAN duplicate rule.**
- **No scheduled task backs Investoyard up** — while `FinwaveEKYC-Backup-Full`, for a
  *different* project on this same box, **ran at 02:00 this morning.**

**[JUDGMENT] That last line is the useful one.** This is not "we must build backup
infrastructure". The capability and the habit already exist on this server and were never
pointed at Investoyard. A disk failure today would end the business — 1,260 IPO records,
1,328 partner prints, 2.26 lakh allotment rows, every uploaded document and the vault key,
with nothing to restore from.

### What the frameworks actually require
A broker's system audit covers **disaster recovery and business continuity**, scaled to
the broker's size, and CSCRF expects an exit/portability plan from material vendors. In
practice an auditor asks four questions: *What is your RTO? What is your RPO? When did you
last test a restore? Show me the runbook.*

### The ladder, cheapest first **[JUDGMENT]**

1. **Back up three things off this machine** — `pg_dump` of the database, the `uploads`
   folder, and the PII vault key. **The whole footprint is about 372 MB.** Copy the
   existing scheduled-task pattern from the other project.
2. **Restore it somewhere else and prove it works.** An untested backup is not a backup,
   and this project has already learned that a script reporting success has only proved it
   issued the write. **Steps 1 and 2 are a day's work and they remove the only risk that
   can end the business.**
3. **Write down RTO and RPO.** This needs sir, not engineering — and the IPO window makes
   it sharp: three hours down on a closing afternoon is a different event from three hours
   down on a Sunday, and the poller's lost bidding day is unrecoverable either way.
4. **Write the runbook** — reboot order is already documented (`db.ps1`, `redis.ps1`, the
   pool handshake); this is collecting it into one page a second person could follow.
5. **A warm standby** is the only thing that gives a real RTO. Everything above is
   recovery; this is continuity. It is the expensive step and it should wait until 1–4 are
   done.

**The vault key alone is worth doing this afternoon**, separately from the rest.

---

## A3. "No per-tenant switch to disable the rail bid" — what that means

**Measured in the code today [MEASURED]:**

- The Apply button is gated on **one thing**: the per-IPO operator toggle
  `extra.startBid`. The tenant is consulted only for `upiCap`, a rupee limit.
- **So turning Start Bid on for an IPO turns it on for EVERY channel at once** — our own
  site and every white-label partner's domain, with no way to say *"FINWAVE's clients may
  read the information site but must not place bids through our rail."*
- **And the server never checks it.** `ApplicationsService.create()` validates profile
  ownership, the demat account, cut-off eligibility, the category caps, the ₹5 L UPI limit
  and the PAN — but there is **no `startBid` check and no bidding-window check**. The two
  references to `closeDate` in that file are display-only.

**[JUDGMENT] Two separate problems, and the second is the bigger one.**

The missing switch matters because **§0 of this brief is unresolved**: until we know whose
membership carries the bid, "this partner's clients do not bid through us" is a sentence
we cannot express in the product.

But the gate being **client-side only** is the sharper issue. An operator toggle that only
hides a button is a convention, not a control. On our own B2C site that is a product
decision. On a channel a SEBI-registered broker is relying on, a control their compliance
team is told exists must actually exist on the server.

**Not exploitable today** — the rail cannot reach an exchange without NSE UAT credentials,
so nothing can be submitted whatever the UI allows. **Both should be closed before the
rail goes live, not after**, and they are small: one tenant flag, one server-side check.

---

## A4. DPDP, cyber audit, system audit, VAPT, SOC — how compatible are we?

### The finding that puts us inside the perimeter **[VERIFIED]**
A broker's **cyber audit report under CSCRF must state the scope of what was audited,
including — explicitly — "linkage with vendor systems"**. So a broker's CERT-In empanelled
auditor will look at their connection to us. We are not adjacent to their audit; we are
named in it.

### System audit of stock brokers **[VERIFIED]**
- The framework dates from **6 November 2013**, with frequency set by how heavily the
  broker uses technology.
- **SEBI/HO/MIRSD/TPD/CIR/2025/10, 31 January 2025** overhauls its *supervision*, in force
  **from audit period FY 2025-26**: exchanges run a web platform to monitor the audit,
  auditors must physically visit the broker's premises and authenticate by OTP, auditors
  are empanelled by the exchange, with a **two-year cooling-off after three consecutive
  audits**.
- Scope named in the circular: **technical glitches, remedial action, capacity planning,
  software testing, logging compliance and disaster-recovery requirements.**
- A **BSE notice dated 22 April 2026** confirms the current cycle for the period ended
  31 March 2026 — and says brokers using **exchange-provided (BOLT) or ASP-provided
  software are not covered**. **[FOR COUNSEL / ASK THE EXCHANGE]** Whether a white-label
  IPO platform is "ASP-provided software" for this purpose is exactly the §5 question, and
  it cuts both ways.

### Cyber audit **[VERIFIED, from an NSDL implementation circular]**
Conducted **through a CERT-In empanelled auditor**, with the report stating coverage
across hardware, business applications, software, cyber governance **and vendor linkage**.
Frequency is reported inconsistently across sources (annual vs half-yearly) and **depends
on the broker's CSCRF tier — confirm per broker rather than assuming.**

### Also confirmed, and it supersedes part of this brief **[VERIFIED]**
**The SEBI (Stock Brokers) Regulations, 2026 were notified on 7 January 2026**, repealing
the 1992 framework. §5 of this brief flagged this as unverified; it is real. **Master
Circular items cited in §2 may have moved — read the current consolidation.**

### DPDP Act 2023 **[MEASURED — our own code]**
| Obligation | Where we stand |
|---|---|
| Lawful basis / consent | A `Consent` table with typed purposes — `service`, `marketing`, `data_sharing_rail`, `analytics`, `gmp_disclaimer` — each stamped with a `noticeVersion` and a `grantedAt` |
| Withdrawal | The schema carries `withdrawnAt`, so withdrawal is recordable |
| Purpose limitation | Separate consent types rather than one blanket tick |
| Data minimisation / security | PII vault-tokenised; recipients in the message log stored **masked** |
| Localisation | Everything in India, no sub-processors |
| **Gaps** | **No DPA with partners**, no written retention schedule, no documented breach-notification path to the Data Protection Board, and the single-checkbox itemised consent wording is already flagged in `CLAUDE.md` as needing counsel |

Live consent rows today: **16 `gmp_disclaimer`, 1 `data_sharing_rail`** — the layer works;
it has barely been exercised because the rail has not run.

---

## A5. Prior instructions for IPO bid placement — **the circular, supplied by the operator**

**[VERIFIED — read from the original PDF, not from search.]**
**NSE/INSP/71037, Circular Ref. No. 65/2025, dated 30 October 2025**, *"Prior instructions
for initial public offering (IPO) bid placement"*, addressed **To All Trading Members**.
BSE issued the matching notice the same day (`20251030-18`). It restates SEBI circulars
**SEBI/HO/CFD/DIL2/CIR/P/2018/138** (1 Nov 2018), **SEBI/HO/CFD/DIL2/CIR/P/2019/76**
(28 Jun 2019) and **SEBI/HO/CFD/DCR2/CIR/P/2019/133** (8 Nov 2019), with
**NSE/IPO/42640** (13 Nov 2019).

### What it requires
1. The investor submits a **complete bid-cum-application form** to the designated intermediary.
2. The intermediary gives an **acknowledgement at the time of receipt** — the counterfoil
   or the application number — as proof of having accepted the form, **physical or electronic**.
3. **Physical** forms from individual investors using UPI are retained **six months**, then
   forwarded to the issuer / RTA.
4. For **electronic** forms, printouts need not be kept, but **the electronic records must
   be maintained for a minimum of three years.**
5. *"Apart from the above, client may also submit IPO bids through the Online Platform
   provided by Trading Member, using secure login credentials (i.e. username and password)."*
6. **The finding that prompted it:** inspections observed *"IPO bids were uploaded on the
   Exchange bidding platform by Trading Members on behalf of clients without obtaining
   prior instructions (Physical/electronic) from the respective clients."*
7. **The reiteration:** trading members *shall take the prior instructions (physical/
   electronic) from the clients before placement of bids.*

### The distinction everything turns on **[JUDGMENT]**
> **Fetching a client's DETAILS is not obtaining their INSTRUCTION.**

Point 5 is the important one for us: the circular **explicitly recognises the online
platform route**, where the client's own authenticated submission *is* the instruction.
The breach it describes is a bid keyed in *for* a client who never asked.

### Two things that are NOT the prior instruction, and are easy to mistake for it
- **The UPI mandate is not prior.** In UPI-ASBA the intermediary uploads the bid first;
  the exchange passes it to the sponsor bank, then NPCI, then the investor's UPI app.
  **Mandate acceptance happens AFTER placement**, so it cannot satisfy a *prior*
  instruction however strong the evidence is.
- **Our DPDP data-sharing consent is not it either.** Its notice reads *"Share your PAN,
  demat and bank/UPI details … to place and process this IPO application"* — a permission
  to share data, not an instruction to place a specific bid.

### What we capture today, measured **[MEASURED 15 Oct 2026]**
| | |
|---|---|
| Consent row linked to each bid | **Yes** — `Application.consentId` → `Consent` |
| …but it is **REUSED** | `captureDataSharingConsent` does `findFirst({userId, type, noticeVersion, withdrawnAt: null})` and **returns the existing row**. So the `grantedAt` on the consent attached to a bid can predate that bid by months. |
| …and it answers the **wrong question** | type `data_sharing_rail`, notice `ds-rail-v1` — data sharing, not bid instruction |
| Who / what / when of the bid | `userId`, `lots`, `bidPrice`, `amount`, `dematAccountId`, `createdAt` (timestamptz) — **good** |
| **From where** | **Nothing.** No IP, no user-agent, no device or session reference on `Application` or on `Consent` |
| Immutable event trail | `ApplicationStatusEvent` exists and holds **0 rows** across **2,120** applications — every one is a print record that never transitioned |
| Acknowledgement to the investor | **None in the circular's sense.** `applicationNumber` is the *exchange's* number, arrives later, and is **null on every row** |
| 3-year retention | **Not guaranteed.** No written policy, and an operator hard-delete of a client (`admin.service.ts`) removes that client's applications, status events **and** consents in one transaction |

### The retention conflict worth putting to counsel **[FOR COUNSEL]**
That delete path exists as a DPDP erasure route. **It destroys exactly the electronic
record this circular requires to be kept for three years.** DPDP erasure and an exchange
retention floor pull in opposite directions, and which wins is a legal question, not an
engineering one. The audit row written before the delete is not a substitute — it records
that a deletion happened, not what the client instructed.

### Where we are already on the right side
**The Partner Print-PDF API produces a FORM, not a bid.** The investor signs it and it is
submitted at their own bank, so **the signed form IS the prior instruction** and the
six-month physical retention is the broker's, on paper they hold. The live B2B surface is
aligned with this circular; the exposure is entirely on the unbuilt rail.

### What a compliant rail would need **[JUDGMENT]**
1. **A per-bid instruction record, separate from the DPDP consent** — one row per bid,
   never reused, capturing who, what (symbol, category, lots, price or cut-off, amount,
   demat), when, **through which channel**, and **from where** (IP + user-agent).
2. **The declaration text the client actually saw, versioned**, as the consent notices
   already are.
3. **An acknowledgement at the moment of receipt** — our own reference shown on screen and
   sent to the investor, not the exchange number that arrives later.
4. **A retention guarantee of at least three years**, and a resolution of the conflict above.
5. **An export the TRADING MEMBER can produce in an inspection** — per client, per issue,
   showing the instruction and its evidence. They face the inspection, not us.

---

## Appendix A — what we would do first **[JUDGMENT]**

1. **Back up the database, the uploads and the vault key off this machine, and prove a
   restore.** A day's work. Nothing else on any of these lists matters if the disk dies.
2. **Turn on application logging.** One setting, and it is a finding in every framework.
3. **Book the VAPT.** It needs no preparation and it is the report brokers ask for first.
4. **Close the two rail-gate gaps** — a per-tenant switch and a server-side `startBid`
   check — before the rail goes live.
5. **Ask sir about A5**, and put the §5 questions to NSE and BSE in writing.
