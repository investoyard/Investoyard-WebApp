# Investoyard — Rail Integration Spec (NSE e-IPO + BSE)

**Prepared:** 21 June 2026
**Source docs reviewed:** `D:\Claude\IPO Application\` — `EIPO-WEB API_Ver1.20.5.zip` (NSE) and `INDIA_INX_IBBS_API_for_IPO_v1 1…pdf`.
**Purpose:** Map the real exchange APIs to the Investoyard Rail Adapter + data model so engineering can build native apply.

---

## 0. Document verification result

| Doc | What it actually is | Verdict |
|---|---|---|
| **NSE** — `EIPO-WEB API_Ver1.20.5` | NSEIL **Initial Public Offering System — WEB API Protocol v1.20.5, Sep 2025** (domestic NSE e-IPO). + `EIPO Query API v1.0.3.1`. | ✅ **Correct & current. Use as-is.** |
| **"BSE"** — `INDIA_INX_IBBS_API_for_IPO_v1.1` | **India INX (India International Exchange, GIFT City) iBBS API v1.1** — BSE's *international* exchange, **not** domestic BSE Limited. (Evidence: `www.indiainx.com` footers, NOSTRO/SWIFT international-banking fields.) | ⚠️ **Wrong exchange for domestic IPOs.** |

**Action on BSE:** obtain the **domestic BSE Limited iBBS API** documentation via your BSE member/empanelment access. The India INX doc is for GIFT-City international securities, not domestic mainboard/SME IPOs. *(Not blocking Phase 1 — most mainboard IPOs are also on NSE, so the NSE rail covers the large majority; BSE-only and BSE-SME issues need the correct doc.)*

> Per your guidance, I did **not** web-research the latest BSE version — the correct domestic BSE iBBS spec comes from your member access, not the open web.

---

## 1. NSE e-IPO Web API — confirmed capabilities (v1.20.5)

Base: `https://<baseUrl>/<version>/...` · JSON · token auth. Two environments in the doc (Live + UAT/sandbox).

**Endpoint inventory (relevant subset):**
| Endpoint | Use |
|---|---|
| `POST /login` | Authenticate member; returns token (sent as `Authorization` header) |
| `GET /v1/heartbeat` | Liveness |
| `GET /v1/ipomaster` | **IPO master data** (issues, categories/subcategories, dates) → powers calendar/detail |
| `POST /v1/transactions/add` | **Place / modify / cancel an application + its bids** (the core apply) |
| `POST /v1/transactions/addbulk` | Same, **bulk** (≤100 records) → **family multi-applicant** in one call |
| `POST /v1/transactions/fetch` | Fetch applications |
| `GET /v1/transactions/slice/{from}/{to}` | Download applications by time window (reconciliation) |
| `POST /v1/eforms/add` / `query` | E-forms |
| `GET /v1/mismatches/{symbol}` | DP/UPI mismatch report |
| `GET /v1/allotment/{from}/{to}` · `POST /v1/allotment/fetch` | **Allotment** results |
| Callback APIs: `POST /v1/notification`, DP-verification-status, UPI-payment-status | **Async status** → DP verify + UPI block updates |
| `GET /v1/holidaymaster` | Calendar |
| (NCB / tender / SGB master+add+fetch) | Other products (out of Phase 1 scope) |

**Key for us — `POST /v1/transactions/add` (UPI/ASBA bid):**
- Identity fields: `symbol`, `applicationNumber`, `category`, `clientName`, `depository` (NSDL/CDSL), `dpId`, `clientBenId`, `pan`.
- Payment: `upiFlag` (**Y = UPI-based blocking**, N = non-UPI ASBA), `upi` (investor UPI ID), `bankCode`/`locationCode` (member + non-UPI), `bankAccount`/`ifsc` (bank login), `referenceNumber` (ASBA block ref).
- **`subBrokerCode`** — populated when logged in as a member (our case).
- `bids[]`: `activityType` (new/modify/cancel), `bidReferenceNumber`, `quantity`, `atCutOff` (true/false), `price` (if not cut-off), `amount`, `remark` (can carry our own bid UID).
- **ASBA Block Ref rule:** *"Non-Mandatory in case of UPI & Non-3-in-1 account type bid."* → for our member-login UPI retail flow, the block ref isn't required; the UPI mandate carries the block.

