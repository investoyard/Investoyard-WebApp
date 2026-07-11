# Investoyard Rail Adapters

TypeScript adapters that let Investoyard submit IPO applications through exchange rails under an empaneled **member/merchant-banker's credentials**. One `RailAdapter` interface, one adapter per exchange.

Drop into the monorepo at `apps/api/src/rail/` (or publish as `packages/rail-adapters`).

## Files
| File | What |
|---|---|
| `src/rail-adapter.types.ts` | `RailAdapter` interface + shared domain types (`MemberCredential`, `BidSubmission`, `BidResult`, …) |
| `src/http.ts` | Minimal JSON fetch helper + `RailError` |
| `src/nse-eipo.adapter.ts` | **NSE e-IPO** — ✅ built against verified WEB API v1.20.5 (Sep 2025) |
| `src/bse-ibbs.adapter.ts` | **BSE iBBS** — ⚠️ template from India INX iBBS v1.1; **confirm vs domestic BSE doc** before enabling |
| `src/index.ts` | barrel + `getAdapter()` + `RailOrchestrator` (session cache) |
| `src/callbacks/*` | **NSE callback endpoints** (NestJS) — DP-verify + UPI-payment status → application status |
| `src/submission/submission-worker.ts` | **Queue-backed submission** — idempotency, retry classification, closing-day burst (BullMQ wiring example) |
| `src/**/*.spec.ts` | **Unit tests** — `npm test` (20 passing: auth, status mappers, bid-payload builder) |

## Test
```
npm install && npm test     # 20 tests, 3 suites — green
```
The callback-auth test asserts `expectedAuthHeader('Pass@123')` equals the NSE doc's exact example — so the auth scheme is verified, not assumed.

## Callbacks (status engine)
NSE pushes status to **endpoints we expose** (NSE WEB API v1.20.5, Chapter 4):
| Endpoint (we host) | Pushes | Drives |
|---|---|---|
| `POST /v1/appdpstatus` | DP verification (P/S/F) | `submitted → dp_verified / dp_failed` |
| `POST /v1/apppaystatus` | UPI payment status code | `mandate_pending → upi_blocked` (100=Accepted), `rejected` (11/12/13/21/22/31), `released` (110) |
| `POST /v1/notification` | host notifications | logged/routed |

- **Auth (inbound):** `Authorization = base64(SHA256(SHA1(password)))` — see `rail-callback.auth.ts` (constant-time compare + NestJS guard). ⚠️ confirm SHA1-input encoding (hex vs raw) on UAT.
- Always respond `{ status: "success" }` / `{ status: "failed", reason }` as the doc requires.
- `rail-callback.service.ts` is framework-agnostic — wire `ApplicationRepo` + `Notifier` to your providers. These transitions also feed the user's S9 status screen + push alerts.

## Status
- **NSE_EIPO** — ready to integrate. Verified endpoints: `/login`, `/v1/ipomaster`, `/v1/transactions/add`, `/v1/transactions/addbulk` (family ≤100), `/v1/transactions/fetch`, `/v1/allotment`. Member login + `upiFlag='Y'` + investor `upi`; ASBA block-ref optional for UPI.
- **BSE_IBBS** — **guarded.** All submit methods throw `NOT_CONFIRMED` until you (1) obtain the **domestic BSE Limited iBBS** API doc via BSE membership, (2) validate field names/category codes/UPI semantics on UAT, (3) set `confirmed = true` in the adapter. The India INX doc on hand is BSE's *international* (GIFT-City) exchange — wrong market for domestic IPOs.

## Usage
```ts
import { RailOrchestrator, BidSubmission } from './rail-adapters';

const orchestrator = new RailOrchestrator(async (id) => loadMemberCredentialFromVault(id));

const bid: BidSubmission = {
  clientRef: 'app_123',          // echoed to rail `remark` for reconciliation
  activity: 'new',
  symbol: 'ACME',
  category: 'IND',               // from ipomaster
  pan: 'ABCDE1234F',
  depository: 'NSDL',
  dpId: '12345678',
  clientBenId: '87654321',
  upi: 'rahul@upi',              // member-login UPI flow
  bids: [{ quantity: 142, atCutOff: true, amount: 14910 }],
};

const result = await orchestrator.submit(bid, 'memberCred_nse_axis');
// persist result → `application`; on !result.ok or RailError → offer PDF fallback (S8b)
```

## App-layer responsibilities (NOT in these adapters)
- **Queue-backed submission** for closing-day bursts; **idempotency keys**.
- Persisting `BidResult` → `application` rows; status via NSE **callback APIs**
  (DP-verification + UPI-payment) + `transactions/fetch` / `allotment` reconciliation.
- **PII**: pass resolved PAN/UPI/bank at call time from the vault; never log them.
- Enforce **self-PAN/demat/bank/UPI** per applicant (incl. family) before calling.
- Rate-limit `addbulk` to ≤100 records/call.

## To-confirm against member docs
- NSE: exact `/login` route + `ipomaster` verb (isolated as `PATHS` constants), full error-code appendix, callback payload shapes, UAT base URL.
- BSE: everything (see adapter header) — domestic doc required.
