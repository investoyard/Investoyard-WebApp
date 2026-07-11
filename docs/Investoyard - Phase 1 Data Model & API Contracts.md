# Investoyard — Phase 1 Data Model & API Contracts

**Prepared:** 21 June 2026
**Purpose:** Concrete engineering artifact to start backend + frontend in parallel. PostgreSQL data model + REST/OpenAPI contracts for the Phase 1 B2C MVP.
**Stack:** Node.js/NestJS (TypeScript), PostgreSQL + Redis, REST + OpenAPI. Aligns with *Phase 1 Product Spec* and *Tech Stack* docs.

> **[PROVISIONAL — RAIL]** marks fields/endpoints that depend on the NSE e-IPO / BSE IBBS research now running; structure is stable, details may refine.
> **PII** marks fields that must be **tokenized + vaulted** (encrypted, not stored raw in the primary DB).

---

## 1. Entity-relationship overview

```
User (1) ──< (N) InvestorProfile        # self + family members
User (1) ──< (N) Consent
User (1) ──< (N) WatchlistItem
User (1) ──< (N) DeviceToken
InvestorProfile (1) ──< (N) Application
IPO (1) ──< (N) Application
IPO (1) ──< (1) IpoSubscription (latest)  + history
IPO (1) ──< (1) IpoGmp (latest) + history
IPO (1) ──< (N) IpoDocument
Application (1) ──< (N) ApplicationStatusEvent
MemberCredential (1) ──< (N) Application   # which member's creds the bid was submitted under
```

---

## 2. Data model (PostgreSQL)

### 2.1 `user` — identity (Tier 1)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| mobile | varchar(15) unique | login identity (OTP) |
| email | varchar | optional |
| name | varchar | optional |
| status | enum(active, suspended, deleted) | |
| marketing_consent | bool default false | separate from service consent |
| created_at / updated_at | timestamptz | |

### 2.2 `investor_profile` — applicant (Tier 2; self + family)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → user | owner login |
| relationship | enum(self, spouse, child, parent, sibling, other) | "self" for primary |
| full_name | varchar | as per PAN |
| pan | **PII** token ref | unique per IPO application enforced downstream |
| date_of_birth | date | |
| depository | enum(CDSL, NSDL) | |
| dp_id | varchar | demat |
| client_id | varchar | demat |
| bank_account | **PII** token ref | for ASBA |
| ifsc | varchar | |
| upi_id | **PII** token ref | for UPI-ASBA mandate |
| kyc_status | enum(unverified, verified, failed) | Phase 1: format-validate; deeper KYC via rail |
| created_at / updated_at | timestamptz | |

> **Rule:** every Application uses its profile's own PAN/demat/bank/UPI. No cross-profile funding. Family = multiple profiles under one `user`.

### 2.3 `consent` — DPDP record
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| type | enum(service, marketing, data_sharing_rail, analytics) | |
| notice_version | varchar | exact notice text version shown |
| granted_at | timestamptz | |
| withdrawn_at | timestamptz null | |
| channel | varchar | app/web |

### 2.4 `ipo` — master data
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar | |
| logo_url | varchar | |
| type | enum(mainboard, sme) | |
| exchanges | text[] | [NSE], [BSE], or both |
| status | enum(upcoming, open, closed, listed, withdrawn) | |
| open_date / close_date | date | |
| listing_date | date null | |
| price_band_min / price_band_max | numeric | |
| lot_size | int | |
| min_amount | numeric | derived |
| issue_size | numeric | |
| isin | varchar | |
| registrar | varchar | RTA |
| objects_of_issue | text | use-of-proceeds |
| sme_flags | jsonb | EBITDA test, OFS%, GCP% (per Mar-2025 norms) |
| created_at / updated_at | timestamptz | |

### 2.5 `ipo_subscription` (live + history)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ipo_id | uuid FK | |
| category | enum(qib, nii, retail, employee, total) | |
| times_subscribed | numeric | e.g. 35.2 |
| as_of | timestamptz | |

### 2.6 `ipo_gmp` (live + history)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ipo_id | uuid FK | |
| value | numeric | grey-market premium |
| trend | enum(up, down, flat) | |
| source | varchar | provider |
| as_of | timestamptz | always rendered with "unofficial" disclaimer |

