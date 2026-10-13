# IPO Entry Form — Implementation Brief

**For:** Claude Code, working in the IPO Portal repo.
**Companion documents:**
`docs/ipo-entry-spec.md` — the authoritative design spec (*what* to build).
`docs/ipo-entry-sequence-and-public-contract.md` — entry order, field lifecycles
and the public B2C payload contract (*in what order*, and *what the website
depends on*).
This brief tells you *how to sequence the work*. Read all three in full before
writing any code.

---

## The prompt to paste into Claude Code

> Read `docs/ipo-entry-spec.md`,
> `docs/ipo-entry-sequence-and-public-contract.md` and
> `docs/ipo-entry-implementation-brief.md` in full before doing anything. Then
> execute Phase 0 only and stop for review. Do not start Phase 1 until I approve
> the Phase 0 output.

Then approve each phase in turn. Do not let it run phases back to back — the
engine in Phase 2 is the foundation for everything after it, and a defect there
propagates silently.

---

## 1. What this change is

The legacy IPO entry form captures the same facts two or three times across
different tabs, stores computed values as if they were inputs, and hard-codes
one specific regulatory shape (ICDR 6(2), Mainboard, book-built) into the form
layout. This has already produced live data defects.

The replacement keeps the same tabbed shell, but:

- **Inputs are entered once.** Everything computable becomes a read-only
  projection of a single pure function.
- **Regulatory constants move into a versioned config** (the "rule pack") keyed
  on `(board, mechanism, regulation_basis)`.
- **Four independent status toggles collapse into one state machine** with
  derived capabilities.
- **Two new entities appear** that the legacy form lacks entirely: the offer
  composition (Fresh Issue / OFS) and the carve-out table.

---

## 2. Non-negotiables

These are the constraints most likely to be eroded during implementation. Treat
them as invariants, not preferences.

1. **No computed value is ever persisted to a mutable column.** The only
   exception is the immutable `ipo_derived_snapshot` written at `ALLOTTED`.
   If you find yourself adding a `share_count` column that a user or a cron job
   updates, stop — that is the defect this project exists to remove.

2. **The engine ships before the UI.** Phase 2 must pass its full test suite
   before any React work begins. Do not scaffold forms early "to visualise it".

3. **Regulatory numbers live in seed config, never in source.** No literal `75`,
   `60`, `200000` or `1000000` anywhere outside the rule-pack seed files.
   Grep for these before declaring a phase done.

4. **Rounding is `floor_to_lot` everywhere, with residual absorption.** Never
   `Math.round`, never banker's rounding, never a per-category fudge. The spec's
   §5 Step 3 reproduces the live legacy data exactly — that is the proof it is
   correct.

5. **Do not delete legacy data during migration.** Phase 7 is additive and
   reversible. Legacy IPOs that cannot be fully mapped get flagged, not dropped.

6. **Existing listed IPOs must keep their published numbers.** If recomputation
   disagrees with what was published, the published figure wins and the
   discrepancy is reported — never silently corrected on a live page.

---

## 3. Legacy field disposition

Every field on the current five tabs. `KEEP` = same meaning, possibly moved.
`DERIVE` = becomes read-only output. `DROP` = removed entirely.

### Basic Details → Basic Information

| Legacy field | Action | Destination / note |
|---|---|---|
| IPO Name / Company | KEEP | `ipo.company_name` |
| Symbol | KEEP | `ipo.symbol` — uppercase, unique |
| Issue Type (`IPO`) | KEEP | `ipo.instrument` |
| IPO Category (`Mainboard`) | KEEP, rename | `ipo.board` — add `SME` + `sme_platform` |
| ISIN | KEEP | add checksum validation |
| Face Value | KEEP | tab 1 |
| Lot Size | MOVE | tab 2 (Pricing) — it is a pricing parameter |
| Is Active | **DROP** | derived from `status` + `publish_enabled` |
| Shareholder Allowed | **DROP** | replaced by presence of a `SHAREHOLDER` carve-out row |
| Employee Allowed | **DROP** | replaced by presence of an `EMPLOYEE` carve-out row |
| Start Bid | **DROP** | derived `can_bid` |
| Start Printing | **DROP** | derived `can_print` |
| Live subscription | **DROP** | derived `shows_live_subscription`; keep the *Refresh now* action |
| — | NEW | `mechanism`, `regulation_basis`, `exchanges`, `cin`, `bse_scrip_code` |

### Basic Details → Pricing & Issue

| Legacy field | Action | Destination / note |
|---|---|---|
| Price band — min / max | KEEP | tab 2 |
| Retail Discount | KEEP | tab 2 |
| Retail Cut Off | **DERIVE** | `price_cap − retail_discount`; remove the input |
| Max amt — Retail (200000) | **MOVE** | rule pack `application_thresholds.RETAIL.max_amount` |
| No. of App (20069) | **DERIVE** | `apps_for_1x_retail`, surfaced on tab 3 |
| — | NEW | `fixed_price`, `tick_size`, `employee_discount`, `shareholder_discount`, `anchor_price`, `final_issue_price` |

### Basic Details → Important Dates

