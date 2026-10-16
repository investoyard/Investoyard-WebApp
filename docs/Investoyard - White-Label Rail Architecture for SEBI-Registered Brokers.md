# Investoyard — White-Label Rail Architecture for SEBI-Registered Brokers

**Status:** design, not built. Written 15 October 2026 in answer to the operator's question:
*"They may use their own IBBS / e-IPO login, or they may allow us to bid on our partnered
broker. We shall get Back Office APIs, SMS APIs, Email APIs, Back Office & Front Office SSO,
redirected to our server. We shall provide two facilities: 1. Bidding through UPI,
2. Prefilled PDF generation. How should our product be designed?"*

Companion to `Investoyard - Regulatory Brief - Serving SEBI-Registered Brokers.md`, which
carries the regulatory analysis (§0 on whose membership carries the bid, and A5 on
NSE/INSP/71037, the prior-instructions circular). This document is the architecture.

Every claim marked **[MEASURED]** was read out of the running code on 15 Oct 2026, with the
file and line. Everything else is **[JUDGMENT]** or **[FOR COUNSEL]** and labelled.

---

## 1. The one axis: whose membership carries the bid

The two scenarios the operator describes are not a feature flag. They are **two different
regulated entities placing the bid**, and that single fact decides:

| | Broker's own membership | Our partner's membership |
|---|---|---|
| Designated intermediary | **The broker** | **Our partner TM** |
| TM code on the bid | Theirs | Our partner's |
| Sponsor bank raising the mandate | Theirs | Our partner's |
| 3-year electronic record (circular ¶4) | **Theirs** — our DB is *their* record | Ours |
| Who faces the inspection | **The broker** | Our partner |
| Client's grievance route | Broker's SCORES entity | Partner TM's |
| The broker's own role | Principal | **Distributor / referrer** |
| What the client is told on screen | The broker operates this | The broker *and* the TM behind it |

So it belongs in **data**, read by one resolver per consequence — never as `if (mode === …)`
scattered through the services. One column:

```
Tenant.railMode:  print_only | own_member | partner_member
                  ^ DEFAULT, and the default must never be a rail
```

**`print_only` is a first-class mode, not a degraded one.** It is the mode with the smallest
regulatory surface — it produces a *form*, not a bid; the signed form is the client's prior
instruction; the six-month physical retention is the broker's, on paper they hold. It is also
the only facility that works today. It should be the default for a new partner and the
fallback for any issue where the rail is not ready.

---

## 2. The finding that has to be fixed first

**[MEASURED — `apps/api/src/modules/rail/rail.service.ts:86`]**
`RailService.resolveBidCredentialId(ipo)` takes an IPO and **no tenant**. All three of its
branches are tenant-blind, and the last one is:

```ts
const any = await this.prisma.memberCredential.findFirstOrThrow({ where: { active: true } });
return any.id;   // "so a mis-configured IPO still submits somewhere"
```

That comment is **correct for one membership and unacceptable for two.** The moment a
broker's own IBBS credential is a row in `MemberCredential`, a mis-configured IPO can place a
client's bid under **a TM code that never agreed to carry it** — handing that trading member
the regulatory ownership of a client they do not have.

**[MEASURED — `admin.service.ts:323`]** `createRail` hardcodes `tenantId: 't-platform'`. The
column that would prevent this exists on the model, is populated with a constant, and is read
by nothing.

**[MEASURED — `admin.service.ts:311`]** `listRails()` is unscoped. A tenant admin holding
`rails.manage` would read every member's `memberCode`, `loginId` and `baseUrl`. A broker's TM
code and e-IPO login id are not for another broker to see. Latent today only because no
partner holds that permission.

### The rule, and this codebase already applies it elsewhere

> **An unresolvable membership refuses. It never falls back.**

`bid-operations.service.ts` already throws *"the chosen demat account could not be resolved"*
rather than falling back to the profile's default, because silently falling back would send
the exchange a bid crediting a demat the investor did not choose. **Falling back to a
membership is strictly worse** — it sends the wrong broker's regulatory identity.

