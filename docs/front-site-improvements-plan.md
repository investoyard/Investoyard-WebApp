# Front-site improvements — sir's 13 points (plan)

> Raised 2026-10-20. Investigated against the live code before planning; every
> claim below was checked, and where something is already built or already
> solved it says so rather than padding the list.

## What the investigation changed

Three of the thirteen are not what they look like, and two of them are bugs
nobody had reported as bugs.

| # | Point | Finding |
|---|---|---|
| 13 | PDF named `asba-form` | **Not a naming bug.** The API already names it `JPL_200600001.pdf` and the client already reads the server's name. **CORS hides the header**, so the client falls back. One line. |
| 4 | CDSL must not allow DP ID | **Already built**, web and mobile. Picking CDSL disables the box, drops it from validation and saves it empty. Only cosmetic work left. |
| 7 | IFSC not needed | **Already optional.** But it IS printed on the form, so removing it is not free — ships with Phase 3. |
| 5 | UPI handle shows nothing | **Real bug, and not the width.** See below. |
| 8 | Deleted client still logged in | **Real bug, three layers, security-relevant.** See below. |
| 1, 2, 12 | Sign up | **There is no signup in the product at all** — one piece of work, not three. |

---

## The two bugs

### #5 — the UPI handle is silently discarded

Not a width problem. `setUpi(name, handle)` stores
`name && handle ? name@handle : name`, and both halves of the control are then
re-derived from that one string. So if the user **picks the handle before
typing the name**, the handle is thrown away and the dropdown renders empty —
exactly what sir saw.

**Mobile is not affected** — it already keeps `upiName` and `upiHandle` as
separate state and only joins them on save. Web is the broken copy.

### #8 — a deleted client keeps working access for up to 30 days

Sir saw the symptom. The cause is three independent failures:

1. **The web app trusts `localStorage`** and never asks the server who it is.
2. **`JwtAuthGuard` verifies the signature and nothing else** — it never checks
   the user still exists. `JWT_EXPIRES_IN` defaults to **30d**.
3. **`User.status` (`active` / `suspended` / `deleted`) is never read on the OTP
   path** — only the operator password login checks it. So suspending a
   customer does nothing today.

Layers 2 and 3 mean **deleting or suspending a customer is not actually
enforced** — the admin action succeeds and the access continues. This is the one
item on the list that is a security fix rather than an improvement.

---

## The finding that merges #1, #2 and #12

`verifyOtp` ends in an **`upsert`** — signing in with an unknown mobile silently
creates the account. That is why there is only a Sign in button, and why
`User.name` is always null.

**Decided:** a separate Sign up; sign-in **refuses** an unknown mobile.

**Cross-surface risk, and why it is low:** the mobile app calls the same
`verifyOtp`, so refusing unknown mobiles breaks new-user signup there until
mobile ships a matching screen. There is **no released mobile build** (Expo Go
only; EAS build still needs an Expo account and icon), so nobody is on an old
client — API and both clients move together.

---

## Ordering

Two calls worth stating, because they are not sir's numbering:

- **Masters (#6, #9) come before the form UX pass (#3)** — masters change what
  the fields *are*. UX first means building the form twice.
- **#7 ships with #6** — hiding IFSC before the branch master exists would strip
  it from new profiles and drop the line off the printed form.

---

# Phase 1 — the bugs and the one-liner

*#13, #8, #5, #4. One API pool handshake + one web deploy. Nothing here waits on
anybody.*

**API** (needs the pool handshake)
1. `main.ts` — add `exposedHeaders: ['Content-Disposition']` to `enableCors`. **(#13)**
2. `jwt-auth.guard.ts` — after verifying the token, load the subject and require
   it exists and `status === 'active'`; 401 otherwise. **(#8)**
3. Cache that lookup in Redis (~60s, keyed on user id) so the common path costs
   nothing. Redis is already running. **A Redis outage must fall back to the
   database, never to "allow".**
4. `auth.service.verifyOtp` — refuse a non-active user instead of signing them
   in. **(#8)**
5. Boot test before handing the pool back — items 2 and 3 add dependencies to a
   guard that currently injects only `JwtService`, and a DI mistake there takes
   down **every** endpoint, not one.

**Web**
6. Validate the session once on load; clear it and drop the logged-in chrome on
   401. **(#8)**
7. `Account.tsx` — hold the UPI handle in its own state. **(#5)**
8. `globals.css` — widen `.upi-handle` from its fixed 158px, re-measured at the
   two-up breakpoint and on a phone. **(#5)**
9. `Account.tsx` + `DematPanel` — remove the DP ID box for CDSL rather than
   greying it, and let the demat number take the space. **(#4)**

**Mobile**
10. Same session validation on load. **(#8)**
11. CDSL field parity with web. **(#4)**

**Verification**
12. Confirm `Access-Control-Expose-Headers` on the live API, and that a real
    download lands as `SYMBOL_formNo.pdf`.
13. Confirm a deleted user's existing token now 401s, and that the UI signs out.

---

# Phase 2 — signup

*#1, #2, #12.*

**API**
1. `verifyOtp` stops upserting. Unknown mobile → a specific "no account" reply
   the clients can act on, not a generic error.
2. Accept an optional **name** on verify: present + unknown mobile → create;
   absent + unknown → refuse. One OTP pair, no duplicate endpoints.
3. Name validation (trimmed, minimum length, not digits-only).
4. Record a **consent row at signup** (the `Consent` model exists) — DPDP wants
   explicit, just-in-time consent, and signup is the moment.

**Web**
5. `/signup` page and form.
6. **The "keep handy" panel (#2)** above the form —
   PAN · demat (CDSL 16-digit, or NSDL DP ID + Client ID) · bank account · UPI ID.
7. Below it, the note that **bank name, branch, address and email are needed
   additionally to download a prefilled form** — phrased as what it unlocks, so
   it reads as a reason rather than more typing. **Wording needs sir's sign-off.**
8. **Sign up** link in the header beside Sign in. **(#1)**
9. Sign-in's "no account" path hands off to signup with the mobile carried over,
   so nobody retypes it.
10. i18n keys for the new screen (en + hi, matching the existing dictionaries).

**Mobile**
11. Matching signup screen, same release.

**Admin**
12. The client list can now show a real name — check nothing assumed it was
    always empty.

---

# Phase 3 — masters, and IFSC

*#6, #9, #7. **Blocked until the operator supplies the source files.***

**Schema**
1. `BankMaster` (name, unique) — ~170 rows, so the bank dropdown stays cheap.
2. `BankBranch` (bankId, **ifsc unique**, branch, city, state) — ~1.7 lakh rows.
3. `PincodeMaster` (pincode, district/city, state) — ~19.3k rows. One pincode can
   carry several post-office names; we need one row per pincode, so the import
   decides how to collapse them.
4. Both are **global reference data, not tenant-scoped** — confirm against how
   the masters module scopes today before writing the migration.

**Import**
5. `scripts/import-ifsc.js` — dry-run by default, idempotent, re-runnable (house
   convention for every data script here).
6. `scripts/import-pincodes.js` — same shape.

**API**
7. `GET` banks list.
8. `GET` branch search, **indexed and paginated** — scoped to a chosen bank plus
   a query.
9. `GET` pincode lookup → city + state.

**Web**
10. **`AsyncSearchSelect`** — a server-searched, debounced sibling of the
    existing `SearchSelect`, which loads every option into memory and cannot
    carry 1.7 lakh rows. **This is the real cost of the phase**, and it is
    reusable afterwards.
11. `Account.tsx` — bank → branch pickers; **IFSC stored silently and the field
    hidden (#7)**, so the printed form keeps the value nobody types.
12. Pincode → city and state auto-fill, both still editable if the master
    disagrees with the applicant. **(#9)**

**Mobile**
13. Same three controls.

**Admin**
14. Browse/correct screens for both masters — paginated search, never a full
    list.
15. Permissions for them, following the existing granular `masters.*` pattern.

**Data safety**
16. Existing profiles hold free-text bank name, branch and IFSC. Leave them
    intact; a new pick overwrites, an untouched profile keeps what it has.

---

# Phase 4 — the applicant form

*#3. After Phase 3, so it is done once.*

1. Help text under **every** field — what it is, where to find it, what good
   looks like.
2. Grouping and progressive disclosure for the optional bank/contact block.
3. Error wording pass — say what to fix, not what is invalid.
4. Mobile parity (the two forms are kept in step by hand; there is no shared
   component).
5. **Review the field-by-field wording with sir before building** — this phase is
   mostly copy, and copy is cheaper to agree than to rework.

---

# Phase 5 — alternate login

*#10, #11. The external dependency should start now.*

Decided: **WhatsApp OTP** and **password (set after a first OTP login)**, with
**the client choosing their method in their own profile**, so existing clients
opt in rather than being migrated.

**External — start immediately**
1. **Meta authentication-template application for WhatsApp OTP.** A business
   application with a lead time; it will otherwise be what holds the phase up.

**API**
2. Tenant-level switch for WhatsApp login in admin → Integrations, following the
   existing provider-config pattern. A user can only pick a channel the tenant
   has enabled. **(#11)**
3. `User` gains an OTP-channel preference (sms / whatsapp).
4. Channel-aware OTP send — today `verifyOtp` calls `sendSms('otp', …)`
   unconditionally.
5. Consumer **set password** (requires a live OTP session to set).
6. Consumer **password login** — mobile + password. Separate from the operator
   path, which is username-based; `passwordHash` and scrypt `verifyPassword`
   already exist and are reused.
7. **Password reset** via OTP — the mobile is already verified, so this is the
   natural route.
8. Rate limiting and lockout on password attempts. Not optional once a password
   door exists.

**Web**
9. Profile → **Security** panel: choose OTP channel, set/change password. This is
   also how **existing clients** opt in.
10. Login screen gains the method choice.

**Mobile**
11. Same two screens.

---

## Phase 5 — SHIPPED 2026-10-20 (items 2–11; item 1 is the operator’s)

Everything except the Meta application is built, typechecked and proved. What
changed against the plan above, and why:

- **Item 7, password reset, was NOT built as its own flow — deliberately.**
  Setting a password already requires a live session, which can only have come
  from an OTP. So the reset *is* the existing door: sign in with a code, set a
  new password. A separate reset flow would be a second recovery path to
  attack, and reset tokens to expire, leak and get wrong — for no capability
  the customer does not already have.
- **Item 2 is a TEMPLATE NAME, not a checkbox.** `otpTemplateName` on the
  WhatsApp provider is the switch, because the thing that actually determines
  whether a WhatsApp code can be delivered is whether Meta approved a template.
  A separate enable flag could be on while every send was rejected.
- **Item 2 says "tenant-level" and what shipped is PLATFORM-LEVEL.** Worth
  saying plainly: `ProviderConfigService.effective()` does take a tenantId, but
  `WhatsappService` has never passed one — the whole WhatsApp integration is
  platform-global in this codebase — so `otpTemplate()` follows it rather than
  introducing a second, inconsistent scoping rule for one setting. **Consequence:
  a white-label partner cannot have its own OTP template; enabling WhatsApp
  codes enables them for every brand.** Making it per-tenant means threading a
  tenantId through the whole WhatsApp service, not changing this one call.
- **Item 8 is keyed on the MOBILE, not the IP** — 5 failures, 15 minutes. The
  thing being protected is one account, and an attacker changes IP far more
  easily than target. The lockout message points at the OTP door, which is
  unaffected.

### Still the operator’s to do

1. **Apply to Meta for the AUTHENTICATION template** (the original item 1).
   Until it is approved and its name is entered at admin → Integrations →
   WhatsApp, the WhatsApp option is greyed out everywhere and codes go by SMS.
   Nothing else is blocked on it.
2. Nothing for the password half — it works as soon as the pool restarts.


---

## Open actions for the operator

1. **Supply or confirm the source files** for the IFSC and pincode masters —
   Phase 3 cannot start without them, and I will not pull a dataset off the
   internet without your say-so.
2. **Start the Meta WhatsApp authentication-template application** (Phase 5).
3. **Confirm #4** — what is live already disables DP ID for CDSL. If sir saw
   something different, say which screen; it may be a different one.
4. **Confirm no bank requires IFSC on the printed form** before Phase 3 hides the
   field (it will still be stored and printed, via the branch).
5. **Decide soft vs hard delete** for clients. Admin "delete client" is a hard
   delete today, yet the schema carries a `deleted` status that nothing sets — if
   a soft delete was the intent, it is a small change on the Phase 1 visit.
6. **Sign off the signup copy** (Phase 2, items 6–7) and the **field help text**
   (Phase 4, item 5).