**Investoyard's login mode:** **Member** (via the empaneled member's credentials), `upiFlag = Y`, supply investor `upi`. Exactly the standardized "enter the member's credentials" model you described — confirmed by the doc.

---

## 2. Mapping to the Rail Adapter interface

```ts
// NseEipoAdapter implements RailAdapter
interface RailAdapter {
  login(memberCredential)                          // POST /login → token (cache per session)
  getIpoMaster()                                    // GET  /v1/ipomaster
  submitBid(profile, ipo, bid, memberCredential)    // POST /v1/transactions/add   (upiFlag=Y, upi=profile.upi)
  submitBidsBulk(applications[])                     // POST /v1/transactions/addbulk  (family group, ≤100)
  modifyBid(...) / cancelBid(...)                    // POST /v1/transactions/add  (activityType=modify/cancel)
  getStatus(window)                                  // POST /v1/transactions/fetch  /  slice
  getAllotment(window)                               // GET /v1/allotment/{from}/{to} / fetch
  // inbound: register callback handlers for DP-verification + UPI-payment-status + notification
}
```

**Adapter selection (per your standardized-rail insight):** the orchestrator picks `NseEipoAdapter` or `BseIbbsAdapter`, parameterized by the `member_credential` (login id, member code, password, [iBBS id for BSE]). Same code path, different creds.

---

## 3. Data-model refinements (from the real fields)

Update `member_credential` (Data Model §2.10) to the actual auth fields:
| Column | NSE | BSE iBBS |
|---|---|---|
| login_id | ✓ | ✓ |
| member_code | ✓ | ✓ |
| password (vault) | ✓ | ✓ |
| ibbs_id (vault) | — | ✓ (BSE/INX uses `ibbsid`) |
| base_url / env | Live/UAT | Live/UAT |

Update `application` (Data Model §2.8):
- `category` (string code, per ipomaster category list — not just an enum) · `sub_broker_code` · `application_number` · `bid_reference_number` (per bid) · `upi_flag` · `asba_block_ref` (nullable for UPI) · `remark` (our bid UID).
- Status now driven by **callback APIs**: DP-verification-status + UPI-payment-status → drive `status` transitions (submitted → DP-verified → mandate/UPI-blocked → confirmed → allotted/unblocked). Implement callback endpoints.

Update `ipo` master sync:
- Source from `GET /v1/ipomaster` (issues, **category/subcategory settings**, dates) on a schedule → our `ipo` + category tables.

---

## 4. Build implications for Phase 1

- **Family multi-apply** maps cleanly to `transactions/addbulk` (≤100 records/call) — one network call for a family group. ✅ aligns with the product spec.
- **UPI flow:** member login + `upiFlag=Y` + investor `upi`; block ref not required → simplest path. The UPI mandate handoff (S8a wireframe) is the investor approving the block in their UPI app; status returns via the **UPI-payment-status callback**.
- **Status is async** → implement the callback endpoints (DP verify, UPI payment, notification) + reconcile via `transactions/slice` and `allotment` windows. Update the queue/worker design to consume callbacks.
- **Sandbox:** the NSE doc lists UAT URLs → build/test against UAT before Live.
- **Rate limits:** `addbulk` capped at 100 records / 100 requests window (per doc) → batch family/large volumes accordingly; keep the queue-backed submission.

---

## 5. Open items
1. **Obtain domestic BSE Limited iBBS API doc** (the file on hand is India INX). → enables `BseIbbsAdapter`.
2. Confirm **member credentials + UAT access** for the launch rail (NSE first).
3. Read remaining NSE doc detail (eforms, full error-code appendix, callback payloads) at implementation time — endpoint inventory + core bid mapping above is enough to start `NseEipoAdapter`.

---

### Net
**NSE e-IPO API is verified, current (v1.20.5, Sep 2025), and fully supports our member-login UPI-ASBA + bulk-family model — build `NseEipoAdapter` now.** The "BSE" file is India INX (wrong exchange); get the domestic BSE iBBS doc to add `BseIbbsAdapter`, but it does not block a NSE-first Phase 1 launch.