---

## 3. The default direction is backwards everywhere, and that is the whole design

This codebase's standing pattern is **fall back to the platform's resource**:

- member credential → any active one (**ours**) — `rail.service.ts:100`
- `providers.effective()` → walks tenant → parent → **platform** — `provider-config.service.ts:246`
- identity / `OWN_HOSTS` → first paint is always the **default tenant** — `TenantProvider`

For an *information* product that is the right default: a partner with no GMP config gets
ours and nothing is misstated. For a *regulated bidding* product the same default **is** the
fault — it silently substitutes our membership, our sender ID, our entity.

White-label bidding needs the inverted default, and the places needing inversion are a short,
enumerable list:

1. the exchange member credential,
2. the sponsor bank the mandate is raised on,
3. client-facing transactional messaging (OTP, bid confirmations),
4. the apply gate itself.

Everything else may keep falling back, and should.

---

## 4. What is already built (and therefore is not work)

**Per-tenant messaging is complete end to end. [MEASURED]**

- `ProviderConfigService.effective(provider, tenantId)` walks tenant → parent → platform and
  gates per-tenant keys on `flags.whitelabel` (`provider-config.service.ts:209`, `:195`).
- `SmsService.send` / `EmailService.send` both accept `opts.tenantId` and pass it through
  (`sms.service.ts:63`, `email.service.ts:56`).
- The OTP path **already** passes it: `sendSms('otp', mobile, { tenantId: tenantContext.tenantId() … })`
  (`auth.service.ts:86`).
- `MessageTemplate` is `@@unique([tenantId, channel, key, locale])` and carries its own
  `dltTemplateId` **and** `senderId` per row (`schema.prisma:561`).

So **"SMS API and Email API from the broker" is configuration, not a build** — one
`ProviderConfig` row and one `MessageTemplate` row per tenant. Two caveats:

- **DLT template registration is per sender entity.** A message sent through the broker's
  gateway must carry *their* registered template id, or the telecom operator rejects it. The
  schema already holds it per tenant; it has to actually be filled per tenant.
- **Remove the platform fallback for client-facing transactional sends.** An OTP arriving
  from an unknown sender ID inside the broker's own app is a phishing signal. Operational
  alerts to the broker's *staff* may still fall back; a client's OTP may not.
- **[MEASURED] WhatsApp is the one messaging gap** — `whatsapp.service.ts` calls
  `effective('whatsapp')` with no tenant, so it is platform-only.

**Also already built:** `customDomain` + host resolution + CORS from the DB · branding ·
published identity and contact with blocking gap enforcement · per-tenant published legal
pages · partner API keys with per-tenant scopes · `Application.memberCredentialId` (so "which
membership carried this bid" is already an audit dimension, already grouped on by
`bidding-report` and `bidding-summary`) · the whole prefilled-PDF channel.

---

## 5. The bid channel has no server-side gate at all

**[MEASURED]** `ApplicationsService.create()` (`applications.service.ts:150–235`) has **no
`startBid` check and no bidding-window check.** The only `startBid` reads in the entire API
are in `ipo.service.ts`, where the admin toggle writes and reads itself. The operator gate is
client-side only.

**The print channel *is* gated** — `partner.service.ts:75` refuses when
`ipo.extra.startPrint !== true`. So the two facilities have asymmetric enforcement, and **the
ungated one is the one that reaches the exchange.**

For white-label this compounds: with no per-tenant switch either, a partner onboarded for
print only can call the bid endpoint for an IPO opened for somebody else, and §2's fallback
will find it a membership.

**Phase 0 is therefore one change** — gate `create()` on `railMode !== 'print_only'` **and**
`startBid` **and** the bidding window. It closes a documented product gap, the asymmetry
between the two channels, and the white-label hole, in one place.

---

## 6. The duplicate-check scope is a function of the mode

**[MEASURED]** The self-PAN rule is `findFirst({ ipoId, profile: { panHash }, … })` with no
tenant clause — RLS scopes it per tenant.