### 2.7 `ipo_document`
| id | uuid PK | | ipo_id | FK | | type | enum(RHP, DRHP, prospectus) | | url | varchar | | summary | text null | *(plain-language summary is Phase 2)* |

### 2.8 `application`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| investor_profile_id | uuid FK | the applicant |
| ipo_id | uuid FK | |
| category | enum(retail, …) | Phase 1: retail |
| lots | int | |
| at_cutoff | bool | |
| bid_price | numeric null | null if cut-off |
| amount | numeric | blocked amount |
| apply_method | enum(native, pdf) | |
| rail | enum(nse_eipo, bse_ibbs) null | **[PROVISIONAL — RAIL]** |
| member_credential_id | uuid FK null | **[PROVISIONAL — RAIL]** which member's creds |
| bid_cum_application_no | varchar null | returned by exchange |
| upi_mandate_status | enum(pending, accepted, declined, expired) null | |
| status | enum(draft, submitted, mandate_pending, confirmed, allotted, not_allotted, unblocked, failed) | |
| created_at / updated_at | timestamptz | |

### 2.9 `application_status_event` — audit trail
| id | uuid PK | | application_id | FK | | status | enum | | detail | jsonb | | at | timestamptz | |

### 2.10 `member_credential` — rail submission identity **[PROVISIONAL — RAIL]**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| exchange | enum(nse_eipo, bse_ibbs) | |
| member_name | varchar | broker / merchant banker (Axis, Nuvama, JM…) |
| member_type | enum(broker, merchant_banker, syndicate) | |
| credentials_ref | **PII** vault ref | secrets, never in DB |
| active | bool | |

> Reflects your insight: the exchange API is standardized; we select **which member's credentials** to submit under per IPO. One integration per exchange, parameterized by `member_credential`.

### 2.11 `watchlist_item`, `device_token`, `notification_pref`
- `watchlist_item`: user_id, ipo_id, created_at.
- `device_token`: user_id, platform(ios/android/web), token, active.
- `notification_pref`: user_id, event_type, enabled.

---

## 3. API contracts (REST)

Base: `/api/v1` · JSON · Bearer (JWT) auth except public reads · OpenAPI spec to be generated from these.

### 3.1 Auth & identity
```
POST /auth/otp/request      { mobile }                         → 200 { requestId }
POST /auth/otp/verify       { requestId, otp }                 → 200 { accessToken, refreshToken, user }
POST /auth/refresh          { refreshToken }                   → 200 { accessToken }
GET  /me                                                       → 200 { user }
PATCH /me                   { name?, email?, marketingConsent? }→ 200 { user }
DELETE /me                  (DPDP delete)                      → 202
GET  /me/data-export        (DPDP download)                   → 202 { jobId }
```

### 3.2 Consent
```
POST /consents              { type, noticeVersion }            → 201 { consent }
DELETE /consents/{type}     (withdraw)                         → 200
GET  /consents                                                 → 200 { consents[] }
```

### 3.3 Investor profiles (self + family)
```
GET    /profiles                                               → 200 { profiles[] }
POST   /profiles            { relationship, fullName, pan, dob,
                              depository, dpId, clientId,
                              bankAccount, ifsc, upiId }        → 201 { profile }   # PII tokenized server-side
GET    /profiles/{id}                                          → 200 { profile }    # PII masked
PATCH  /profiles/{id}       { ...editable }                    → 200 { profile }
DELETE /profiles/{id}                                          → 204
```

### 3.4 IPOs (public — Tier 0, no auth)
```
GET /ipos                   ?type=&status=&sector=&q=&page=    → 200 { ipos[], page }
GET /ipos/{id}                                                 → 200 { ipo }
GET /ipos/{id}/subscription                                   → 200 { categories[], asOf }
GET /ipos/{id}/gmp                                            → 200 { value, trend, asOf, disclaimer }
GET /ipos/{id}/documents                                     → 200 { documents[] }
GET /ipos/{id}/allotment    ?pan=  | ?applicationNo=          → 200 { status, registrarUrl }
```

