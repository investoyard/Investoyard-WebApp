# Investoyard — Phase 1 Wireframe Screen Flow

**Prepared:** 21 June 2026
**Purpose:** Low-fidelity (wireframe-level) screen flow to brief design + confirm the Phase 1 screen inventory. Layout intent, not final visuals — the AMC-grade design system (Tech Stack doc, Part B) dresses these.
**Maps to:** *Phase 1 Product Spec* screens S1–S11.

> Wireframes are schematic. `[ ]` = button/CTA · `( )` = chip/tag · `▸` = tappable row · `····` = data/placeholder.

---

## 1. App shell & navigation

**Bottom tab bar (persistent, 4 tabs):**
```
┌───────────────────────────────────────────────┐
│                                                 │
│                 (screen content)                │
│                                                 │
├───────────────────────────────────────────────┤
│   🏠 IPOs    ★ Watchlist   📄 Applications  ☰ More │
└───────────────────────────────────────────────┘
```
- **IPOs** = S1 discovery (default/home)
- **Watchlist** = S10 (saved IPOs + alerts) — prompts T1 login if anonymous
- **Applications** = S9 (status/history) — prompts T1 login if anonymous
- **More** = S11 (profile, family, settings, privacy, help)

---

## 2. Flow map (with progressive-onboarding gates)

```
                         ┌──────────────────────────┐
              T0 (no login) │  S1 Home / IPO Dashboard │
                         └─────────┬────────────────┘
                                   │ tap IPO card
                                   ▼
                         ┌──────────────────────────┐
                         │     S2 IPO Detail         │──▸ S3 Allotment checker (public)
                         └───┬──────────────┬────────┘
                  tap [Save/★]│              │ tap [Apply]
                              ▼              ▼
                     ┌─────────────┐   ┌──────────────────────┐
              T1 gate│ S4 Sign-up   │   │ S4 Sign-up (if anon)  │
                     │ (mobile+OTP) │   └─────────┬────────────┘
                     └──────┬──────┘             │
                            │                     ▼
                            │           ┌──────────────────────┐
                            │     T2 gate│ S5 Investor Profile   │ (first apply only)
                            │           │ + data-sharing consent │
                            │           └─────────┬────────────┘
                            │                     ▼
                            │           ┌──────────────────────┐
                            │           │ S7 Bid Entry          │
                            │           └───┬──────────────┬────┘
                            │      [native] │              │ [PDF]
                            │               ▼              ▼
                            │     ┌──────────────┐  ┌──────────────┐
                            │     │ S8a UPI       │  │ S8b Prefilled │
                            │     │ mandate       │  │ PDF download  │
                            │     └──────┬───────┘  └──────┬───────┘
                            │            └──────┬──────────┘
                            ▼                   ▼
                     ┌──────────────┐   ┌──────────────────────┐
                     │ S10 Watchlist │   │ S9 Application Status │
                     └──────────────┘   └──────────────────────┘
   S6 Family Group reachable from S5/S7 (add member) and More.
   S11 Settings/Privacy from More.
```

---

## 3. Screen wireframes

### S1 — Home / IPO Dashboard *(T0, no login)*
```
┌───────────────────────────────────────────┐
│ Investoyard            🔔        🔍 search  │
├───────────────────────────────────────────┤
│ ( All ) ( Mainboard ) ( SME )              │  ← segmented filter
│                                            │
│ ── OPEN NOW ───────────────────  see all → │
│ ┌───────────────────────────────────────┐ │
│ │ [logo] Acme Ltd        (Mainboard)     │ │
│ │ ₹100–105 · Lot 142 · Min ₹14,910       │ │
│ │ Closes in 1d 4h   Sub 12.4×  GMP +18(•)│ │  (•)=unofficial tag
│ │                              [ Apply ]  │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ [logo] Beta SME        (SME)           │ │
│ │ ...                          [ Apply ]  │ │
│ └───────────────────────────────────────┘ │
│                                            │
│ ── UPCOMING ───────────────────  see all → │
│ ▸ Gamma Ltd   opens 24 Jun                 │
│ ▸ Delta Foods opens 26 Jun                 │
│                                            │
│ ── RECENTLY LISTED ────────────  see all → │
│ ▸ Zeta Tech   +14% on listing              │
├───────────────────────────────────────────┤
│ 🏠 IPOs   ★ Watchlist  📄 Apps   ☰ More     │
└───────────────────────────────────────────┘
```