- **`own_member`: correct as-is.** Broker A and broker B have different TM codes. The exchange
  dedupes on PAN across the whole market anyway, so a client who bids through both gets one
  rejected *at the exchange*, and that is not ours to prevent.
- **`partner_member`: wrong.** Several brokers ride **one** membership, so two bids on the same
  PAN from two of our tenants arrive at the exchange **under the same TM code** — which reads
  as that trading member having uploaded a duplicate bid for a client.

So the scope of the check is decided by the rail mode: per-tenant in `own_member`, **across
every tenant sharing the member** in `partner_member`. The cross-tenant read needs the
explicit-GUC pattern (`$transaction([set_config(…), findFirst])`), not bare `runUnscoped` —
see `partner.service.ts printDetail`, and the `runUnscoped` note in CLAUDE.md.

Non-obvious, and far cheaper to build now than to discover from an exchange rejection.

---

## 7. SSO: two doors, and the client door is the regulated one

**[MEASURED] There is no federated auth of any kind today** — no SAML, OIDC, JWKS or `sso`
anywhere in `apps/api/src` or `packages`. `apps/api/src/modules/auth/` is OTP and password
only. Both doors below are new.

### Front-office SSO — authenticates the END CLIENT

This is the one that satisfies the prior-instructions circular. Point 5 of NSE/INSP/71037
explicitly names the online platform with the client's own secure login, and **the client's
own authenticated submission *is* the prior instruction.**

Requirements: a signed assertion on a **per-tenant key**; short-lived; **single-use** (a
replayable assertion is a second bid); naming the client by PAN, or by the broker's client
code which we resolve to a PAN through the back-office API; and carrying the
**authentication instant**, which goes onto the instruction record.

And one thing that is a contract clause rather than code: **we cannot distinguish the client's
own session from a dealer impersonating one.** A dealer who logs into the broker's system and
SSOs in "as" a client produces an assertion identical to the real thing — and that is the
exact breach the circular describes, wearing better clothes. The broker must warrant
contractually that the assertion represents the client's own authenticated session.
**[FOR COUNSEL]** — this is the single most important clause in the agreement.

### Back-office SSO — authenticates BROKER STAFF

Into admin, mapped onto the existing role/permission model. Separate endpoint, separate key
set, separate session kind.

### The failure to design against

**One SSO endpoint that mints whichever session the assertion asks for.** Two endpoints, two
key sets, and the client endpoint must be *structurally incapable* of minting a staff
session — not merely discouraged from it.

### How the client was authenticated is part of the evidence

A session minted from broker SSO and a session minted from our own OTP are **different
evidence**, and they must stay distinguishable on the instruction record permanently. Record
the channel at mint time and carry it forward; it cannot be reconstructed later.

---

## 8. Back-office prefill: a draft is not an application

Fetch client details by PAN or trading code → prefill the form. Three hard rules.

1. **On demand, never a batch.** A nightly sync of the broker's whole client book means we
   hold PII for people who never came to us — DPDP minimisation — and it is precisely the
   posture the inspection finding punishes: having everyone's details to hand is what makes
   keying in a bid for someone easy.
2. **It must never produce a bid.** *Fetching a client's DETAILS is not obtaining their
   INSTRUCTION.* Express it in the schema, not in code review: **the prefill path returns a
   draft that has no `Application` row.** (Note `create()` already writes `status: 'draft'` —
   so "draft" today is already an application row. The prefill draft must sit *before* that
   boundary.) An `Application` comes into existence only on an authenticated client act.
3. **Session-scoped cache only.** Nothing fetched is persisted beyond the application that is
   actually created.

---

## 9. The instruction record, and the snapshot the rail path does not have

**[MEASURED]** The rail path resolves PII **just-in-time** from the profile at submit time
(`buildBidSubmission`) — deliberately, so a retry sends what the profile says *now*. That is
right for the **submission** and wrong for the **evidence**: the instruction record has to say
what the client confirmed *at that moment*, not what the profile says today.

The print path already solved this: `Application.partnerPayload`, immutable, and the PDF is
filled from it rather than from the shared profile.