### 3.5 Applications **[bid submission PROVISIONAL — RAIL]**
```
POST /applications          { investorProfileId, ipoId, category,
                              lots, atCutoff, bidPrice?,
                              applyMethod }                    → 201 { application }
   # native: orchestrator submits to exchange under member creds,
   #         returns bidCumApplicationNo + initiates UPI mandate
   # pdf:    returns a generated prefilled-ASBA PDF URL
GET  /applications                                            → 200 { applications[] }   # self + family
GET  /applications/{id}                                       → 200 { application, events[] }
POST /applications/{id}/upi-mandate/refresh                   → 200 { upiMandateStatus }
GET  /applications/{id}/pdf   (pdf method)                    → 200 (file)
```

**Native apply sequence (provisional):**
```
client POST /applications (native)
  → Orchestrator.selectRail(ipo) → MemberCredential
  → RailAdapter.submitBid(profile, ipo, bid, creds) → bidCumApplicationNo
  → RailAdapter.triggerUPIMandate(bid, upiId)        → mandate pushed to user's UPI app
  → status: submitted → mandate_pending
  → webhook/poll RailAdapter.getStatus → confirmed
  → later: getAllotment → allotted / not_allotted → unblocked
```

### 3.6 Watchlist & notifications
```
GET    /watchlist                                             → 200 { items[] }
POST   /watchlist           { ipoId }                         → 201
DELETE /watchlist/{ipoId}                                     → 204
POST   /devices             { platform, token }              → 201
GET    /notification-prefs                                    → 200 { prefs[] }
PATCH  /notification-prefs  { eventType, enabled }           → 200
```

### 3.7 Internal — Rail Adapter interface (not public) **[PROVISIONAL — RAIL]**
```ts
interface RailAdapter {
  submitBid(profile, ipo, bid, memberCredential): Promise<{ bidCumApplicationNo }>;
  triggerUPIMandate(bid, upiId): Promise<{ mandateStatus }>;
  getStatus(bidRef): Promise<ApplicationStatus>;
  getAllotment(bidRef): Promise<AllotmentResult>;
  reconcileCommission(period): Promise<CommissionRecord[]>;
}
// Implementations: NseEipoAdapter, BseIbbsAdapter — selected per IPO,
// parameterized by MemberCredential (standardized exchange API).
```

---

## 4. Cross-cutting

- **PII handling:** PAN/bank/UPI/credentials → tokenize at the API boundary; store token refs in DB; raw in encrypted vault. Mask on read.
- **Idempotency:** `POST /applications` accepts an `Idempotency-Key` header (safe retries during closing-day bursts).
- **Rate limiting / caching:** public IPO reads cached in Redis + CDN; per-user write limits.
- **Queue:** native submissions enqueued → worker calls RailAdapter → smooths exchange rate limits.
- **Validation:** retail amount ≤ ₹2L; lot multiples; format checks (PAN/IFSC/UPI) before any rail call.
- **Audit:** every consent + application transition written to event tables (DPDP + reconciliation).

---

## 5. Rail — RESOLVED for NSE (21 Jun 2026)

The NSE e-IPO Web API (v1.20.5, Sep 2025) has been reviewed and verified. The `[PROVISIONAL — RAIL]` items are now concrete for NSE — see **`Investoyard - Rail Integration Spec (NSE e-IPO + BSE).md`**. Key refinements applied there:
- `member_credential` auth fields: `login_id`, `member_code`, `password`, `ibbs_id` (BSE only), `base_url`/env.
- `application` adds: `category` (code), `sub_broker_code`, `application_number`, `bid_reference_number`, `upi_flag`, `asba_block_ref` (null for UPI), `remark`.
- Native apply = `POST /v1/transactions/add` (member login, `upiFlag=Y`); **family = `POST /v1/transactions/addbulk`** (≤100); status via **async callbacks** (DP-verify + UPI-payment) + `allotment`/`slice` reconciliation; UAT sandbox available.
- **BSE caveat:** the document on hand is **India INX (GIFT-City international)**, not domestic BSE Limited — obtain the correct domestic BSE iBBS doc to build `BseIbbsAdapter`. NSE-first Phase 1 is unaffected.
- **The rest of the model is stable and buildable now.**
