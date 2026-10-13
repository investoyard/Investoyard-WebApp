# IPO Entry Module — Design Specification

Target: in-house IPO Admin Portal (replacing legacy portal).
Scope: full IPO master entry — identity, offer structure, reservation, pricing,
timeline, intermediaries, content, documents, application series.

Reference fixture throughout: **MV Electrosystems Limited (MVELECTRO)**, Mainboard,
book-built, price band 400–425, lot 34, total offer 6,823,528 shares / ₹290.00 Cr.

---

## 1. Design principles

These five rules resolve almost every defect in the legacy form.

1. **Store inputs, never derived values.** A single pure function
   `computeIssue(inputs) -> derived` is the only source of computed numbers. Every
   tab, the public page, the ASBA print job and the subscription screen call it.
   Nothing writes a computed number to the database except a deliberate,
   timestamped *freeze* (§7).

2. **Enter each fact once.** If a value appears on two screens, one of them is a
   read-only projection. Legacy duplicates to eliminate:
   `Basic.No. of App`, `Reservation.Share Count`, `Reservation.Category Remark`,
   `Reservation.Require for 1x`, `Basic.Retail Cut Off`.

3. **Regulation lives in config, not in code.** Category floors/ceilings, anchor
   caps, MF reservations and application thresholds sit in a **rule pack** keyed
   on `(board, mechanism, regulation_basis)`. A SEBI amendment is a config edit.

4. **One status, many capabilities.** Replace independent booleans with a state
   machine. `can_bid`, `can_print`, `is_public` are derived from `status`, not
   set by hand.

5. **Fail loud at the boundary.** Blocking validations prevent a status
   transition; warnings are shown but do not block. Never silently round,
   truncate or coerce.

---

## 2. Entity model

### 2.1 `ipo` — identity

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | |
| `company_name` | string | yes | |
| `symbol` | string | yes | Uppercase, unique. Drives ASBA filenames. |
| `isin` | string(12) | on `Configured` | Checksum-validate ISIN |
| `cin` | string(21) | no | Issuer CIN |
| `board` | enum | yes | `MAINBOARD` \| `SME` |
| `sme_platform` | enum | if SME | `NSE_EMERGE` \| `BSE_SME` |
| `mechanism` | enum | yes | `BOOK_BUILT` \| `FIXED_PRICE` |
| `regulation_basis` | enum | yes | `ICDR_6_1` \| `ICDR_6_2` \| `SME` \| `CUSTOM` |
| `instrument` | enum | yes | `IPO` \| `FPO` \| `OFS` \| `RIGHTS` |
| `exchanges` | string[] | yes | `["NSE","BSE"]` |
| `bse_scrip_code` | string | no | |
| `face_value` | decimal | yes | ₹ 5.00 in fixture |
| `status` | enum | yes | §7 |

> `board`, `mechanism` and `regulation_basis` together select the rule pack.
> Changing any of them after `Configured` requires an explicit unlock and
> re-validation, because they change the legal shape of the reservation.

### 2.2 `ipo_offer` — offer composition **(new — does not exist in legacy)**

The single most important addition. Everything downstream derives from it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `fresh_basis` | enum | yes | `AMOUNT` \| `SHARES` \| `NONE` |
| `fresh_amount_cr` | decimal | if AMOUNT | |
| `fresh_shares` | bigint | if SHARES | |
| `ofs_basis` | enum | yes | `AMOUNT` \| `SHARES` \| `NONE` |
| `ofs_amount_cr` | decimal | if AMOUNT | |
| `ofs_shares` | bigint | if SHARES | |
| `greenshoe_enabled` | bool | yes | default false |
| `greenshoe_shares` | bigint | if enabled | |
| `min_subscription_pct` | decimal | yes | default 90.00 of fresh issue |

At least one of fresh/OFS must be non-`NONE`. An `AMOUNT`-basis leg has **no
fixed share count until the price is known** — it resolves differently at floor
and at cap. See §5.

### 2.3 `ipo_selling_shareholder` — OFS detail

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `category` | enum `PROMOTER` \| `PROMOTER_GROUP` \| `INVESTOR` \| `OTHER` | yes |
| `offered_shares` | bigint | yes |
| `pan` | string | no |

