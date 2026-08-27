# IPO Entry Rebuild — Phase 0 Survey

**Status:** complete, no code written.
**Companion docs:** `ipo-entry-spec.md` · `ipo-entry-sequence-and-public-contract.md` · `ipo-entry-implementation-brief.md`
**Measured against the live database and codebase on 2026-08-27.**

This report answers the five questions the brief's Phase 0 asks, and ends with
the decisions that must be made before Phase 1 can start.

---

## 0. Headline findings

Five things materially change how this project should be sequenced.

1. **The `Ipo.status` column is already dead.** All 12 records read
   `status = 'upcoming'`. Every status the site shows — Live, Closing Today,
   Listed — is derived from the dates at read time by `effectiveStatus()`
   (`apps/web/lib/api.ts:248`) and `stageOf()`
   (`packages/shared-types/src/stage.ts`). The spec's status machine is therefore
   **less disruptive than it looks**: nothing depends on the stored value today.

2. **There is almost nothing to migrate.** 12 IPOs, 0 hidden, 7 with a
   reservation table, 3 with the full input set needed to derive figures. Phase 7's
   reconciliation is a morning's work *now*. After the 2,267-row historical import
   it becomes a project in its own right.

3. **The spec's central defect claim is confirmed, and has been fixed.** Three of
   six records had HNI Big/Small transposed. MVELECTRO and HORIZON were corrected
   on 2026-08-27 (`scripts/fix-hni-swap.js`); ARDEE is flagged — see §5.
   With MVELECTRO corrected, our existing engine reproduces the spec's §9 fixture
   **exactly**: retail 20,069 · S-HNI 717 · B-HNI 287, min applications 476 and
   2,380 shares.

4. **`extra.noOfApp` does not mean what the brief assumes.** The brief lists it as
   `DERIVE → apps_for_1x_retail`. In our code it is applications **RECEIVED**, and
   it deliberately *overrides* the derived total (`apps/web/lib/api.ts:338`). These
   are two different quantities. Deriving it would silently destroy an operator
   input. **Blocking question — see §6.**

5. **The four "toggles to drop" have 18 and 16 consumer files respectively.**
   They are not vestigial; they gate the Apply and Print CTAs across web, mobile,
   the banner, the partner API and the admin operations screen. The compatibility
   shim in Phase 4 is mandatory, not optional.

---

## 1. Current schema for the legacy fields

### 1.1 Real columns on `Ipo` (`apps/api/prisma/schema.prisma`)

| Column | Type | Note |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `symbol` | `String @unique` | |
| `name` | `String` | ALL-CAPS from registrars; rendered via `titleCase()`/`shortName()` |
| `logoUrl` | `String?` | |
| `type` | `IpoType` enum | `mainboard` \| `sme` — the spec's `board` |
| `exchanges` | `String[]` | already exists; spec lists it as NEW |
| `status` | `IpoStatus @default(upcoming)` | **stale on every row — see §0.1** |
| `openDate` `closeDate` `allotmentDate` `listingDate` | `DateTime?` | flat; spec replaces with `ipo_bid_window` + `ipo_milestone` |
| `listingGainPct` | `Decimal?` | |
| `priceBandMin` `priceBandMax` | `Decimal?` | |
| `lotSize` | `Int?` | spec moves this to Pricing (tab 2) — a move, not a schema change |
| `minAmount` | `Decimal?` | **computed value stored in a mutable column** |
| `issueSize` | `Decimal?` | stored in **rupees** (₹290 Cr = `2900000000`) |
| `isin` | `String?` | no checksum validation today |
| `registrar` | `String?` | free text, not a typed party — see §5 |
| `objectsOfIssue` | `String?` | rich text, not structured rows |
| `smeFlags` | `Json?` | |
| `reservations` | `String[] @default([])` | **quota NAME list** (`["employee"]`) — *not* the percentage table |
| `hidden` | `Boolean @default(false)` | importer flag; excluded from public reads |
| `autoPollSubscription` | `Boolean @default(true)` | per-IPO poller switch |
| `subscriptionAsOf` | `DateTime?` | |
| `extra` | `Json?` | **everything else — see 1.2** |

Relations: `categories`, `subscriptions`, `gmps`, `documents`, `applications`,
`allotmentRecords`, `allotmentImports`, `allotmentArchive`.

> **Naming trap.** `Ipo.reservations` and `extra.shareResv` sound alike and are
> unrelated. The first is a list of offered quotas; the second is the percentage
> table the derivation depends on. This cost a wrong entry in `CLAUDE.md`, since
> corrected.

### 1.2 The `extra` JSON blob

Every one of the 12 rows carries the full key set — the form writes all keys on
save. Present on 12/12 unless noted:

`faqs` · `leads` · `noOfApp` · `openDate` · `partners` · `startBid` ·
`asbaNames` · `closeDate` · `dematDate` · `faceValue` · `issueType` ·
`pdfSeries` · `shareResv` · `anchorDate` · `refundDate` · `sharesSize` ·
`startPrint` · `contactInfo` · `resvRemarks` · `categoryName` · `maxAmtRetail` ·
`ncdMaxSeries` · `onlineSeries` · `qibCloseDate` · `registrarUrl` ·
`resvRemarks2` · `retailCutOff` · `companyWebsite` · `registrarEmail` ·
`registrarPhone` · `retailDiscount` · `bseListingPrice` · `companyPromoter` ·
`companyStrength` · `nseListingPrice` · `companyFinancials` ·
`companyDescription` · `anchors` (10/12)

`shareResv` row shape: `{ on: boolean, pct: string, count: string, remark: string, req1x: string }`
keyed `qib` · `hni` (**Big**) · `hni2` (**Small**) · `retail` · `employee` ·
`shareholder` · `other`. Note `pct`, `count` and `req1x` are **strings**, parsed
with a `replace(/[^\d.]/g,'')` at every read site.

---

## 2. Where computed values are written, and by what

There is **no cron, trigger or service** that writes computed values. Everything
is written by one path — the admin form submit — and recomputed ad hoc at read
time by two separate implementations.

| Value | Written by | Recomputed at read by |
|---|---|---|
| `shareResv[*].count` (share count) | `IpoForm.tsx` — operator types it | never read back for computation |
| `shareResv[*].req1x` (require for 1×) | `IpoForm.tsx` — operator types it | never read back for computation |
| `shareResv[*].remark` (category remark) | `IpoForm.tsx` — operator types it | rendered verbatim |
| `extra.noOfApp` | `IpoForm.tsx` | **overrides** derived `totalApps` (`web/lib/api.ts:338`) |
| `extra.retailCutOff` | `IpoForm.tsx` | rendered verbatim on the admin view page |
| `extra.maxAmtRetail` | `IpoForm.tsx` | not read anywhere outside the form |
| `Ipo.minAmount` | admin form / importer | rendered as "Min Application" everywhere |
| `sharesSize` grid | `IpoForm.tsx` | admin view page only — **no public consumer** |
| `Ipo.status` | admin form / importer | **ignored** — superseded by `effectiveStatus()` |
| `subscriptionAsOf` | subscription poller | displayed as freshness |

**The duplication the spec describes is real**: `count`, `req1x` and `remark` are
typed by hand into `shareResv`, while `apps_for_1x` and share counts are
*independently derived* from `pct` at read time in `web/lib/api.ts` and
`web/lib/ipoCalc.ts`. Nothing reconciles the two. The typed values are what the
admin screen shows; the derived values are what the public site shows.

### 2.1 Two derivation implementations already exist

| Implementation | Location | Used by |
|---|---|---|
| `enrich()` + `formsFor1x`/`appWise` | `apps/web/lib/api.ts:295-345` | public web: cards, banner, detail |
| `reservation()` / `lotLadder()` / `applicationBands()` | `apps/web/lib/ipoCalc.ts` | admin view, card panels, detail |
| mobile copy | `apps/mobile/lib/ipoCalc.ts` | mobile cards + detail |

Three implementations of overlapping arithmetic, in two languages of the same
codebase. This is the strongest practical argument for the spec's single
`computeIssue()`.

---

## 3. Read paths that consume the affected fields

Counted as distinct files (excluding `node_modules` and generated `.d.ts`).

| Field | Files | Consumers |
|---|---|---|
| `extra.startBid` | **18** | API `ipo.dto`/`ipo.service`; mobile apply, detail, `ipoStage`; web admin operations + catalog list, `ApplyWizard`, `HeroBanner`, `IpoCard`, `IpoCompareTable`, `IpoForm`, `NavLive`, `PrintFlow`, `IpoDetailView`, `tenants-admin`; `shared-types/stage.ts` |
| `extra.startPrint` | **16** | as above, plus **`api/modules/partner/partner.service.ts`** — the partner Print API gates on it |
| `extra.shareResv` | 7 | importer service + `workbook-map`, mobile `ipoCalc`, admin view, `IpoForm`, web `api.ts`, web `ipoCalc` |
| `extra.noOfApp` | 2 | `IpoForm`, web `api.ts` |
| `extra.sharesSize` | 2 | `IpoForm`, admin view page — **no public consumer** |
| `autoPollSubscription` | 8 | API dto/service, importer, admin screens, poller |

**Notable:** `startPrint` reaches the **partner-facing API**. Changing its shape
is a partner-visible contract change, not just an internal refactor.

**Also affected but not in the brief's field list:**

- `apps/api/src/modules/ipo-import/workbook-map.ts` — the Excel importer's column
  map writes `shareResv` and the flat date fields directly. **Any schema change
  breaks the importer**, and the 2,267-row import has not yet run.
- `packages/shared-types/src/stage.ts` — `stageOf()` reads `extra.startBid` to
  distinguish *Pre Apply* from *Upcoming*. Shared by web **and** mobile.