| Legacy field | Action | Destination / note |
|---|---|---|
| Anchor date | MOVE | `ipo_bid_window` row `ANCHOR` |
| Issue Open | MOVE | `opens_at` on every non-anchor window |
| Issue Close | MOVE | `closes_at` on the `RETAIL` window |
| Issue Close — QIB | MOVE | `closes_at` on `QIB` and `NII` windows — remove the "internal" hint |
| Basis of allotment / Refund / Demat credit / Listing | KEEP | `ipo_milestone` |
| — | NEW | `upi_mandate_cutoff`, anchor lock-in tranches, working-day calendar |

### Basic Details → Partners

| Legacy field | Action | Destination / note |
|---|---|---|
| IPO Partner | MOVE | `ipo_intermediary` role `IPO_PARTNER` |
| Syndicate / Lead Managers | MOVE, **split** | roles `BRLM` and `SYNDICATE_MEMBER` are different things |
| Registrar Information | MOVE, **type-constrain** | role `REGISTRAR`, `party_type` must be `RTA` |
| — | NEW | `SPONSOR_BANK`, `ESCROW_BANK`, `REFUND_BANK`, `PUBLIC_ISSUE_BANK`, `MARKET_MAKER`, `UNDERWRITER` |

> The live record has Registrar = "AXIS BANK". After type-constraining, this
> record will fail validation on migration. That is the intended behaviour —
> Axis Bank is the sponsor or escrow bank, not the RTA. Flag it for manual fix.

### Shares & Reservation

| Legacy field | Action | Destination / note |
|---|---|---|
| "Shares Size Info" grid (entire block) | **DROP** | replaced by the derived panel |
| — Share column per category | **DERIVE** | §5 Step 3 |
| — Min Price (Cr) / Max Price (Cr) | **DERIVE** | the two price scenarios |
| — NCD Max Price / IND / HNI columns | **DROP** | debt-issue fields; belong on an NCD form |
| — Total / Anchor / QIB Post Anchor rows | **DERIVE** | §5 Steps 3–4 |
| Category tick-boxes | **DROP** | a category exists iff it has a rule-pack entry |
| SHARE(%) | **KEEP** | the only manual input in the block |
| SHARE COUNT | **DERIVE** | |
| CATEGORY REMARK | **DERIVE** | generated string, §5 Step 7 |
| REQUIRE FOR 1X | **DERIVE** | expose both `apps_for_1x` and `max_allottees` |
| Remarks | KEEP | free text for RHP language |
| Remarks 2 (`BRLMs: …`) | **DROP** | duplicates `ipo_intermediary`; render from there |
| — | NEW | `ipo_offer`, `ipo_selling_shareholder`, `ipo_carveout`, `ipo_anchor` |

### About Company

| Legacy field | Action | Destination / note |
|---|---|---|
| Anchor investors picker | MOVE | tab 3, under the Anchor sub-section (it validates against `anchor_shares`) |
| Company Logo / Website / Promoter | KEEP | |
| Company Info (rich text) | KEEP | |
| Company Strength (rich text) | KEEP | |
| Company Financials (rich text + table) | **REPLACE** | structured `ipo_financial_period` rows; render the table from them |
| — auto-summary sentence | **FIX** | suppress percentage change across a sign flip (W07) |
| Objects of the Issue (rich text table) | **REPLACE** | structured `ipo_object` rows; enables B16 |
| Company Contact Info | KEEP | |
| FAQs | KEEP | |

### Documents

| Legacy field | Action | Destination / note |
|---|---|---|
| Documents uploader | KEEP | add `doc_type` enum (`RHP`, `DRHP`, `PROSPECTUS`, `PRICE_BAND_AD`, `OTHER`) |
| ASBA Resident form | KEEP | add `field_map_json` — replacing a PDF currently breaks prefill silently |
| ASBA Syndicate form | KEEP | same |

### Application Series

Not yet reviewed. Implement per spec §2.14 as a **draft**, behind a feature flag,
and surface a TODO. Do not migrate legacy series data until the tab is confirmed.

---

## 4. Phases

Each phase ends with a checkpoint. Stop and report; do not proceed unprompted.

### Phase 0 — Survey (no code)

Produce a written report covering:

- Current schema for every legacy field in §3, with actual column names and types.
- Where each computed value is currently written, and by what (form submit,
  trigger, cron, service).
- Every read path that consumes those computed columns — public IPO page, ASBA
  print job, subscription screen, exports, reports, mobile app API.
- Count of existing IPO records by status, and how many are listed/closed.
- A risk list: anything in the codebase that will break when computed columns
  become read-only.

**Checkpoint:** I review the report and confirm the phase plan before Phase 1.

### Phase 1 — Schema and rule packs

- Migrations for all entities in spec §2. Additive only; no drops yet.
- Rule-pack table plus seed files for:
  `MAINBOARD/BOOK_BUILT/ICDR_6_1`, `MAINBOARD/BOOK_BUILT/ICDR_6_2`,
  `MAINBOARD/FIXED_PRICE`, `SME/BOOK_BUILT`, `SME/FIXED_PRICE`.
