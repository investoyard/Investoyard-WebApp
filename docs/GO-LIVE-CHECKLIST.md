# Investoyard — Go-Live Checklist (Rails: NSE + BSE)

> Tracks everything left to take native IPO bidding + live subscription to production.
> **Software is built** (NSE end-to-end; BSE built & gated). What remains is mostly
> **not code** — credentials, data entry, and production hardening.
>
> _Created 2026-07-23. Update the checkboxes + "Last touched" as items move._

**Legend:** `[ ]` pending · `[~]` in progress / gated · `[x]` done
**Owner:** 🧑 you (operator) · 🏦 exchange/partner · 🤖 Claude (code) · ⚖️ counsel

---

## 🔴 P0 — Blockers to a live UAT test
_Nothing bids or fetches real subscription until these exist._

- [ ] 🏦🧑 **NSE member credential (UAT)** obtained from the merchant-banker empanelment
  - [ ] 🧑 Entered in **Admin → Exchange Rails** (base URL auto-fills; add login/member code/password/sub-broker)
  - [ ] 🧑 **Test connection** button → shows `connected`
  - [ ] 🧑 Credential set **Active**
- [ ] 🧑 **Add real IPOs** to the catalog (currently empty) and set status **Open**
- [ ] 🧑 **Fill each IPO's Partner + Online-Series config** (decides NSE-vs-BSE routing — bidding can't pick an exchange without it)
- [ ] 🏦🧑 **BSE package** obtained: UAT creds + iBBS ID + **AES checksum key + reference sample**
  - [ ] 🧑 Entered in Admin → Exchange Rails (BSE fields appear when exchange = BSE)
  - [ ] 🤖 **Validate `bseChecksum()`** against BSE's sample, add a unit test, flip the adapters' `confirmed = true`
  - [ ] 🧑 Credential set **Active** (BSE bidding + BSE subscription then flow automatically)

---

## 🟡 P1 — Waiting on you (info / config)

- [ ] 🧑 **App-wise subscription logic** — give the exact formula:
  - denominator per category (offered ÷ lot, fixed max-applications, other?)
  - retail-only or per-category?
  - odds format (1-in-N / % / band?)
  - _→ 🤖 I wire it into the combined NSE+BSE numbers + Portfolio display_
- [ ] 🧑 **Provider keys** configured (Admin → Integrations): SMS OTP · Push (FCM) · WhatsApp/Meta · Claude
- [ ] 🧑 **Enable callback auth**: set `RAIL_CALLBACK_AUTH=enabled` in prod
  - [ ] 🧑🏦 **Register the callback URL** with NSE: `https://newipoapi.finwave.co/api/v1/` (and later BSE)

---

## 🟢 P2 — Production hardening (before real money moves)

- [x] 🤖 **PII vault master key → separate key file** (strong random `.pii-vault.key`, gitignored, old env key kept as decrypt fallback) — _no AWS/account needed_
  - [ ] 🧑 After first prod boot: **back up `apps/api/.pii-vault.key`** out-of-band + ACL it to the app-pool user (`icacls … /inheritance:r /grant:r "IIS AppPool\<pool>:R"`)
  - [ ] 🤖 (before real applicants) **wrap the key file with Windows DPAPI** — free, no account, makes a stolen copy useless off-box (replaces the AWS-KMS idea)
- [ ] 🤖🧑 **Real SMS OTP delivery** (dev code `123456` works now; needs a live SMS provider)
- [ ] 🤖🧑 **Real push send** (FCM/APNs — device tokens register but nothing sends yet)
- [ ] 🤖 **Prefilled-ASBA PDF engine** (ASBA/PDF apply returns a placeholder PDF URL; needs the FINWAVE PDF generator)

---

## 🟢 P2 — Buildable now (code, no credential needed)
_Can be done while chasing credentials._

- [ ] 🤖 **NSE `/notification` callback handler** — types 1/2/3 (category bidding open/close); currently a stub
- [ ] 🤖 **BSE DP/UPI callback** route (Message API callback) + **BSE reads** (openissue / orderdownload / status) — un-gate with checksum
- [ ] 🤖 **Web multilingual SEO** — move `?lang=` to per-locale `/[lang]/` routes

---

## ⚪ P3 — Business / legal / human gates

- [ ] ⚖️ **Counsel sign-offs** — corporate structure · partner-commission regime · DPDP consent flow
- [ ] 🧑🏦 **Merchant-banker BD** — confirm launch rail (which empanelment) + secure its UAT creds _(overlaps P0)_
- [ ] 🧑 **Native Hindi review** (current Hindi is machine-quality)
- [ ] 🧑 **Branding** — white logo variant + trademark

---

## ✅ Already built & deployed (reference)

- [x] 🤖 Consumer web + mobile wired to the live API/DB (login → profiles → apply → portfolio → watchlist)
- [x] 🤖 **NSE bidding pipeline** — adapter (v1.20.6, bugs fixed) → orchestrator → BullMQ worker (queued, idempotent, rate-limited)
- [x] 🤖 **Exchange selection** — routes each IPO's bids to NSE/BSE from its Partner/Online-Series config
- [x] 🤖 **BSE bidding adapter** — real domestic iBBS v1.05.5 shapes (login, `/ipoorder`, `/ipoorderbulk`, headers, checksum) — **gated** pending sample
- [x] 🤖 **Subscription poller** — market-gated (10–17 IST, trading days, holiday-aware), adaptive 20s→10s, per-IPO toggle + refresh
- [x] 🤖 **Dual-exchange subscription** — combines NSE + BSE demand per category → `ipoSubscription` → IPO pages + Portfolio (NSE-only until BSE cred active)
- [x] 🤖 **Retail allotment odds** on Portfolio (placeholder formula until your logic lands)
- [x] 🤖 Rail callbacks (NSE DP/UPI status) wired; auth guard behind `RAIL_CALLBACK_AUTH`
- [x] 🤖 Redis fallback hardened; prod stack (portable Postgres + Redis + IIS/iisnode) running

---

### The one-liner
Between here and a live UAT test stand **three non-code things**: an **active NSE credential**, **IPOs entered with their routing config**, and the **BSE credential package**. Everything else is production hardening + legal.