### S2 — IPO Detail *(T0)*
```
┌───────────────────────────────────────────┐
│ ←  Acme Ltd                    ★ Save  ⤴   │
│ (Mainboard)  • OPEN • closes in 1d 4h      │
│ ₹100–105   Lot 142   Min ₹14,910           │
│                                            │
│ [ Overview ][Financials][Subscription][GMP]│  ← tab bar (scrollable)
│ [Documents]                                │
│ ───────────────────────────────────────── │
│  OVERVIEW                                  │
│  About: ····················               │
│  Issue size: ₹500 Cr                       │
│  Objects of issue: ··········              │
│  ┌ Key dates ─────────────────────────┐   │
│  │ Open 20 Jun · Close 22 Jun          │   │
│  │ Allotment 25 Jun · Listing 27 Jun   │   │
│  └─────────────────────────────────────┘   │
│  [ Lot / amount calculator ]               │
│                                            │
│  (SME issues also show:                    │
│   ✓ Meets new SEBI SME norms               │
│   EBITDA test ✓  OFS 18%  GCP 9%)          │
├───────────────────────────────────────────┤
│            [   Apply   ]   ← sticky CTA     │
└───────────────────────────────────────────┘
```
*GMP tab shows value + trend + prominent "Grey-market data is unofficial and not investment advice" banner.*
*Subscription tab shows QIB / NII / Retail / Total ×, updated time.*

### S3 — Allotment Status Checker *(T0)*
```
┌───────────────────────────────────────────┐
│ ←  Check Allotment                          │
│ Select IPO:  [ Acme Ltd            ▼ ]      │
│ Check by:    ( PAN ) ( Application no. )    │
│ [ ____________________________ ]            │
│ [        Check status        ]              │
│ ───────────────────────────────────────── │
│  Result: ▸ Allotted 142 shares             │
│          ▸ Amount blocked ₹14,910          │
│          (or "Not allotted — amount unblocked")│
│  [ View on registrar ↗ ]                    │
└───────────────────────────────────────────┘
```

### S4 — Light Sign-up *(T1 gate)*
```
┌───────────────────────────────────────────┐
│ ←  Sign in to continue                      │
│ Get alerts, save IPOs, and apply.           │
│                                            │
│ Mobile number                              │
│ [ +91 __________ ]                          │
│ [        Get OTP        ]                   │
│ ───────────────────────────────────────── │
│ Enter OTP                                  │
│ [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]   resend ⟳  │
│ [        Verify         ]                   │
│                                            │
│ ☐ Send me IPO updates & offers (optional)  │  ← marketing = separate, off
│ By continuing you agree to Terms & Privacy. │
└───────────────────────────────────────────┘
```

### S5 — Investor Profile *(T2 gate — first apply only)*
```
┌───────────────────────────────────────────┐
│ ←  Your investor details                    │
│ Needed only to apply. Used for this         │
│ application; shared with our partner        │
│ [Partner name] who places your bid.         │
│                                            │
│ Full name (as per PAN) [______________]    │
│ PAN                    [______________]    │
│ Date of birth          [ dd/mm/yyyy   ]    │
│ Depository       ( CDSL ) ( NSDL )         │
│ DP ID            [__________]              │
│ Client ID        [__________]              │
│ Bank account     [______________]          │
│ IFSC             [__________]              │
│ UPI ID           [____________@____]       │
│                                            │
│ ☐ I consent to share these details with    │  ← data-sharing consent (DPDP)
│   [Partner] to process my IPO application.  │
│ [        Save & continue        ]           │
│  ↳ link: + Apply for a family member        │ → S6
└───────────────────────────────────────────┘
```

### S6 — Family Group
```
┌───────────────────────────────────────────┐
│ ←  Family applicants                        │
│ Each member applies under their OWN PAN,    │
│ demat, bank & UPI.                          │
│                                            │
│ ▸ Self — Rahul Sharma            ✓ ready   │
│ ▸ Spouse — Priya Sharma          ✓ ready   │
│ ▸ Child — Aarav Sharma        ⚠ add UPI    │
│                                            │
│ [ + Add family member ]                     │ → S5 (per member)
└───────────────────────────────────────────┘
```

### S7 — Apply: Bid Entry *(T2)*
```
┌───────────────────────────────────────────┐
│ ←  Apply — Acme Ltd                         │
│ Applicant: [ Self — Rahul Sharma     ▼ ]    │  ← self / family picker
│                                            │
│ Category:  ( Retail )                       │
│ Price:     ( Cut-off ✓ ) ( ₹100–105 )       │
│ Lots:      [ – ] 1 [ + ]   = 142 shares     │
│ Amount blocked:           ₹14,910           │
│                                            │
│ Apply using:                               │
│  ( ● UPI / ASBA — native )                  │
│  ( ○ Prefilled bank form (PDF) )            │
│                                            │
│ [          Continue           ]             │
└───────────────────────────────────────────┘
```

