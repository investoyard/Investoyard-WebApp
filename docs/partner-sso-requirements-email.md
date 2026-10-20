# Partner SSO + client-fetch — requirements email

Send to the partner broker's **technology / IT team**, copying whoever owns the
commercial relationship.

**Fill in before sending** — everything in `[...]`. Nothing below invents a
name, a designation, an address, a phone number, a hostname or a regulatory
citation.

**Leave `[your-base-url]` as it is.** It must not be replaced on our side with
a plausible-looking hostname — one of those gets pasted into code and
half-works. The partner fills it in.

The body below is plain text on purpose, so it pastes into a mail client
without losing its shape.

---

## Subject

IPO integration — SSO and client-lookup API requirements

---

## Body — copy from here

Dear [Name / Sir],

Thank you for confirming the IPO integration. We will serve your clients under
your own brand, on your own domain. Your clients will arrive already signed in
from your app — they will not create a separate login with us, and they will
not re-enter details you already hold.

Two interfaces are needed from your side. This note sets out exactly what each
one requires. Please have your technology team answer inline. Where something
is not available, please say so rather than leaving it blank — several of the
items below change the design.

----------------------------------------------------------------------
1. SINGLE SIGN-ON — BRINGING THE CLIENT TO US
----------------------------------------------------------------------

When your client taps "Apply for IPO" in your app, your backend issues a
signed assertion and redirects the client's browser to us. The assertion
authenticates the client. It carries no bid — your client chooses the IPO,
the category and the amount on our screen.

1.1  FORMAT — signed JWT (preferred) or SAML 2.0?

1.2  SIGNING — we require asymmetric signing (RS256 or ES256). You hold the
     private key; we hold only your public key, or the URL of your JWKS
     endpoint.

     We are deliberately not asking for a shared secret. With a shared secret
     we would be technically capable of producing an assertion ourselves, and
     your client's application record needs to be evidence that only you
     could have created it.

1.3  CLAIMS — we need, at minimum:

       - issuer                  identifies you
       - audience                identifies us
       - client / trading code   the client, as per section 2
       - authentication instant  WHEN THE CLIENT AUTHENTICATED WITH YOU,
                                 not when the token was minted
       - unique token id         so we can enforce single use
       - expiry                  we recommend 60 to 120 seconds

1.4  SINGLE USE — we will reject a repeated token id. A replayable assertion
     is a second IPO application, so this one is not negotiable.

1.5  TRANSPORT — browser redirect with the assertion as a query parameter, or
     an HTML form POST? POST is preferable: it keeps the assertion out of
     browser history and server logs.

1.6  RETURN — where should we send the client after they finish, and where if
     the assertion fails validation?

----------------------------------------------------------------------
2. CLIENT LOOKUP API — FETCHING THE DETAILS
----------------------------------------------------------------------

Once the client is identified we call your API for their particulars, so they
do not retype anything.

2.1  THE KEY. You have told us the client code / trading code is unique in
     your system, and that is what we will use to look a client up. Please
     confirm the exact field name you will send, and whether "client code"
     and "trading code" are always the same value.

2.2  PAN IS MANDATORY IN YOUR RESPONSE. This is a hard requirement rather
     than a preference, for two reasons: the exchange bid cannot be
     constructed without the applicant's PAN, and SEBI permits only one
     application per PAN per issue in the public category — a limit we are
     obliged to enforce, and which can only be enforced on PAN.

     If your API cannot return PAN, the bidding flow is not possible and we
     would be limited to pre-filled form printing.

2.3  FIELDS. Please confirm which of these your API returns, and mark any
     that may be absent for some clients:

       PAN                          mandatory — see 2.2
       Full name (as per demat)     the application and the exchange bid
       Date of birth                the application form
       Depository (NSDL / CDSL)     the exchange bid
       DP ID                        the exchange bid — NSDL only;
                                    a CDSL account has no DP ID
       Demat / beneficiary ID       the exchange bid
       Bank account number          ASBA details
       IFSC                         ASBA details
       Bank name / branch           printed on the form
       UPI ID                       the payment mandate — see 2.6
       Email, mobile                confirmations and the form
       Address, city, state, PIN    the application form