Blocking: `sum(offered_shares) == resolved ofs_shares`.

### 2.4 `ipo_pricing`

| Field | Type | Required | Notes |
|---|---|---|---|
| `price_floor` | decimal | if BOOK_BUILT | 400 |
| `price_cap` | decimal | if BOOK_BUILT | 425 |
| `fixed_price` | decimal | if FIXED_PRICE | |
| `lot_size` | int | yes | 34 — load-bearing everywhere |
| `tick_size` | decimal | yes | default 1.00 |
| `retail_discount` | decimal | yes | default 0 |
| `employee_discount` | decimal | yes | default 0 |
| `shareholder_discount` | decimal | yes | default 0 |
| `final_issue_price` | decimal | on `Allotted` | Set at price discovery; triggers freeze |
| `anchor_price` | decimal | if anchor used | |

Derived, never stored: `retail_cutoff = price_cap - retail_discount` (425 in
fixture), `employee_cutoff`, `shareholder_cutoff`, `lot_value_at_cap`,
`lot_value_at_floor`.

### 2.5 `ipo_carveout` — off-the-top reservations

One row per carve-out. Deducted from total offer **before** the percentage split.

| Field | Type | Notes |
|---|---|---|
| `kind` | enum | `EMPLOYEE` \| `SHAREHOLDER` \| `POLICYHOLDER` \| `MARKET_MAKER` |
| `basis` | enum | `AMOUNT` \| `SHARES` \| `PCT_OF_OFFER` |
| `value` | decimal | |
| `max_per_applicant_amount` | decimal | e.g. employee cap |
| `initial_per_applicant_amount` | decimal | e.g. employee initial allotment cap |

`MARKET_MAKER` is mandatory when `board = SME` and must be ≥ the rule pack's
`market_maker_min_pct`.

### 2.6 `ipo_reservation` — the percentage table

One row per category. **Percent is the only manual input.**

| Field | Type | Notes |
|---|---|---|
| `category` | enum | `QIB` \| `NII_BIG` \| `NII_SMALL` \| `RETAIL` |
| `pct_of_net_offer` | decimal(6,3) | |
| `is_residual_holder` | bool | exactly one row true; default QIB |

Anchor is **not** a row here — it is a sub-allocation of QIB (§2.7).

Blocking: `sum(pct_of_net_offer) == 100.000`.
Blocking: each pct within the rule pack's `[min, max]` for that category.
Warning: `NII_BIG : NII_SMALL != 2 : 1`.

> **Legacy defect.** The old screen has HNI (Big) = 5% and HNI (Small) = 10%.
> Under ICDR, two-thirds of the NII portion goes to bids above ₹10 lakh and
> one-third to ₹2–10 lakh, so Big = 10% and Small = 5%. The rows are swapped.

### 2.7 `ipo_anchor`

| Field | Type | Notes |
|---|---|---|
| `enabled` | bool | must be false when `mechanism = FIXED_PRICE` |
| `pct_of_qib` | decimal | ≤ rule pack `anchor_max_pct_of_qib` (60.00) |
| `mf_pct_of_anchor` | decimal | default 33.33 |
| `investor_count` | int | |
| `lockin_tranche1_pct` | decimal | default 50.00 |
| `lockin_tranche1_days` | int | default 30 |
| `lockin_tranche2_days` | int | default 90 |

`ipo_anchor_investor`: `name`, `allocated_shares`, `amount`, `is_mutual_fund`.
Blocking on `Allotted`: `sum(allocated_shares) == derived anchor_shares`.

### 2.8 `ipo_bid_window` — replaces the loose date fields

One row per bidding constituency. This removes every "internal note" hint field
from the legacy Important Dates block.

| Field | Type |
|---|---|
| `category` | enum `ANCHOR` \| `QIB` \| `NII` \| `RETAIL` \| `EMPLOYEE` \| `SHAREHOLDER` |
| `opens_at` | datetime |
| `closes_at` | datetime |

Fixture:

```
ANCHOR   2026-07-29 10:00 → 2026-07-29 17:00
QIB      2026-07-30 10:00 → 2026-08-03 16:00
NII      2026-07-30 10:00 → 2026-08-03 16:00
RETAIL   2026-07-30 10:00 → 2026-08-03 17:00
```

### 2.9 `ipo_milestone`

| Field | Type | Notes |
|---|---|---|
| `basis_of_allotment_date` | date | 2026-08-04 |
| `refund_initiation_date` | date | 2026-08-05 |
| `demat_credit_date` | date | 2026-08-05 |
| `listing_date` | date | 2026-08-06 |
| `upi_mandate_cutoff` | datetime | **missing in legacy** |

Requires a **working-day calendar** table (exchange holidays) to validate T+3
and the 3–10 working-day bidding period.

### 2.10 `ipo_intermediary` — replaces three flat dropdowns

| Field | Type | Notes |
|---|---|---|
| `role` | enum | `BRLM` \| `SYNDICATE_MEMBER` \| `SUB_SYNDICATE` \| `REGISTRAR` \| `SPONSOR_BANK` \| `ESCROW_BANK` \| `REFUND_BANK` \| `PUBLIC_ISSUE_BANK` \| `MARKET_MAKER` \| `UNDERWRITER` \| `IPO_PARTNER` |
| `party_id` | fk → `party` master | |
| `sebi_reg_no` | string | |
| `is_lead` | bool | |

`party` master carries `party_type` (`MERCHANT_BANKER`, `RTA`, `BANK`, `BROKER`)
so a role can only be filled by a party of a compatible type.

> **Legacy defect.** Registrar is set to "AXIS BANK". A registrar must be an RTA
> (Link Intime / KFin / Bigshare / MUFG Intime). Axis Bank is the sponsor or
> escrow bank. Typing the two roles prevents this class of error entirely.

Blocking on `Configured`: at least one `BRLM`, exactly one `REGISTRAR`, at least
one `SPONSOR_BANK`. If `board = SME`, at least one `MARKET_MAKER`.

### 2.11 `ipo_content` — About Company tab

Keep as-is structurally, but:

- `company_financials` should be **structured rows**, not free HTML:
  `(period_end, assets, total_income, pat, ebitda, net_worth, reserves, borrowings)`.
  Rich text can render from it; the reverse is not possible.
- The auto-summary sentence must not compute a percentage change across a sign
  flip. Fixture: PAT +1.40 → −12.63 currently renders "dropped by 1000%".
  Correct output: *"turned to a loss of ₹12.63 Cr from a profit of ₹1.40 Cr"*.
- Warning: if the latest period `pat < 0` and `regulation_basis = ICDR_6_1`,
  flag the mismatch — a loss-making issuer generally falls under 6(2).

### 2.12 `ipo_object` — Objects of the Issue

Structured rows, not an HTML table: `(seq, description, amount_cr, is_gcp)`.

Blocking: `sum(amount_cr) + estimated_issue_expenses_cr <= fresh_issue_amount_cr`.
OFS proceeds go to selling shareholders and can never fund objects.
Fixture: objects total ₹201.00 Cr, which must reconcile against the fresh issue
leg once §2.2 is populated.

### 2.13 `ipo_document` / `ipo_asba_form`

Keep the legacy split, but validate:

- `RESIDENT` form used for bids **≤ ₹5,00,000**, filename `{SYMBOL}.pdf`
- `SYNDICATE_ASBA` form for bids **> ₹5,00,000**, filename `{SYMBOL}_SA.pdf`
- Blocking on `Configured` when `can_print` is requested: both forms present.
- Store `field_map_json` per form — the overlay coordinates for prefill. Without
  it, replacing a PDF silently breaks printing.

### 2.14 `ipo_application_series`

*(Tab not yet reviewed — proposed model, please confirm against the live screen.)*

| Field | Type |
|---|---|
| `prefix` | string |
| `range_start` / `range_end` | bigint |
| `allocated_to` | enum `BRANCH` \| `SYNDICATE` \| `INTERNAL` |
| `allocated_party_id` | fk |
| `next_unused` | bigint |

