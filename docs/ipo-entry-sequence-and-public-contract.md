# IPO Entry — Sequence, Dependencies and Public Page Contract

**Companions:** `docs/ipo-entry-spec.md` (what to build),
`docs/ipo-entry-implementation-brief.md` (how to sequence the work).
This document covers **the order the operator enters data in**, and **the contract
the public B2C page depends on**.

Read all three before starting.

---

## Part A — Field lifecycle

Every field belongs to exactly one lifecycle. The legacy form mixes all three on
the same tabs with no gating, which is why in-flight data is editable in draft.

| Lifecycle | When captured | Editable in | Examples |
|---|---|---|---|
| **A — Setup** | Before bidding opens | `DRAFT`, `CONFIGURED` | Identity, pricing, offer, reservation, timeline, intermediaries, content, documents |
| **B — In-flight** | During or immediately after bidding | `ANCHOR` onward, per field | Anchor investor list, subscription snapshots, final issue price, basis-of-allotment confirmation |
| **C — Post-listing** | After listing | `LISTED` | Listing open price, listing close price, listing gain |

Rules:

- A **Setup** field locks when its tab's gate is passed (spec §4). It cannot be
  edited afterwards without an explicit unlock that writes to `ipo_audit`.
- An **In-flight** field is not merely hidden in `DRAFT` — it is rejected by the
  API. Do not render it as an empty input on a draft IPO.
- A **Post-listing** field never blocks publication and never participates in
  validation.

The legacy anchor-investor picker on the About Company tab is lifecycle B sitting
in a lifecycle A location. Move it to tab 3, under the anchor sub-section, and
disable it until `status >= ANCHOR`.

---

## Part B — Dependency graph

Read as: a level cannot be computed until every level above it is complete.

```
L0  identity, board, mechanism, instrument, exchanges, face_value
      │
      ├─▶ eligibility snapshot ──▶ regulation_basis ──▶ RULE PACK
      │                                                   │
L1  lot_size, tick_size, price band / fixed price,        │
    discounts                                             │
      │                                                   │
      ├───────────────┬───────────────────────────────────┘
      ▼               ▼
    lot values     LOT TABLE  (min investment, retail max,
    per scenario              sHNI min, bHNI min)   ◀── needs NO issue size
      │
L2  fresh issue, OFS  ──▶ total_offer_shares(p), total_offer_amount(p)
      │                      │
      │                      └─▶ selling shareholders (Σ must equal ofs_shares)
      ▼
L3  carve-outs (employee / shareholder / market maker)
      │
      └─▶ net_offer_shares(p)
            │
L4  reservation percentages ──▶ category shares, amounts,
      │                          apps_for_1x, max_allottees
      ▼
L5  anchor config ──▶ anchor_shares, net_qib_shares, MF shares
      │
L6  bid windows (ANCHOR window exists iff anchor enabled)
    milestones ──▶ bidding days, T+3 check, status timeline
      │
      └─▶ anchor lock-in end dates   ◀── forward dependency: needs the
                                          allotment date from L6, though the
                                          anchor config is set at L5
L7  intermediaries (registrar → allotment status URL)
L8  objects of the issue   ◀── validated against fresh issue amount (L2)
L9  content, documents, application series
```

Two dependencies that are easy to miss:

1. **Anchor lock-in dates cross levels.** The tranche percentages and day counts
   are configured at L5, but the resulting dates need the allotment date from L6.
   Compute lazily; display on the Timeline tab and the review screen, not on the
   anchor sub-section.

2. **Objects of the Issue depends on L2, not on content.** It sits on the content
   tab but validates against the fresh issue leg. If the offer composition is
   later unlocked and changed, the objects validation must re-run.

---

## Part C — Entry sequence

Eight tabs, matching spec §8. Within each tab, fields are ordered so that no
input is ever requested before the thing that constrains it.

**Saving is always allowed.** Gating controls *advancing the status*, never
persisting a draft. An operator must be able to enter what they have and return.

---

### Tab 1 — Issue Setup