- Print engine (`apps/api/src/modules/print/*`) — consumes `lotSize`,
  `priceBandMax`, `minAmount` for ASBA prefill.

---

## 4. Record counts

| | |
|---|---|
| Total IPOs | **12** |
| `status = 'upcoming'` in the DB | **12** (100%) |
| Actually listed/closed by date | several — derived only, never stored |
| `hidden` | **0** |
| With `extra.shareResv` containing any enabled row | **7** |
| With a full retail/S-HNI/B-HNI split **and** issue size (i.e. derivable) | **3** — MVELECTRO, ARDEE, AUGMONT |
| With a GMP | 1 (MVELECTRO, now listed) |
| With subscription data | **0** |
| Applications against any IPO | 0 |
| Allotment records | 0 |

**Implication for Phase 7:** the reconciliation report will have at most 12 rows,
of which 3 have enough inputs to recompute. This is the cheapest this migration
will ever be.

---

## 5. Risk list

Ordered by likelihood × cost.

| # | Risk | Detail |
|---|---|---|
| R1 | **Excel importer breaks silently** | `workbook-map.ts` writes the legacy shape. The historical import (2,267 rows) is still pending. If the schema changes first, the importer must be retargeted before the import can run — and the import is on the critical path for the archive feature. |
| R2 | **`noOfApp` semantic collision** | Deriving it as `apps_for_1x_retail` destroys an operator input meaning applications *received*. See §6 Q1. |
| R3 | **`startPrint` is in the partner API contract** | `partner.service.ts` gates print requests on it. Removing it without a shim breaks integrated partners. |
| R4 | **Three derivation implementations must converge** | web `api.ts`, web `ipoCalc.ts`, mobile `ipoCalc.ts`. If `computeIssue()` lands only in the API, mobile still runs its own copy and can disagree. |
| R5 | **`issueSize` unit ambiguity** | Stored in rupees on the column, but `issueSizeCr` (Cr) is what `enrich()` uses. Any new engine must be explicit about units or it will be wrong by 10⁷ — this bit during this survey. |
| R6 | **`shareResv` values are strings** | `pct`, `count`, `req1x` are free text parsed with a regex at each site. Migration must handle `"75"`, `"75%"`, `" 75 "` and empty. |
| R7 | **ARDEE's split cannot be safely inferred** | QIB 50 / Big 15 / Small 20 / Retail 15 — NII 35% and retail 15% violates the ICDR 6(1) retail floor of 35%. Not a simple transposition. **Needs the RHP.** Left untouched by the repair script by design. |
| R8 | **`Ipo.status` reanimation** | The status machine will make the column authoritative again. Anything still calling `effectiveStatus()` would then have two sources of truth. Both must switch together. |
| R9 | **Rounding parity** | Existing code uses `Math.round` for `formsFor` and `Math.floor(x)+1` for min lots. The spec mandates `floor_to_lot` with residual absorption and `ceil`/`floor` split for apps-vs-allottees. Numbers *will* move for some categories; each move needs a written disposition. |

---

## 6. Decisions required before Phase 1

**Blocking — the engine cannot be specified without these.**

1. **`No. of App` — received or required?** Our form's field means applications
   *received* and overrides the derived figure. The brief maps it to
   `apps_for_1x_retail` (applications *needed*). If both are wanted, they are two
   fields and the legacy one should be renamed, not derived away.
2. **Sequencing vs the historical import.** Import 2,267 rows first and migrate
   them, or change the schema first and retarget `workbook-map.ts`? Phase 7 is
   trivial today and substantial afterwards. **Recommendation: schema first.**
3. **ARDEE's true reservation split** (R7) — needs the RHP; cannot be inferred.
4. The brief's own §6 questions, unchanged and still open: Fresh/OFS split for
   MVELECTRO · estimated issue expenses · live subscription source and its
   category codes · whether residual-to-QIB is deliberate policy · the
   application-series allocation model · whether any past IPO computed the NII
   minimum at floor rather than cap price.

**Scope question for sir.** The catalog is 12 records, all still upcoming, with
no applications and no allotments against them. The full 8-phase rebuild is
sound engineering, but a materially smaller change — a single shared
`computeIssue()`, the validation catalogue, and making the typed
`count`/`req1x`/`remark` fields read-only — would remove the defect class that
motivated this project at a fraction of the cost. The entity model, rule packs
and status machine could then follow when the catalog is large enough to warrant
them. **This is a business call, not a technical one, and worth a deliberate
answer before Phase 1 rather than by default.**

---

## 7. What was done alongside this survey

- `scripts/fix-hni-swap.js` — dry-run-first repair. Applied to MVELECTRO and
  HORIZON; ARDEE reported, not touched.
- `apps/web/components/IpoForm.tsx` — a non-blocking warning when Small > Big on
  the Share Reservation panel, so the defect cannot silently return.
- `CLAUDE.md` — corrected the reservation-data entry (it cited the wrong field).