Blocking: no overlapping ranges within an IPO.

---

## 3. Rule pack

A config record per `(board, mechanism, regulation_basis)`. Ships as seed data,
editable by an admin, versioned with an `effective_from` date.

```jsonc
{
  "key": "MAINBOARD/BOOK_BUILT/ICDR_6_2",
  "effective_from": "2018-01-01",
  "categories": {
    "QIB":       { "default": 75, "min": 75, "max": 75 },
    "NII_BIG":   { "default": 10, "min": 10, "max": 10 },
    "NII_SMALL": { "default":  5, "min":  5, "max":  5 },
    "RETAIL":    { "default": 10, "min": 10, "max": 10 }
  },
  "anchor": { "allowed": true, "max_pct_of_qib": 60, "mf_pct": 33.33 },
  "mf_pct_of_net_qib": 5,
  "application_thresholds": {
    "RETAIL":    { "min_amount": 0,       "max_amount": 200000, "cutoff_eligible": true  },
    "NII_SMALL": { "min_amount": 200000,  "max_amount": 1000000, "cutoff_eligible": false },
    "NII_BIG":   { "min_amount": 1000000, "max_amount": null,    "cutoff_eligible": false },
    "QIB":       { "min_amount": 200000,  "max_amount": null,    "cutoff_eligible": false }
  },
  "market_maker_min_pct": 0,
  "bidding_days": { "min": 3, "max": 10 },
  "listing_working_days_after_close": 3
}
```

Other packs to seed: `MAINBOARD/BOOK_BUILT/ICDR_6_1` (50/10/5/35),
`MAINBOARD/FIXED_PRICE` (retail 50, others 50, no anchor),
`SME/BOOK_BUILT`, `SME/FIXED_PRICE` (both with `market_maker_min_pct` set).

> **Verify every numeric constant in the seed packs against the current ICDR and
> the relevant exchange circular before go-live.** They are deliberately data,
> not code, so that this verification is a config review rather than a diff.

---

## 4. Status state machine

```
DRAFT ──validate──▶ CONFIGURED ──▶ ANCHOR ──▶ OPEN ──▶ CLOSED ──▶ ALLOTTED ──▶ LISTED
   ▲                    │                                              │
   └────── unlock ──────┘                                              └──▶ WITHDRAWN
```

Derived capabilities (never stored as toggles):

| Capability | True when |
|---|---|
| `is_public` | `status >= CONFIGURED` and `publish_enabled` |
| `can_bid` | `status in (ANCHOR, OPEN)` and `now` inside that category's bid window |
| `can_print` | `status >= CONFIGURED` and both ASBA forms present with field maps |
| `shows_live_subscription` | `status in (OPEN, CLOSED)` |

Field locking:

- On `CONFIGURED`: `lot_size`, `face_value`, `board`, `mechanism`,
  `regulation_basis` lock.
- On `ANCHOR`: price band, offer composition, all reservation percentages lock.
- On `ALLOTTED`: `final_issue_price` set → derived values frozen (§7).

The legacy `Is Active` / `Start Bid` / `Start Printing` / `Live subscription`
toggles collapse into `status` + `publish_enabled`. This removes the possibility
of bidding being enabled on an IPO whose reservation does not sum to 100%.

---

## 5. Derivation engine

Pure function. Ordering matters — each step consumes the previous.

### Step 0 — price scenarios

```
BOOK_BUILT  : scenarios = { floor: price_floor, cap: price_cap }
FIXED_PRICE : scenarios = { fixed: fixed_price }
```

Every downstream quantity is computed once per scenario. After
`final_issue_price` is set, a third scenario `final` is added and becomes the
displayed default.

### Step 1 — resolve offer legs

```
floor_to_lot(n) = floor(n / lot_size) * lot_size

resolve(leg, p):
  basis == SHARES -> leg.shares                       (price-independent)
  basis == AMOUNT -> floor_to_lot(leg.amount_cr * 1e7 / p)
  basis == NONE   -> 0

total_offer_shares(p) = resolve(fresh, p) + resolve(ofs, p)
total_offer_amount(p) = total_offer_shares(p) * p
```

