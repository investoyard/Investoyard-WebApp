# Investoyard — Project Guide (CLAUDE.md)

> Auto-loaded each session. Investoyard is an **independent project** (it was split out of an
> unrelated `D:\FINWAVE AOF` account-opening-forms project on 2026-06-21 — they are NOT related).

## What this is
**Investoyard** — a B2C **IPO information + application** platform for India (Mainboard + SME).
Independent product that consumes the operator's existing **merchant-banker IPO-distribution
empanelment** (Axis Capital / Nuvama / JM Financial) as its application rail. Brand: indigo
`#3c2e7e` + gold `#ffcb32`. Tagline: "Investing in IPOs, has never been this easy."
Operating entity: **Safal Capital Services Private Limited**.

Three business models, one platform: **M1 B2C (live)** → **M2 broker white-label (partner Print-PDF API shipped)** → M3 B2B2C.

## Status (as of 2026-08-20) — LIVE, deployed on this Windows server
- **Web**: https://newipo.finwave.co — Next.js **static export** (`apps/web/out`) served by IIS. Deploy = `cd apps/web && npm run build` (instant, no pool involved).
- **API**: https://newipoapi.finwave.co/api — NestJS via **iisnode** from `apps/api/dist`. Deploy needs the **app-pool handshake** (see below).
- **DB/Redis**: portable Postgres :5433 + Redis :6379 — **NO Docker**. After any reboot: `scripts\db.ps1 start` + `scripts\redis.ps1 start` (or `scripts\start-services.bat`). A downed DB looks like a CORS/500.
- **Mobile**: Expo **SDK 54** (Play-Store Expo Go works). Dev: `cd apps\mobile; $env:REACT_NATIVE_PACKAGER_HOSTNAME='103.107.27.38'; $env:EXPO_OFFLINE='1'; npx expo start --clear`.

### API deploy handshake (CRITICAL)
iisnode locks `dist` + the Prisma engine DLL while the pool runs. **User** stops the pool → then:
`npx prisma generate` (only if schema changed) → `npx tsc -p tsconfig.json --outDir dist` → **user** starts the pool.
- `npx prisma db push --skip-generate` is SAFE while the pool runs; `prisma generate` is NOT.
- New-Prisma-model code shows "property does not exist on PrismaService" typecheck errors until the handshake — expected, not a bug.
- **NEVER run root `npm run build` (turbo) while the pool runs** — nest's clean step guts `dist` and causes a delayed outage. Build workspaces individually.
- Seed is CLEAN-SLATE — never run against prod. Use `npm run ensure-roles` for additive role changes.

## What's built (beyond the original slice)
- **Apply system**: shared **bid engine** (`packages/shared-types/bidEngine.ts` — presets, custom-by-₹Cr, category/caps as rule inputs incl. admin-configurable `upiCap`); UPI apply flow (Retail | HNI | Shareholder tabs, per-family-member overrides, single itemized consent); separate **Print Forms** flow; per-IPO operator gates **Start Bid / Start Print**; PAN-duplication per bucket (public vs shareholder/employee).
- **Print engine**: fillable-**AcroForm** filling by field name (MANIPAL-style blanks: `SYMBOL.pdf`/`_SA`/`_SHA`, duplicate-named counterfoil fields, maxLength truncation, amount-in-words) with coordinate-overlay fallback; form numbers from per-IPO PDF series. **Print = no business validation** (operator policy); rail applications keep all SEBI checks.
- **Partner API (M2)**: `POST /partner/v1/print-forms` — per-tenant API keys (`X-Api-Key keyId.secret`), partner sends FINAL data printed verbatim, PII vaulted per tenant, same PDF series; admin: key panel on tenant page, **API Docs / API Calls / Print Report (CSV)** under "Partner API".
- **Front site**: dynamic banner carousel (auto IPO slides + admin Banners), Today strip, time-aware status chips + calibrated demand words (SME vs Mainboard thresholds), live nav with signals + IPO command panel, hubs **/gmp /subscription /allotment /performance /calendar /news /glossary**, GMP-accuracy section, public allotment checker (PAN), SEO listing pages (/ipos/open|upcoming|listed, /sme), trust pages (/about /faqs /terms /disclaimer /privacy-policy), WhatsApp CTA (tenant setting `whatsappChannel`), news engine (admin-written posts, TipTap rich-text editor shared with the IPO form), lifecycle reminders (server watchlist + hourly alert sweep: open/closing/allotment/listing).
- **Masters** (admin): Lead Managers · Registrars · IPO Categories · Issue Types · Relationships · **UPI Handles** (validates profile UPI IDs) · **Anchor Investors** (picked per IPO with ₹ amounts).
- **Allotment imports** (admin): registrar allottee files (DBF/XLSB/XLSX/CSV, ≤100 MB; IIS limit raised to 200 MB in `apps/api/web.config`) per IPO — parsed in a **spawned worker process** (a 1M-row XLSB needs ~3 GB heap / 25 s; NEVER parse in the iisnode event loop), batch-inserted into `AllotmentRecord` (raw PAN by operator decision — admin-only data), auto-matches OUR applications by PAN → status + registrar rejection reason (`Application.allotmentReason`) through the standard recordAllotment path. **Allotment List** search: partial PAN + amount with `>/</=`. DB size bounded by **archive-then-purge**: gz NDJSON on disk, one-click restore, auto-sweep 60 days after listing. Public `/allotment` checker answers ANY PAN from registrar rows when we hold no in-house application.
- **Day-wise trends**: admin GMP saves append `extra.gmpLog`; subscription poller appends `extra.subLog`. `enrich()` shows REAL data or nothing for live rows — synthesized series are seed/demo-only.
- **Live-slug contract** (static export): dynamic pages need a `/X/live` client fallback + IIS rewrite in `apps/web/public/web.config` — exists for `ipos`, `apply`, `print`, `news`.
- Mobile mirrors the apply/print flows (BidControls, /print screen, expo-file-system+sharing downloads) — **but Phase 1/2 web features (hubs/strips/chips) are NOT yet on mobile**.