### S8a — Native Apply: UPI Mandate Handoff
```
┌───────────────────────────────────────────┐
│ ←  Approve your payment block               │
│ Bid submitted ✓   App no. 1234567890        │
│                                            │
│ Open your UPI app and approve the mandate.  │
│ Before approving, check:                    │
│  ✓ "Verified Merchant" tag                  │
│  ✓ App no. 1234567890                       │
│  ✓ Amount ₹14,910 (blocked, not debited)    │
│  ✓ One UPI PIN approves block + allotment    │
│                                            │
│ ⚠ Bank, UPI, PAN & demat must be YOURS.     │
│ [ I've approved in my UPI app ]             │
│  status: ⏳ waiting for mandate…            │ → S9 on confirm
└───────────────────────────────────────────┘
```

### S8b — Prefilled-PDF Apply (fallback)
```
┌───────────────────────────────────────────┐
│ ←  Your prefilled ASBA form                 │
│ We've prefilled an ASBA form for Acme Ltd.  │
│ Submit it at your bank branch/net-banking.  │
│                                            │
│  📄 Acme_ASBA_RahulSharma.pdf               │
│ [ Download ]   [ Share ]                     │
│                                            │
│ How to submit: 1) ··· 2) ··· 3) ···         │
└───────────────────────────────────────────┘
```

### S9 — Application Status & History
```
┌───────────────────────────────────────────┐
│ Applications                  ( All ▼ )     │
│ ───────────────────────────────────────── │
│ ▸ Acme Ltd · Self                           │
│   ● Mandate accepted · ₹14,910 blocked      │
│   App no. 1234567890           25 Jun ›     │
│ ▸ Acme Ltd · Spouse                         │
│   ● Submitted · awaiting mandate            │
│ ▸ Beta SME · Self                           │
│   ✓ Allotted 1,600 · ₹··· debited           │
│ ▸ Zeta Tech · Self                          │
│   ✗ Not allotted · amount unblocked         │
├───────────────────────────────────────────┤
│ 🏠 IPOs   ★ Watchlist  📄 Apps   ☰ More     │
└───────────────────────────────────────────┘
```

### S10 — Watchlist & Alerts
```
┌───────────────────────────────────────────┐
│ Watchlist                                   │
│ ───────────────────────────────────────── │
│ ▸ Gamma Ltd   opens 24 Jun   🔔 on          │
│ ▸ Delta Foods opens 26 Jun   🔔 on          │
│ (empty state: "Save IPOs to get reminders") │
│                                            │
│ Alert me about:                            │
│  ☑ IPO opening   ☑ Closing soon            │
│  ☑ Allotment out ☑ Listing day             │
├───────────────────────────────────────────┤
│ 🏠 IPOs   ★ Watchlist  📄 Apps   ☰ More     │
└───────────────────────────────────────────┘
```

### S11 — More / Settings / Privacy
```
┌───────────────────────────────────────────┐
│ More                                        │
│ ▸ Investor profiles & family               │ → S5/S6
│ ▸ Notification preferences                  │
│ ── Privacy (DPDP) ───────────────────────  │
│ ▸ Manage consents (withdraw)               │
│ ▸ Download my data                          │
│ ▸ Delete my account                         │
│ ── Support ───────────────────────────────  │
│ ▸ Grievance officer & your rights          │
│ ▸ Help / FAQ                                │
│ ▸ Terms · Privacy Policy                    │
│ About Investoyard · v1.0                    │
├───────────────────────────────────────────┤
│ 🏠 IPOs   ★ Watchlist  📄 Apps   ☰ More     │
└───────────────────────────────────────────┘
```

---

## 4. Cross-screen states & notes

- **Loading:** skeleton loaders (not spinners) on S1/S2 for perceived speed.
- **Empty states:** friendly prompts (watchlist, applications, search no-results).
- **Errors:** rail/submission failures on S8a map to plain-language messages + offer the PDF fallback.
- **Anonymous gating:** Watchlist/Applications tabs and Save/Apply CTAs trigger S4 inline, then return to intent.
- **Disclaimers:** GMP everywhere it appears carries the "unofficial / not advice" tag.
- **Accessibility:** large tap targets, scalable type, screen-reader labels; i18n strings externalized from day one.
- **Web parity:** the same flows render responsively on Next.js web; S1/S2/S3 are also SEO-crawlable public pages.

---

## 5. Phase 1 screen inventory (handoff checklist)
S1 Home · S2 IPO Detail (+tabs) · S3 Allotment · S4 Sign-up · S5 Investor Profile · S6 Family · S7 Bid Entry · S8a UPI mandate · S8b PDF · S9 Applications · S10 Watchlist · S11 More/Privacy.
*Next design step: turn these into hi-fi mockups using the AMC-grade design tokens.*