Fixture check at cap: 6,823,528 × 425 = ₹290.00 Cr ✓
Fixture check at floor: 6,823,528 × 400 = ₹272.94 Cr ✓

### Step 2 — carve-outs and net offer

```
carveout_shares(c, p):
  AMOUNT        -> floor_to_lot(c.value * 1e7 / p)
  SHARES        -> c.value
  PCT_OF_OFFER  -> floor_to_lot(total_offer_shares(p) * c.value / 100)

net_offer_shares(p) = total_offer_shares(p) - Σ carveout_shares(c, p)
```

Blocking: `net_offer_shares(p) > 0` for every scenario.

### Step 3 — category split with residual absorption

```
for each category i:
    raw_i    = net_offer_shares(p) * pct_i / 100
    shares_i = floor_to_lot(raw_i)

residual = net_offer_shares(p) - Σ shares_i
shares_residual_holder += residual
```

**Validated against the fixture** (net offer = total offer, no carve-outs):

```
QIB    6,823,528 × 75% = 5,117,646 → 5,117,612
NII    6,823,528 × 15% = 1,023,529 → 1,023,502   ✓ legacy screen
RETAIL 6,823,528 × 10% =   682,353 →   682,346   ✓ legacy screen
                              Σ   = 6,823,460
residual = 68 (2 lots) → QIB
QIB final = 5,117,680                            ✓ legacy screen
```

Post-condition (blocking): `Σ shares_i == net_offer_shares(p)` exactly.

### Step 4 — QIB sub-allocation

```
anchor_shares    = floor_to_lot(qib_shares * anchor.pct_of_qib / 100)
net_qib_shares   = qib_shares - anchor_shares
anchor_mf_shares = floor_to_lot(anchor_shares * anchor.mf_pct / 100)
qib_mf_shares    = floor_to_lot(net_qib_shares * pack.mf_pct_of_net_qib / 100)
```

Fixture: anchor = 3,070,608, net QIB = 2,047,072 ✓ both match the legacy screen.

### Step 5 — minimum application per category

```
lot_value(p)   = lot_size * (p - discount_for_category)
min_lots_i(p)  = max(1, ceil(threshold_min_amount_i / lot_value(p)) )
min_app_shares_i(p) = min_lots_i(p) * lot_size
```

For NII, evaluate at **cap price** by convention (configurable per rule pack via
`application_threshold_basis: "CAP" | "FLOOR" | "FINAL"`).

Fixture at cap, lot value = 34 × 425 = ₹14,450:

| Category | Threshold | Lots | Shares | Value |
|---|---|---|---|---|
| RETAIL | 1 lot | 1 | 34 | ₹14,450 |
| NII_SMALL | > ₹2,00,000 | 14 | 476 | ₹2,02,300 |
| NII_BIG | > ₹10,00,000 | 70 | 2,380 | ₹10,11,500 |

### Step 6 — applications for 1x

Two distinct quantities. Do not conflate them; expose both, labelled.

```
apps_for_1x_i   = ceil (shares_i / min_app_shares_i)   -- demand to reach 1x
max_allottees_i = floor(shares_i / min_app_shares_i)   -- allotment capacity at 1x
```

Fixture, with the Big/Small rows **corrected**:

| Category | % | Shares | Min app | Apps for 1x |
|---|---|---|---|---|
| QIB | 75 | 5,117,680 | n/a | n/a — express in ₹ Cr |
| NII_BIG | 10 | 682,346 | 2,380 | **287** |
| NII_SMALL | 5 | 341,156 | 476 | **717** |
| RETAIL | 10 | 682,346 | 34 | **20,069** |

> **Legacy defect.** The old screen shows 717 and 1,434, both computed with the
> small-HNI minimum of 476 shares. The 717 is correct but sits in the Big row;
> the Big row's true value is 287. The retail figure of 20,069 is correct and
> divides exactly, which is why the error was never noticed.

### Step 7 — generated display strings

`Category Remark` becomes output, not input:

```
"₹{amount_cr} Cr @ {apps_for_1x} forms for 1x"
```

---

## 6. Validation catalogue

### Blocking — prevents transition to `CONFIGURED`

| # | Rule |
|---|---|
| B01 | `Σ reservation.pct == 100.000` |
| B02 | Each pct within rule-pack `[min, max]` |
| B03 | Every derived category share count ≡ 0 (mod `lot_size`) |
| B04 | `Σ category shares == net_offer_shares` for every price scenario |
| B05 | `net_offer_shares > 0` for every price scenario |
| B06 | `fresh + ofs > 0`; each leg's basis fields populated consistently |
| B07 | `Σ selling_shareholder.offered_shares == resolved ofs_shares` |
| B08 | `price_floor <= price_cap`; `price_cap / price_floor <= 1.20` (book-built) |
| B09 | `anchor.pct_of_qib <= pack.anchor_max_pct_of_qib` |
| B10 | `anchor.enabled == false` when `mechanism == FIXED_PRICE` |
| B11 | Bidding period between `pack.bidding_days.min` and `.max` **working days** |
| B12 | `listing_date == close_date + pack.listing_working_days_after_close` |
| B13 | Milestone dates strictly non-decreasing: close ≤ basis ≤ refund ≤ demat ≤ listing |
| B14 | Anchor window strictly precedes the retail open |
| B15 | Every category close ≤ retail close |
| B16 | `Σ objects.amount_cr + issue_expenses <= fresh_issue_amount_cr` |
| B17 | ≥1 BRLM, exactly 1 REGISTRAR of `party_type = RTA`, ≥1 SPONSOR_BANK |
| B18 | SME: market-maker carve-out exists and ≥ `pack.market_maker_min_pct` |
| B19 | ISIN checksum valid; symbol unique |
| B20 | Employee carve-out exists **iff** `employee_allowed` is on; same for shareholder |
| B21 | Application series ranges do not overlap |
| B22 | If `can_print` requested: both ASBA forms uploaded with field maps |
| B23 | `retail_cutoff = price_cap - retail_discount` recomputes cleanly (no stored override) |

### Warning — shown, does not block

| # | Rule |
|---|---|
| W01 | `NII_BIG : NII_SMALL != 2 : 1` |
| W02 | Latest-period `pat < 0` but `regulation_basis = ICDR_6_1` |
| W03 | Residual absorbed into the residual holder exceeds 5 lots — check percentages |
| W04 | `lot_value_at_cap` outside the customary retail band (~₹14k–₹15k) |
| W05 | Anchor investor count outside the customary range for the anchor size |
| W06 | Objects table has a General Corporate Purpose row above the customary 25% cap |
| W07 | Financial summary sentence suppressed because of a sign flip |
| W08 | Registrar party has no SEBI registration number on file |

---

## 7. Freeze and audit

On transition to `ALLOTTED`, with `final_issue_price` set:

1. `computeIssue()` runs once with `scenario = final`.
2. The full derived object is written to `ipo_derived_snapshot` with a
   timestamp, the rule-pack version and the acting user.
3. All later reads of historical IPOs serve the snapshot, not a recomputation —
   so a future rule-pack edit cannot retroactively change a listed IPO's numbers.

Every input change on a non-`DRAFT` IPO writes to `ipo_audit`:
`(field, old, new, user, at, reason)`.

---

## 8. Tab flow

Reordered so that each tab only depends on tabs before it, with a gate between
each. Progress bar shows blocking-validation count per tab.

| # | Tab | Contains | Gate to proceed |
|---|---|---|---|
| 1 | **Issue Setup** | Identity, board, mechanism, regulation, exchanges, face value, lot size | B19 |
| 2 | **Pricing** | Band or fixed price, tick, discounts, cut-off eligibility | B08, B23 |
| 3 | **Offer & Reservation** | Fresh/OFS, selling shareholders, carve-outs, percentage table, anchor. Live derived panel showing both price scenarios. | B01–B07, B09, B10, B18 |
| 4 | **Timeline** | Bid windows per category, milestones, UPI cut-off, anchor lock-in | B11–B15 |
| 5 | **Intermediaries** | BRLM, syndicate, registrar, banks, market maker, underwriters | B17 |
| 6 | **Company & Content** | Profile, info, strengths, structured financials, objects, contact, FAQ | B16 |
| 7 | **Documents & Print** | RHP/DRHP, ASBA forms + field maps, application series | B21, B22 |
| 8 | **Review & Publish** | Full validation checklist, derived summary, status transition | all |