- Working-day calendar table plus an exchange-holiday seed for the current and
  next calendar year.
- Mark every regulatory constant in the seed with a `-- VERIFY` comment.

**Checkpoint:** seed values reviewed against ICDR before Phase 2.

### Phase 2 — Derivation engine (the critical phase)

- Implement `computeIssue(inputs, rulePack) -> derived` as a pure function with
  no I/O, no database access, no framework dependency.
- Implement all seven steps of spec §5 in order.
- Unit tests asserting **every** value in the spec §9 fixture, at cap and at floor.
- Property tests: for any valid input, `Σ category shares == net_offer_shares`
  and every category count is a multiple of `lot_size`.

**Do not begin Phase 3 until the fixture passes in full.** If a fixture value
disagrees with your implementation, the fixture is right — it was reconciled
against live legacy data.

**Checkpoint:** test output reviewed.

### Phase 3 — Validation catalogue

- Implement B01–B23 and W01–W08 from spec §6 as a declarative rule list, not
  scattered `if` statements. Each rule returns `{ code, severity, message, field }`.
- One negative test per rule, including the eight cases in spec §9.
- B02 must reject the legacy HNI Big/Small swap under `ICDR_6_2`.

**Checkpoint:** all rules covered by tests.

### Phase 4 — Status machine

- Implement the `DRAFT → … → LISTED` transitions and the four derived
  capabilities.
- Field locking per spec §4.
- `ipo_audit` writes on every input change outside `DRAFT`.
- Remove the four legacy toggles from the API surface, keeping a compatibility
  shim that reports the derived value for any existing consumer found in Phase 0.

**Checkpoint:** transition tests reviewed.

### Phase 5 — Offer & Reservation tab

The one genuinely new screen. Build it first among the UI phases.

- Fresh / OFS basis toggles, selling-shareholder rows, carve-out rows.
- Percentage table with rule-pack defaults pre-filled and bounds enforced inline.
- Anchor sub-section.
- A live derived panel, refreshed on every keystroke, showing both price
  scenarios side by side: shares, ₹ Cr, minimum application, applications for 1x.
- Validation messages inline against the offending field, not in a banner.

**Checkpoint:** demo against the fixture; the on-screen numbers must match §9 exactly.

### Phase 5b — Public payload and website compatibility

The B2C site reads fields this project turns into derived values. This phase
must land before the remaining admin tabs, not with the migration in Phase 7.

- Build the `v2` payload per the contract document, Part D1, with the
  `availability` discriminator on every block. No zeros, no placeholders.
- Build a **`v1` compatibility endpoint** serving the legacy field names —
  `no_of_app`, `retail_cut_off`, per-category share counts — computed from the
  engine rather than read from the columns being dropped. The live site keeps
  working with no change.
- Diff `v1` old against `v1` new for every existing IPO. Report differences;
  they are data defects, not migration bugs.
- Implement the caching and invalidation rules in Part D4, including
  indefinite caching of `ipo_derived_snapshot` for listed IPOs.

**Checkpoint:** the `v1` diff report is reviewed before the website is pointed
at anything new.

### Phase 6 — Remaining tabs

Reorder to spec §8. Rebuild Timeline as the per-category bid-window table,
Intermediaries as the role table, and convert Financials and Objects to
structured rows with a rendered view.

### Phase 7 — Migration and reconciliation

- Add an `offer_basis: LEGACY_TOTAL_SHARES` mode so existing records whose
  Fresh/OFS split is unknown still resolve to their historical total.
- For every existing IPO: run `computeIssue()` and diff against the stored
  values. Write a reconciliation report — `matched`, `differs`, `unmappable`.
- Records with `differs` are flagged for review, not auto-corrected. Expect the
  HNI Big/Small swap to surface here across multiple past IPOs.
- Listed IPOs keep their published numbers via `ipo_derived_snapshot`,
  backfilled from stored values rather than recomputed.

**Checkpoint:** reconciliation report reviewed before any cutover.

### Phase 8 — Review & Publish tab

Full validation checklist, derived summary, status transition control. This
replaces the free-standing `Start Bid` toggle: bidding cannot be enabled while
any blocking rule fails.

---

## 5. Definition of done

- The §9 fixture passes end to end, in the engine and on screen.
- All eight negative cases fail with the correct rule code.
- `grep` for the regulatory literals (`75`, `60`, `200000`, `1000000`, `476`,
  `2380`) returns hits only in seed files and tests.
- No mutable column anywhere stores a value that `computeIssue()` can produce.
- The reconciliation report is clean or every exception has a written disposition.
- Phase 0's read-path list is fully migrated — nothing still reads a dropped column.

---

## 6. Open questions to raise, not guess

If any of these is unresolved when you reach the phase that needs it, stop and
ask rather than choosing a default:

1. Fresh / OFS split for the MVELECTRO fixture.
2. Estimated issue expenses — required for B16 and absent from the current form.
3. Live subscription data source, and its category codes.
4. Whether residual-to-QIB is deliberate policy (the legacy data does this).
5. Application-series allocation model — branch, syndicate member, or both.
6. Whether any past IPO computed the NII minimum application at floor rather
   than cap price.