| Order | Field group | Why here |
|---|---|---|
| 1 | Company name, symbol, CIN, ISIN | No dependencies |
| 2 | Instrument, board, SME platform | Selects half the rule-pack key |
| 3 | Mechanism (book-built / fixed price) | Selects the other half; determines whether a price band or a single price is asked for on tab 2 |
| 4 | Exchanges, BSE scrip code | |
| 5 | Face value | |
| 6 | **Eligibility snapshot** — latest period end, PAT, net worth, net tangible assets | New. Four fields, not the full financials table |
| 7 | Regulation basis (6(1) / 6(2) / SME / custom) | Suggested from step 6, operator confirms |

**Resolves:** the rule pack. Everything downstream reads from it.

**Gate:** B19. On pass, lock `board`, `mechanism`, `instrument`, `regulation_basis`.

**Show on pass:** the resolved rule pack in a read-only panel — category list with
defaults and bounds, anchor allowed yes/no, market maker required yes/no,
application thresholds. The operator should see the rules they are about to work
inside *before* entering numbers.

---

### Tab 2 — Pricing & Lot

| Order | Field | Note |
|---|---|---|
| 1 | Price floor, price cap *or* fixed price | Field shape set by tab 1 mechanism |
| 2 | Tick size | |
| 3 | Lot size | |
| 4 | Retail discount, employee discount, shareholder discount | |

**Derived immediately — no issue size required:**

```
retail_cutoff        = price_cap − retail_discount
lot_value_at_cap     = lot_size × retail_cutoff
lot_value_at_floor   = lot_size × (price_floor − retail_discount)
retail_min_lots      = 1
retail_max_lots      = floor(threshold.RETAIL.max_amount / lot_value_at_cap)
nii_small_min_lots   = ceil (threshold.NII_SMALL.min_amount / lot_value_at_cap)
nii_big_min_lots     = ceil (threshold.NII_BIG.min_amount   / lot_value_at_cap)
```

**Render the lot table live**, in the exact shape the public page uses:

| Application | Lots | Shares | Amount |
|---|---|---|---|
| Retail (min) | 1 | 34 | ₹14,450 |
| Retail (max) | 13 | 442 | ₹1,87,850 |
| S-HNI (min) | 14 | 476 | ₹2,02,300 |
| B-HNI (min) | 70 | 2,380 | ₹10,11,500 |

*(fixture values, lot 34 at ₹425)*

**New blocking rule B24:** `nii_small_min_lots == retail_max_lots + 1`.

These are two sides of the same ₹2,00,000 threshold and must be adjacent for any
lot size and any price. A violation means a misconfigured threshold in the rule
pack, and it is otherwise invisible — add it to spec §6.

**Gate:** B08, B23, B24.

---

### Tab 3 — Offer & Reservation

The one screen that must be entered strictly top to bottom. Each block stays
disabled until the block above it resolves.

| Order | Block | Unlocked by | Derived on completion |
|---|---|---|---|
| 1 | Fresh issue (basis + value) | Tab 2 gate | `fresh_shares(p)` |
| 2 | OFS (basis + value) | — | `ofs_shares(p)`, `total_offer_shares(p)`, `total_offer_amount(p)` |
| 3 | Selling shareholders | Block 2, if OFS > 0 | B07 check |
| 4 | Greenshoe, minimum subscription | Block 2 | |
| 5 | Carve-outs | Block 2 | `net_offer_shares(p)` |
| 6 | Reservation percentages | Block 5 | Category shares, amounts, residual, apps for 1x, max allottees |
| 7 | Anchor config | Block 6 | `anchor_shares`, `net_qib_shares`, MF shares |
| 8 | Anchor investor list | `status >= ANCHOR` | Lifecycle B — disabled in draft |

**Derived panel, always visible on the right**, refreshing on every keystroke,
showing both price scenarios side by side. When an input is missing, the panel
shows the field name that is blocking — never a zero.

**Gate:** B01–B07, B09, B10, B18.

---

### Tab 4 — Timeline

| Order | Field | Note |
|---|---|---|
| 1 | Anchor bid window | Rendered only if anchor enabled on tab 3 |
| 2 | QIB / NII / Retail / Employee / Shareholder windows | Open datetime defaults from the retail row |
| 3 | UPI mandate cut-off | |
| 4 | Basis of allotment, refund, demat credit, listing | |
| 5 | **Dates are tentative** flag | New — see Part D |