Rationale for the two moves from the legacy layout:

- **Pricing moves ahead of Reservation.** Reservation cannot be derived without
  `lot_size` and the price scenarios. In the legacy portal they sit on the same
  tab as company identity, which hides the dependency.
- **Dates move behind Reservation.** Bid windows depend on whether an anchor
  round exists, which is a reservation decision.

`Basic.No. of App` disappears; the number now lives on tab 3 as derived output
and is surfaced read-only on the review tab.

---

## 9. Test fixture — MVELECTRO

Use as the canonical regression case. Every number below is asserted.

```yaml
ipo:
  company_name: MV ELECTROSYSTEMS LIMITED
  symbol: MVELECTRO
  board: MAINBOARD
  mechanism: BOOK_BUILT
  regulation_basis: ICDR_6_2      # latest-period PAT is negative
  face_value: 5.00

pricing:
  price_floor: 400
  price_cap: 425
  lot_size: 34
  retail_discount: 0

offer:
  # TODO: confirm the actual split with the RHP — total must resolve to 6,823,528
  fresh_basis: AMOUNT
  fresh_amount_cr: <confirm>
  ofs_basis: SHARES
  ofs_shares: <confirm>

reservation:
  QIB:       { pct: 75, is_residual_holder: true }
  NII_BIG:   { pct: 10 }
  NII_SMALL: { pct: 5 }
  RETAIL:    { pct: 10 }

anchor:
  enabled: true
  pct_of_qib: 60

expected_derived_at_cap:
  total_offer_shares: 6823528
  total_offer_amount_cr: 290.00
  net_offer_shares: 6823528
  qib_shares: 5117680          # includes 68-share residual
  nii_big_shares: 682346
  nii_small_shares: 341156
  retail_shares: 682346
  anchor_shares: 3070608
  net_qib_shares: 2047072
  retail_cutoff: 425
  min_app_retail_shares: 34
  min_app_nii_small_shares: 476
  min_app_nii_big_shares: 2380
  apps_for_1x_retail: 20069
  apps_for_1x_nii_small: 717
  apps_for_1x_nii_big: 287

expected_derived_at_floor:
  total_offer_amount_cr: 272.94
```

Negative cases to assert:

1. Percentages summing to 99.9 → B01 fails.
2. NII_BIG = 5, NII_SMALL = 10 → B02 fails under `ICDR_6_2` (this is the exact
   legacy bug; the rule pack catches it).
3. Anchor at 65% of QIB → B09 fails.
4. Anchor enabled on a fixed-price issue → B10 fails.
5. A lot size that makes `net_offer_shares` non-divisible → B03/B04 fail.
6. Objects total exceeding the fresh issue → B16 fails.
7. Registrar set to a `party_type = BANK` party → B17 fails.
8. PAT sign flip → W07 fires and the percentage sentence is suppressed.

---

## 10. Open items — please confirm

1. **Application Series tab** — not yet reviewed; §2.14 is a proposal.
2. **Fresh / OFS split for MVELECTRO** — needed to complete the fixture and to
   validate the ₹201.00 Cr objects table.
3. **Estimated issue expenses** — currently nowhere in the form; required for B16.
4. **Live subscription source** — exchange bid file, scraper, or manual? Determines
   whether category codes need a mapping table against `ipo_reservation.category`.
5. **Residual holder default** — the legacy data absorbs into QIB. Confirm this is
   intentional policy and not an artefact, since it is now a hard rule.
6. **Threshold basis for NII minimum application** — cap price assumed. Confirm
   whether any past IPO in your data used floor or final price instead.
7. **Multi-IPO series/branch allocation** — does application series allocate per
   branch, per syndicate member, or both?
