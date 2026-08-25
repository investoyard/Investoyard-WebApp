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
- **Excel catalog import** (admin → IPO Management → Import from Excel): reads the operator's data-entry workbook (row 1 bands · row 2 HEADERS · row 3 grey EXAMPLE · data from row 4; column map in `apps/api/src/modules/ipo-import/workbook-map.ts`). **Two-step**: upload VALIDATES only and shows to-import / skipped / errors by row; nothing is written until confirmed. **Existing symbols are skipped entirely** — an import can never modify live IPO data. Imported rows land `hidden` and stay out of every public read until published (**H badge** in the IPO list). BUYBACK/OFS sheets are counted and parked. Guarded undo deletes hidden, importer-created rows with no applications/watchlist/allotment.
- **`Ipo.hidden`** is a REAL column, not a JSON flag: `NOT (extra->'k' = true)` is NULL-not-TRUE for rows lacking the key and once hid the whole catalog (`GET /ipos` returned 0 of 11). `GET /ipos` takes `limit`/`offset` (cap 2000) and excludes hidden; admin opts in with `?all=1`.
- **Front site**: two-slide **brand banner** (slide 1 headline + Hindi statement `डीमैट कहीं भी, अप्लाई इधर ही`; slide 2 tagline + 8 capability chips spotlighting one at a time) holding 9s each vs 5s for data slides, with a progress bar; **IPO slides** carry pastel **category lanes** (Retail/sHNI/bHNI → shares + lot range, amount, For 1×, Est. gain at GMP) over a candlestick backdrop. Also: Today strip, time-aware status chips + calibrated demand words (SME vs Mainboard thresholds), live nav with signals + IPO command panel, hubs **/gmp /subscription /allotment /performance /calendar /news /glossary**, GMP-accuracy section, public allotment checker (PAN), SEO listing pages (/ipos/open|upcoming|listed, /sme), trust pages (/about /faqs /terms /disclaimer /privacy-policy), WhatsApp CTA (tenant setting `whatsappChannel`), news engine (admin-written posts, TipTap rich-text editor shared with the IPO form), lifecycle reminders (server watchlist + hourly alert sweep: open/closing/allotment/listing).
- **Masters** (admin): Lead Managers · Registrars · IPO Categories · Issue Types · Relationships · **UPI Handles** (validates profile UPI IDs) · **Anchor Investors** (picked per IPO with ₹ amounts).
- **Allotment imports** (admin): registrar allottee files (DBF/XLSB/XLSX/CSV, ≤100 MB; IIS limit raised to 200 MB in `apps/api/web.config`) per IPO — parsed in a **spawned worker process** (a 1M-row XLSB needs ~3 GB heap / 25 s; NEVER parse in the iisnode event loop), batch-inserted into `AllotmentRecord` (raw PAN by operator decision — admin-only data), auto-matches OUR applications by PAN → status + registrar rejection reason (`Application.allotmentReason`) through the standard recordAllotment path. **Allotment List** search: partial PAN + amount with `>/</=`. DB size bounded by **archive-then-purge**: gz NDJSON on disk, one-click restore, auto-sweep 60 days after listing. Public `/allotment` checker answers ANY PAN from registrar rows when we hold no in-house application.
- **Day-wise trends**: admin GMP saves append `extra.gmpLog`; subscription poller appends `extra.subLog`. `enrich()` shows REAL data or nothing for live rows — synthesized series are seed/demo-only.
- **Applications-for-1×** is derived from the issue's REAL reservation table + lot size + bid-engine floors (retail 1 lot · S-HNI >₹2L · B-HNI >₹10L); app-wise uses each category's actual subscription, and the operator's `extra.noOfApp` (applications RECEIVED) wins over anything derived. Needs **Reservation table + Issue Size**; **Est. gain at GMP** needs a GMP value. Both columns render with a dimmed `—` when pending rather than disappearing.
- **IPO archive** `/ipos/archive` — year · month · board · search over the comparison table. The main list carries what's in play plus the **last 6 months**; search still reaches the whole catalog.
- **Live-slug contract** (static export): dynamic pages need a `/X/live` client fallback + IIS rewrite in `apps/web/public/web.config` — exists for `ipos`, `apply`, `print`, `news`.
- **Mobile (Expo)**: apply/print flows + **5 tabs** — Home · **Insights** · Applications · Profiles · Account. Insights = allotment checker (any PAN) + GMP / Live Subscription / Listing Performance / News / Glossary / Calendar. Home is cards-first (no hero/greeting): slim header with **Live Subscription** pill, inline **search**, calendar (gold dot when today has events), alerts. Cards/detail/hubs render day-wise trends, anchors, DRHP-RHP links, reminder bells; News carries the banner carousel; Account links the web trust pages.
- **Stage engine**: the derivation + rank + label live in `packages/shared-types/src/stage.ts` (shared by web and mobile); `apps/mobile/lib/ipoStage.ts` maps a stage onto tone/panels/CTA — upcoming→Remind Me · pre-apply→Pre Apply · live→Apply Now · awaiting/allotment-out→Check Allotment · listed→IPO Performance. Card stat grid swaps **Min Application → Subscribed** after close; detail-page sections reorder by stage. Web lists sort by `compareForList` (Closing Today → Open Today → Live → Pre Apply → Upcoming → Allotment Out → Awaiting → Listed).

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
- **One type contract** — shared types, the bid engine, the glossary, `format.ts` (`titleCase()`, the `LABEL` vocabulary, `demandWord`) AND `stage.ts` live in `packages/shared-types`. Web and mobile IMPORT these; never re-implement locally.
- **CSS: check for a name collision before adding a class.** `globals.css` is one big global sheet — a lane cell named `.sh` silently inherited a section utility's 76px vertical padding and blew the banner from 302px to 495px. The build can't catch this; **measure the live DOM**.
- **Web ≠ mobile by design**: web is the research + SEO surface (density, tables, full detail, trust signals, conversion for anonymous visitors); mobile is the task surface (speed, one CTA per stage). What must stay identical: vocabulary, status wording, Title-Case names, semantic colours, the GMP disclaimer.
- **Vocabulary** (customer-facing): Offer Price · Lot Size · Min Application · Issue Size · Lot Details · Reservation · Key Dates · Subscribed · Allotment Status · Listing Performance · Opening Soon. Statuses: Opens in Nd · Pre Apply · Open Today · Live · Closing Today · **Awaiting Allotment** · **Allotment Out** · Listed. SEO meta copy deliberately keeps "price band" — that's the search term.
- **IPO names** are ALL CAPS from registrars → always render through `titleCase()` (keeps HDFC/SBI/NTPC, fixes honorifics, handles 5Paisa).
- Web IPO list has **two layouts**: the card grid (**default**, operator decision) and `IpoCompareTable` (sortable, toggle on desktop); the choice persists in `localStorage`.
- **The site can be verified from this box** with the Browser pane (`preview_start` → `javascript_exec` to measure the live DOM). Cloudflare 403s server-side `curl` to the public host — hit `http://127.0.0.1` with `-H 'Host: newipoapi.finwave.co'` to test the API locally.
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
- **Sir's decision pending**: Buyback + OFS modules & new IPO fields (see the field-list doc from the 2026-08-20 session).
- **Historical data**: two Excel deliverables on the operator's Desktop — a blank template and a **pre-filled skeleton** (2,267 IPOs 2010→today, 2,177 financial rows, 242 buybacks 2020+; OFS + 2015-19 buybacks need manual entry). Importer is BUILT and deployed; **the import has never been run** — catalog is still 12 IPOs, 0 hidden.
- **Data entry unlocks UI that already exists**: a **Reservation table** fills the banner's "For 1×" column and the detail page's applications-for-1× block; a **GMP** value fills "Est. gain at GMP" and its disclaimer. Today only 6 of 12 IPOs carry a reservation table, 5 an issue size, and **1 a GMP**.
- **Untested**: registrar upload end-to-end (ALTREJ.DBF / MOLBIO XLSB + one archive→restore cycle), Excel catalog import end-to-end, partner-API end-to-end (needs a key), MANIPAL blank on a live IPO, WhatsApp channel URL not yet configured, reminders/bells, first news post, mobile device walk-through.
- **Before publishing the 2,267 historical rows**: `GET /ipos` needs `from`/`to` date params so `/ipos/archive` can page server-side — it filters client-side today, which is fine for a few hundred rows but not the full catalog.
- EAS Android build (needs Expo account + icon); native Hindi pass on the newer mobile screens.
- Human actions: counsel sign-offs (Terms/Disclaimer drafts, consent wording, the raw-PAN allotment store), NSE UAT creds, domestic BSE iBBS doc, native Hindi review.

## Read next
`docs/Investoyard - Project Status & Handoff.md`, `RUNNING.md`, and the memory files auto-loaded each session.
