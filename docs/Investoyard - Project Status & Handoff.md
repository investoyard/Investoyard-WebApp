# Investoyard — Project Status & Handoff

**Updated:** 8 October 2026
**What this is:** the single map of everything produced — strategy docs + the codebase — with what's live, what's built-but-unproven, and what now needs human action.

> **The previous revision of this doc was dated 21 June 2026 and described a pre-launch
> vertical slice** — Docker Postgres, 20 tests, "run-ready (not run here)", in-memory
> auth. All of that is long gone: the earliest catalogue row dates from **31 July 2026**
> and the **first real application from 8 September 2026**. If a figure here looks
> surprising, trust `CLAUDE.md`, which is
> maintained continuously; this doc is the periodic map, and any count in it is "as
> measured on the date beside it" — the catalogue grew by 9 records on the day this
> revision was written.

---

## 1. Where we are

Investoyard is a **B2C IPO information + application platform for India** (Mainboard + SME),
operated as an **independent** product that consumes the firm's existing **merchant-banker
IPO-distribution empanelment** (Axis Capital / Nuvama / JM Financial) as its application rail.

**It is live.** Web at `newipo.finwave.co` (Next.js static export served by IIS), API at
`newipoapi.finwave.co/api` (NestJS via iisnode), on portable Postgres + Redis — **no Docker**.
Operating entity: **Safal Capital Services Private Limited**.

**Three business models, one platform**: **M1 B2C — LIVE** → **M2 broker white-label — the
partner Print-PDF API and self-onboarding have shipped and a partner is using them** → M3 B2B2C.
Design philosophy: **"calm & data-clear"**. Brand: indigo `#3c2e7e` + gold `#ffcb32`.

### Measured 8 October 2026

| | |
|---|---|
| IPOs in the catalogue (none hidden) | **1,269** |
| …with a reservation table entered | 74 |
| …with subscription data | 1,458 rows |
| …with documents | 515 |
| Investor profiles | 230 |
| Applications | **1,651 — every one print-path** |
| Tenants | 3 (platform + partner) · 1 partner API key in use |
| Sponsor banks in the master | 5 (names resolve on 60/60 issues; **no email addresses yet**) |

**The single most important number: zero applications have ever reached an exchange.** All
1,651 are the print/ASBA channel. The bidding rail is built and unexercised — see §4.

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
| **Rail Integration Spec (NSE e-IPO + BSE)** | NSE API mapping; **the BSE gap is closed — see §4** |
| **Merchant-Banker BD Brief** | What to take into Axis/Nuvama/JM conversations |
| **Phased Build Roadmap** | MVP → Phase 2/3 sequencing |
| **DPDP Consent & Notice Screens** | Consent UX spec |
| **`ipo-entry-spec.md`** + sequence/brief/phase-0 survey | The IPO-entry rebuild. **Read the survey first, and note the scope caveat in §4.** |

Vendor-confidential exchange docs (the NSE zip, both BSE PDFs) live at
`D:\Claude\IPO Application\` — **deliberately outside the repo**; the BSE pair is
footer-marked BSE-INTERNAL.

---

## 3. The codebase (`D:\Investoyard\`)

Monorepo — npm workspaces + Turborepo, unified TypeScript. `npm run test` → **7 tasks green**.

```
investoyard/
├── apps/
│   ├── api/      NestJS — auth(OTP+JWT) · profiles(+family, multi-demat, PII vault) · ipo
│   │             · applications (queue-backed apply + print engine) · rail · bidding
│   │             · subscription poller · allotment imports · partner API · masters
│   │             · messaging (SMS/email/WhatsApp + delivery log) · notifications
│   ├── web/      Next.js STATIC EXPORT — public site (SEO, hubs, archive) + the full
│   │             admin console (catalog, masters, bidding, partner API, reports)
│   └── mobile/   Expo SDK 54 — 5 tabs: Home · Insights · Applications · Profiles · Account
└── packages/
    ├── rail-adapters/   NSE e-IPO (v1.20.5) + BSE iBBS + callbacks + submission worker
    │                    + buildBidSubmission — 74 tests
    ├── shared-types/    ONE contract + the domain engines (issue, bid, stage, demat,
    │                    unblock, sponsor-bank, format) — 281 tests
    ├── design-tokens/   brand palette + scales
    └── i18n/            en + hi live; ta/te/bn/mr scaffolded