**So there are two objects, not one.** The submission resolves JIT. A **`BidInstruction`**
snapshots, one per bid, **never reused** — unlike the DPDP consent, where
`captureDataSharingConsent` deliberately returns an existing row, so the consent attached to a
bid can predate it by months. It carries:

- channel (`own_otp` / `broker_sso` / other), **IP and user-agent** — none of which exist on
  `Application` or `Consent` today
- the **declaration text the client saw, versioned**
- the confirmed bid terms (symbol, category, lots, price or cut-off, amount, demat)
- **our own acknowledgement reference**, shown to the client at the moment of receipt — the
  exchange's `applicationNumber` arrives later and is **null on every row today**

Plus an **inspection export**, per client per issue. The trading member faces the inspection,
not us; if our record is to *be* their compliance evidence, they must be able to produce it.

---

## 10. The apply flow cannot be a static-export page resolved client-side

CLAUDE.md: the static export is single-tenant in its HTML, and host-dependent behaviour must
be client-side. For the footer the accepted answer is `useTenantResolved()` — wait for the
host before painting, because *"a brand colour flashing is cosmetic; a legal operator flashing
is the exact misstatement the store exists to prevent."*

The apply flow is a far worse place for that flash. Before the client sees anything, the page
must know **which entity they are contracting with, which TM will carry the bid, whose
sponsor bank raises the mandate, and which declaration text to show** — all of which differ by
`railMode`.

So the apply route either renders nothing until the tenant resolves (the existing gate
pattern, at the cost of a visible load) or moves off static export. **Operator decision** —
it is the one item here with a user-visible cost.

---

## 11. Build order

**Phase 0 — before any broker is onboarded.** Cheapest now, and it is the only phase that is
urgent on its own: `Tenant.railMode` defaulting to `print_only`; the server-side bid gate in
`create()` (§5).

**Phase 1 — the binding.** `TenantRailBinding`: tenant → member credential, sponsor bank set,
TM code. `resolveBidCredentialId(tenantId, ipo)` that **refuses** instead of falling back.
`createRail` stops hardcoding `t-platform`. `listRails` becomes tenant-scoped. Duplicate-check
scope keyed on the mode (§6).

**Phase 2 — the evidence.** `BidInstruction`, the acknowledgement, the inspection export, and
a written retention policy.

**Phase 3 — the integrations.** Front-office client SSO; back-office staff SSO; the
back-office prefill client, draft-only.

**Phase 4 — messaging.** Per-tenant configuration; drop the platform fallback for
client-facing transactional sends; WhatsApp per-tenant.

Phases 0 and 1 are worth doing even if the rail never ships, because they are what stop a
bid being placed under the wrong membership — and that is a live risk the moment a second
`MemberCredential` row exists.

---

## 12. What must be decided by a human, not designed

1. **[FOR COUNSEL] In `own_member`, is the broker outsourcing bid upload to us?** SEBI
   CIR/MIRSD/24/2011 bars outsourcing of core business activities and compliance functions.
   This governs whether mode A is sellable in that shape at all, or whether the correct framing
   is that we are a front-end vendor and the broker's own system submits — which is a
   materially different product.
2. **[FOR COUNSEL] In `partner_member`, the broker is distributing**, which engages the
   authorised-person / referral regime the commission module is already deferred for.
3. **[FOR COUNSEL] DPDP erasure versus the circular's 3-year retention floor.** The operator
   hard-delete path removes a client's applications, status events and consents in one
   transaction; that is a DPDP erasure route and it destroys exactly the record the circular
   requires kept. Carried from the regulatory brief, §A5.
4. **[FOR COUNSEL] The dealer-impersonation warranty** on front-office SSO (§7).
5. **Operator:** the apply-flow render strategy (§10).
6. **Operator:** whether a tenant may hold **both** modes — e.g. print on their own paper and
   bid on our partner's membership. The design allows it (the two facilities are independent),
   but it means the client sees two different accountable entities depending on which button
   they press, and that has to be said on the page rather than discovered.