2.4  Anything your API does not return, the client enters on our screen.
     Anything it does return, we show READ-ONLY — your record is the source
     of truth and we will not let it be edited in our flow.

2.5  MULTIPLE DEMAT ACCOUNTS. You have noted that one PAN may hold two demat
     accounts. Please tell us how that appears at your end: two separate
     client codes, or one client code returning a list of demat accounts?

     We support either. The client will see all demat accounts belonging to
     their PAN and choose which one an allotment should credit. They still
     get one application per issue, as SEBI requires.

2.6  UPI REMAINS EDITABLE, DELIBERATELY. Even where your API returns a UPI
     ID, the client may change it on our screen. The payment mandate has to
     arrive in an app the client actually controls, and a mandate sent to a
     stale UPI ID simply fails.

     If you would prefer the UPI ID to be read-only from your record, tell us
     and we will follow your policy.

2.7  AUTHENTICATION on the API — mutual TLS, API key, or OAuth client
     credentials? Please also send the exact request and response shape, with
     one sample request and response using TEST DATA, not a real client.

2.8  BEHAVIOUR FOR A CLIENT WHO CANNOT TRANSACT — closed, suspended, dormant,
     or KYC-incomplete. Please return a distinguishable error rather than an
     empty record, so we can show the client something accurate instead of a
     blank form.

----------------------------------------------------------------------
3. ENVIRONMENTS AND ACCESS
----------------------------------------------------------------------

3.1  UAT and production base URLs — [your-base-url] for each.
3.2  Any IP allow-listing you require. We will send ours on request.
3.3  Rate limits, timeouts, and your maintenance window.
3.4  A technical contact for the integration — name and email.

----------------------------------------------------------------------
4. KEY EXCHANGE AND ROTATION
----------------------------------------------------------------------

4.1  How you would like to exchange keys and credentials. Please do not send
     a private key or a production credential by email.

4.2  Your key-rotation process, and how much notice we will get. If you
     publish a JWKS endpoint we can follow rotation automatically, which is
     the simplest arrangement for both sides.

----------------------------------------------------------------------
5. ONE POINT FOR YOUR COMPLIANCE TEAM
----------------------------------------------------------------------

An SSO assertion tells us that your system authenticated the client. It
cannot tell us who at your end was at the keyboard — an assertion generated
from a client's own session and one generated by a dealer acting on the
client's behalf are identical to us.

SEBI and the exchanges treat a client's own authenticated submission on an
online platform as the client's own instruction, and that is the basis on
which this integration works. We will therefore ask for a contractual
warranty that every assertion you issue represents the client's own
authenticated session. Our legal team will share the clause. We are flagging
it now so your compliance team sees it early rather than at signature.

----------------------------------------------------------------------
6. WHAT WE PROVIDE
----------------------------------------------------------------------

So your side can plan in parallel:

  - Your brand, your domain, your published identity on every page the
    client sees. Your legal entity and grievance officer, never ours.
  - IPO application by UPI mandate, and pre-filled ASBA form printing.
  - Live subscription figures, allotment status and application history
    for your clients.
  - A back-office view for your staff, scoped to your organisation only.

We can begin building against a written specification as soon as sections 1
and 2 are answered. A working UAT endpoint is needed to complete testing.

Please let us know a convenient time for a technical call if that is easier
than answering inline.

Warm regards,

[Your name]
[Designation]
Safal Capital Services Private Limited
[Email] · [Phone]

## Body — copy to here

---

## Notes for us, not for the partner

- **Do not send section 5 without counsel's wording to hand.** It flags the
  warranty; it must not be read as our final clause.
- **The PAN requirement in 2.2 is the one answer that can kill the bidding
  scope.** If the answer is no, the partner keeps the print path they already
  have and nothing else changes.
- **2.5 decides schema work.** Two client codes per PAN means
  `DematAccount.brokerClientCode`; one code returning a list means the same
  field, populated per demat from the response.
- **2.6 is a policy fork for the operator**, not a technical one. We default to
  editable because a mandate to a stale UPI ID fails and the client is the only
  person who can fix it.
- Nothing can be proven end to end until **NSE UAT credentials** arrive — the
  whole bidding surface is blocked on them, SSO included.