```

**The one-source rule is the main architectural discipline here**, and it was arrived at the
hard way — the same derivation has been found living in three or four places more than once
(three mappers into `computeIssue`, four readers of `sharesUpper`, three copies of the
minimum-bid rule of which two were wrong by ~4.8×). Derived figures used by more than one
surface belong in `packages/shared-types`, and web/mobile import rather than re-implement.

**To run locally:** `RUNNING.md`. **For anything touching production: `CLAUDE.md` is the
authority** — the API deploy needs an app-pool handshake, `apps/api/dist` holds live operator
uploads, and the subscription poller cannot survive an IIS idle timeout.

---

## 4. Live vs built-but-unproven vs stubbed

### Live and exercised
- The **public site and admin console** in full: catalogue, masters, IPO entry with the
  validation engine, Excel import, allotment imports (worker-process parsing), GMP entry,
  news, reports, audit, RBAC with custom roles.
- The **subscription poller** — 10:00–18:00 IST, live-tunable cadence, writing day-wise and
  hourly history.
- The **print / ASBA engine** — AcroForm filling with an overlay fallback, flattened so it
  survives WhatsApp's viewer (which ignores `/NeedAppearances`).
- The **partner API (M2)** — a partner-issued key has been printing real forms; the print
  report, its View modal and the docs tester all work end to end.
- **Messaging** — real OTP SMS, with every send logged from the leaf adapters.

### Built, deployed, and NOT yet proven against a counterparty
- **The bidding rail.** The NSE adapter matches the verified v1.20.5 doc; the BSE adapter
  matches the domestic iBBS doc that **arrived 2026-09-02** (that BD item is closed). Neither
  has had a UAT run, and **no bid has ever been placed** — so the whole surface, including the
  UPI status callbacks and the exchange-modify path, is unexercised. Not implemented at all:
  `ipoupistatus`, `ipoappenquiry`, `ipodeltadownload`, the Bid Upload API.
- **Sir's four mobile requirements, all shipped 2026-10-07/08**: multiple demat accounts per
  applicant · live UPI payment status · on-the-spot UPI ID change · sponsor-bank unblock email.
  Each is deployed and verified as far as it can be without an exchange or a proven mailbox.
- **Email.** Configured since 2026-09-28; **no send has ever been verified**. That leaves both
  the unblock request and the partner-activation email unproven — which is why partner approval
  still surfaces a copyable activation link.

### Genuinely stubbed
- **FCM / APNs push** — persistence and device fan-out are real, the provider handshake logs.
- **PII vault** is a local key file; the KMS provider exists and activates on `KMS_KEY_ID`.

### Known live gaps worth an owner
- **`RAIL_CALLBACK_AUTH` is commented out in prod**, so the exchange-callback guard is in
  pass-through. Not exploitable today (no application carries an exchange number, so no row can
  be matched) but **must be enabled before UAT**.
- **The IPO-entry screen is a narrower structural fix, not the 8-phase rebuild** in the brief.
  Anyone measuring it against the spec must be told which scope is in force. Seed config
  (Phase 1) is not built, so a SEBI amendment is still a deploy.
- **Operator data is the long tail**: only 74 of 1,269 records carry a reservation table, which
  is why most detail pages show a dimmed `—` for Book Size. **As last swept (2026-09-30)** the
  engine raised issues on only four records, each a real named defect — down from 512 firings
  that morning, almost all of which were one rule complaining about records nobody had entered
  an offer structure into. Re-sweep before quoting that figure; two carve-out faults were fixed
  on 3 October and the sweep has not been re-run since.
- The **two UNDER REVIEW UI candidates** (4 brand slides + `PASTEL_TWINS`; `/homeold` with the
  `v2` flags) must be collapsed once decided.

---

## 5. What needs YOU (human-action items)

**The three that block shipped features — all small**
- [ ] **Add email addresses to the five sponsor-bank master rows** (admin → Masters → Sponsor
      Banks). Names already resolve on 60/60 issues; without addresses the unblock request
      finds the right bank and stops.
- [ ] **Prove an SMTP send** (admin → System Settings → Message Log → a template's Test
      button). Five minutes, and it is the last blocker on the unblock email.
- [ ] **Set `RAIL_CALLBACK_AUTH=enabled`** in `apps/api/.env` + restart the pool, before UAT.

**Legal / compliance** *(send the Rev.2 architecture doc + the [FOR COUNSEL] items)*
- [ ] Confirm the independent-app + merchant-banker-rail structure and the app's
      characterisation (tech/referral, not unregistered intermediary)
- [ ] Sign off the **partner-commission** approach (deferred module) given the unsettled SEBI
      referral regime
- [ ] Confirm B2C self-serve distribution sits within existing partner agreements; DPDP
      specifics; SDF/DPO threshold
- [ ] **The raw-PAN allotment store** (registrar allottee rows are stored unmasked by operator
      decision, admin-only) and the **single-checkbox itemised consent** wording
- [ ] Two **FAQ answers were drafted by Claude**, not the operator, and one makes a positioning
      claim ("you don't need to move your demat to us"). Reviewed and kept 2026-08-27 — treat as
      approved copy.

**Business development**
- [ ] Take the **BD Brief** into Axis / Nuvama / JM — resolve **API vs portal** submission +
      commission in a B2C context; pick the **launch-rail** house and **get UAT credentials.
      This is the single thing blocking the entire bidding surface.**
- [x] ~~Obtain the domestic BSE iBBS API doc~~ — **arrived 2026-09-02**; the adapter matches it.

**Brand / content**
- [ ] **Native Hindi review** of the i18n strings, including the newer mobile screens and the
      front-site feature pages (currently EN-literal)
- [ ] Provide the **white logo variant** + confirm the typeface
- [ ] Trademark + domain/app-store name clearance for "Investoyard"
- [ ] An **EAS Android build** needs an Expo account + icon; the `/home2` app teaser uses our own
      squircle rather than a Play badge, because a store badge implies a listing that does not
      exist yet

**Infra / data**
- [ ] **Back the PII vault key up OFF this machine.** `C:\ProgramData\Investoyard\pii-vault.key`
      is the single point of total data loss — losing it silently breaks duplicate detection
      (`panHash` is derived from it), which is worse than losing a credential because a lost
      credential announces itself. A dated copy sits beside it; that survives a bad command, not
      a lost disk.
- [ ] Stand up AWS (ap-south-1) for shared envs; move the vault to KMS
- [ ] Contract live **data feeds** (IPO master, subscription, GMP, allotment/RTA, RHP)
- [ ] **Decide the pending display question**: should the customer-facing Issue Size carry
      decimals (`₹150.71 Cr`) rather than rounding to the crore (`₹151 Cr`)?
- [ ] **Confirm AUGMONT's RHP** employee count (2,76,400 was reconstructed from 0.691%, not
      read) and whether it carries a discount; **KHERIAAUTO**'s market maker at 4.55% against
      the 5% floor; **ARDEE / PRIORITY / ANNU**, which each need an RHP

---

## 6. Suggested next phases (engineering)

1. **Close the three small blockers in §5** — sponsor-bank emails, a proven SMTP send, callback
   auth on. Hours, not days, and they finish features that are otherwise complete.
2. **UAT the rail** the moment credentials land. Everything is in place and nothing is proven;
   expect the first run to find things no amount of reading the doc can (the submission builder
   had five fatal faults hiding under an `any` return type until it was given a test).
3. **Finish the apply lifecycle** against a real exchange — UPI mandate handoff, the
   `ipoupistatus` per-bid pull (which is also what a consumer-facing Refresh button needs),
   allotment reconciliation.
4. **Operator data** — reservation tables are the highest-leverage gap: 74 of 1,269. The daily
   readiness card on the admin dashboard now names every open issue the poller cannot compute,
   with trading days lost and left, because ten SME issues once closed with no subscription
   history at all and that loss is permanent.
5. **The deferred structural work** — the status machine and entity tables, seed config for the
   rule pack, a REIT/InvIT rule pack *before* the category is exposed, buyback + standalone OFS.
   All are far cheaper before the full historical catalogue lands.

---

### One-line status
**Live and earning its keep on the print rail · the bidding rail is built, deployed and
completely unproven pending UAT credentials · three small human actions would finish four
features that are otherwise done.**