**Derived:** bidding working days, T+3 listing check, anchor lock-in end dates,
public countdown target.

**Gate:** B11–B15.

---

### Tab 5 — Intermediaries

Order: BRLM → syndicate members → registrar → sponsor bank → escrow / refund /
public issue banks → market maker (SME) → underwriters → IPO partner.

Registrar carries a new field: **`allotment_status_url`** — the public link the
B2C page shows once allotment is done. Missing from the legacy form entirely.

**Gate:** B17.

---

### Tab 6 — Company & Content

Order: logo, website, promoters → company info → strengths → **full financials
table** → objects of the issue → contact → FAQs.

**New warning W09:** the full financials table's latest period must reconcile
with the tab 1 eligibility snapshot. A mismatch means one of the two was typed
wrong, and the reservation shape may rest on a bad number.

**Gate:** B16, and W09 surfaced.

---

### Tab 7 — Documents & Print

Order: RHP / DRHP / prospectus → ASBA resident form + field map → ASBA syndicate
form + field map → application series.

**Gate:** B21, B22.

---

### Tab 8 — Review & Publish

Full checklist, derived summary at both price scenarios, **a preview of the
public payload exactly as the website will receive it**, then the status
transition control.

---

## Part D — Public page contract

The B2C page currently reads columns that this project turns into derived
values. Getting this wrong takes the live site down, so it gets its own
versioned contract and its own cutover.

### D1 — Payload shape

The website consumes one endpoint per IPO. Every block carries an
`availability` discriminator so a partially-configured IPO renders *nothing*
rather than zeros.

```jsonc
{
  "contract_version": 2,
  "symbol": "MVELECTRO",
  "company_name": "MV ELECTROSYSTEMS LIMITED",
  "status": "OPEN",
  "dates_are_tentative": false,

  "header": {
    "availability": "READY",
    "board": "MAINBOARD",
    "mechanism": "BOOK_BUILT",
    "exchanges": ["NSE", "BSE"],
    "face_value": 5.00,
    "price_band": { "floor": 400, "cap": 425 },
    "issue_size_cr": 290.00,
    "fresh_issue_cr": null,        // populate once §2.2 is filled
    "ofs_cr": null,
    "lot_size": 34,
    "min_investment": 14450
  },

  "lot_table": {
    "availability": "READY",
    "rows": [
      { "label": "Retail (min)", "lots": 1,  "shares": 34,   "amount": 14450   },
      { "label": "Retail (max)", "lots": 13, "shares": 442,  "amount": 187850  },
      { "label": "S-HNI (min)",  "lots": 14, "shares": 476,  "amount": 202300  },
      { "label": "B-HNI (min)",  "lots": 70, "shares": 2380, "amount": 1011500 }
    ]
  },

  "reservation": {
    "availability": "READY",
    "rows": [
      { "category": "QIB",       "pct": 75, "shares": 5117680, "amount_cr": 217.50 },
      { "category": "NII_BIG",   "pct": 10, "shares": 682346,  "amount_cr": 29.00  },
      { "category": "NII_SMALL", "pct": 5,  "shares": 341156,  "amount_cr": 14.50  },
      { "category": "RETAIL",    "pct": 10, "shares": 682346,  "amount_cr": 29.00  }
    ]
  },

  "timeline": {
    "availability": "READY",
    "is_tentative": false,
    "windows": [ /* per category open/close */ ],
    "milestones": { "basis": "2026-08-04", "refund": "2026-08-05",
                    "demat": "2026-08-05", "listing": "2026-08-06" }
  },

  "anchor":       { "availability": "PENDING", "reason": "ANCHOR_DATE_NOT_REACHED" },
  "subscription": { "availability": "PENDING", "reason": "BIDDING_NOT_OPEN" },
  "registrar":    { "availability": "READY", "name": "...", "allotment_status_url": "..." },
  "listing":      { "availability": "NOT_APPLICABLE" }
}
```