## Commands (from repo root)
```
npm install --legacy-peer-deps   # all workspaces (mobile React 19 vs web React 18)
npm run test                     # turbo test (rail-adapters: 20 tests)
cd apps/web && npm run build     # web deploy (static export → IIS)
cd apps/api && npx tsc -p tsconfig.json --noEmit   # API typecheck (safe anytime)
cd apps/mobile && npx tsc --noEmit                 # mobile typecheck
```
- After npm installs, `scripts/link-expo-router.js` (postinstall) re-junctions Expo packages; if Metro says "Cannot find module babel-preset-expo", run it manually.
- Web builds bake MOCK data when the API is unreachable from the build box; the browser re-fetches live data client-side — this is the designed behavior.

## Conventions
- **Design = "calm & data-clear"** (Apple discipline + functional financial color). Neutral base, hairline borders, indigo on CTAs; **semantic green/red only for financial signals**. Listed chip = light purple; Print Forms CTA = light red `#fdebea`/`#b3372e`. **Never copy competitor UI** (IPOJI/IPOGuru studied for features, not looks).
- Reusable admin UI lives in `apps/web/components/ui` — incl. **SearchSelect** (type-to-filter combobox; list renders via portal because admin `.card` is `overflow:hidden`), **Toast** (top-right toasts), `.filter-row` (aligns filter fields + buttons; `.field` carries an 18px bottom margin).
- **One type contract** — shared types AND the bid engine live in `packages/shared-types`.
- **i18n** — `packages/i18n` en+hi (front-site feature pages are currently EN-literal; hindi pass pending).
- Round-based workflow: build → deploy → user verifies → "commit all". PowerShell 5.1: no `&&`, no embedded `"` in git -m (use quote-free here-strings).

## Domain & compliance rules (MUST follow)
- **Self-PAN rule:** every RAIL application uses that person's own PAN + demat + bank/UPI; one public (retail/HNI) application per PAN per IPO **plus** one per reserved quota (shareholder/employee). Print-PDF paths are validation-free by operator policy.
- **GMP** = unofficial/unregulated → always with the disclaimer; OFF for gmp-disabled tenants; no kostak/sauda quotes.
- **Distribute + inform, don't advise** — no recommendations, ratings or review scores (no RIA registration).
- **DPDP** — just-in-time collection, explicit consent (single-checkbox itemized wording is in use — flag for counsel), PII vault-tokenized.
- **Partner-commission module DEFERRED** until the SEBI referral/AP regime settles.

## Application rail
- NSE adapter: verified WEB API v1.20.5; BSE iBBS: guarded template (domestic doc still needed). Docs at `D:\Claude\IPO Application\`; member creds in admin Exchange Rails (subscription polling always uses the operator's own member; bidding routes by the IPO's active online-series member).

## Open items
- **Sir's decision pending**: Buyback + OFS modules & new IPO fields (see the field-list doc from 2026-08-20 session).
- **Untested**: partner-API end-to-end (needs a key), MANIPAL blank on a live IPO, WhatsApp channel URL not yet configured, mobile walk-through.
- **Mobile catch-up** of Phase 1–3 web features; EAS Android build (needs Expo account + icon).
- Human actions: counsel sign-offs (incl. Terms/Disclaimer drafts), NSE UAT creds, domestic BSE iBBS doc, native Hindi review.

## Read next
`docs/Investoyard - Project Status & Handoff.md`, `RUNNING.md`, and the memory files auto-loaded each session.