`availability` values: `READY`, `PENDING` (with a machine-readable `reason`),
`NOT_APPLICABLE`, `WITHHELD` (configured but deliberately unpublished).

**Never emit `0`, `null` inside a `READY` block, or a placeholder string.** A
zero issue size on a live page is worse than an absent section.

### D2 — Source map

| Public element | Source | Complete after |
|---|---|---|
| Status badge, countdown | Derived from `status` + bid windows | Tab 4 |
| Price band, face value, lot size | `ipo_pricing` | Tab 2 |
| Minimum investment | Derived, L1 | Tab 2 |
| Lot table (4 rows) | Derived, L1 | Tab 2 |
| Issue size ₹ Cr | Derived, L2 | Tab 3 block 2 |
| Fresh / OFS split | `ipo_offer` | Tab 3 block 2 |
| Reservation table | Derived, L4 | Tab 3 block 6 |
| Anchor allocation + investor list | `ipo_anchor` (B) | `status >= ANCHOR` |
| Timeline | `ipo_bid_window` + `ipo_milestone` | Tab 4 |
| Registrar + allotment link | `ipo_intermediary` | Tab 5 |
| Company info, strengths, financials, objects, FAQ | `ipo_content` | Tab 6 |
| RHP / DRHP links | `ipo_document` | Tab 7 |
| Live subscription per category | Snapshot table ÷ derived `shares_i` | In-flight |
| Listing price, listing gain | Post-listing (C) | After listing |

### D3 — Gaps the public page needs and the entry form does not capture

Add these; each is currently unrepresented.

1. `registrar.allotment_status_url`
2. `ipo_offer.fresh` / `ofs` — every public IPO page shows this split
3. `dates_are_tentative` — pre-RHP dates must be labelled tentative
4. `ipo_subscription_snapshot` — `(captured_at, category, bids_shares, bid_amount)`;
   subscription multiple = `bids_shares / derived shares_i`
5. `ipo_listing_result` — `(open_price, close_price, listing_gain_pct)`
6. `publish_enabled` per block, so a section can be withheld without unpublishing
   the whole IPO

Decide separately whether GMP is displayed; if so it needs its own source table
and a disclaimer, and it must never be computed by this engine.

### D4 — Caching

Derived values now compute on read. The public page is the highest-traffic
consumer, so:

- Cache the payload keyed on `(ipo_id, ipo.updated_at, rule_pack_version)`.
- Invalidate on any input write, any status transition, and any rule-pack change.
- For `status = LISTED`, serve `ipo_derived_snapshot` directly and cache
  indefinitely — a listed IPO's published numbers must never move.
- Subscription blocks bypass the cache; give them their own short TTL.

### D5 — Cutover

Do not migrate the website and the admin at the same time.

1. Build the `v2` payload alongside the existing endpoint.
2. Keep a **`v1` compatibility endpoint** serving the legacy field names —
   including `no_of_app` and `retail_cut_off` — populated from derived values
   rather than from the dropped columns. The website keeps working untouched.
3. Diff `v1` old versus `v1` new across every existing IPO. Zero differences
   expected on correct records; the differences you *do* find are real data
   defects, not migration bugs.
4. Migrate the website to `v2`.
5. Retire `v1` only once no traffic remains.

Phase 0 of the implementation brief must inventory every consumer of these
fields before step 1 begins — including the mobile app, exports and any partner
feed, not just the website.

---

## Part E — Additions to the other documents

Fold these in when implementing:

- **Spec §6:** add blocking rule **B24** (`nii_small_min_lots == retail_max_lots + 1`)
  and warning **W09** (eligibility snapshot versus full financials mismatch).
- **Spec §2.10:** add `allotment_status_url` to the registrar role.
- **Spec §2.9:** add `is_tentative` to `ipo_milestone`.
- **Spec §2:** add `ipo_subscription_snapshot` and `ipo_listing_result`.
- **Spec §5:** add the lot-table derivation as **Step 5a**, explicitly independent
  of issue size.
- **Brief §4:** insert **Phase 5b — Public payload v2 and the v1 compatibility
  endpoint**, between the Offer & Reservation tab and the remaining tabs. The
  website cutover cannot wait until Phase 7.
