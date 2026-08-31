# Investoyard — Launch Plan & Recurring Social / Branding Engine

*Owner: Safal Capital Services Pvt Ltd · Drafted 2026-08-24 · Status: draft for operator review*

---

## 0. The strategy in one page

**Positioning.** Investoyard is India's IPO companion — track every Mainboard and SME IPO, and apply for your whole family from one place. We *distribute and inform. We do not advise.*

**The wedge — family applications.** In India, IPO applying is almost never one person, one PAN. One person in the household applies for 4–6 PANs: self, spouse, parents, HUF, adult children. Every competitor treats that person as a single retail investor and makes them repeat the whole flow per PAN. Investoyard's apply engine is built around per-family-member profiles with a single itemized consent. **That is the story we tell everywhere.** Not "track IPOs" — everyone does that. "Apply for the whole family in one go."

**Three supporting proof points, in order of marketing value:**

1. **Public allotment checker that answers *any* PAN**, not just our customers — powered by registrar files. This is the single strongest top-of-funnel magnet we own. Allotment day is the highest-traffic moment in the Indian IPO cycle, and we can serve everyone, including people who applied elsewhere.
2. **Print Forms flow** — nobody serves the offline/physical form workflow. It is a real, unglamorous gap, and it is also the M2 broker white-label hook.
3. **Honest data** — live rows show real data or nothing, plus a published GMP-accuracy section. In a category built on inflated GMP screenshots, "we show you when we were wrong" is a brand asset.

**Three audiences:**

| # | Who | Where they are | What they want | Primary channel |
|---|-----|----------------|----------------|-----------------|
| A | **The family applicant** — 35–55, tier 1/2, applies for 4–6 PANs each IPO | WhatsApp, Telegram, YouTube | Speed, no re-entry, allotment certainty | WhatsApp Channel |
| B | **The first-timer** — 22–32, one PAN, one demat, learning | Instagram, YouTube Shorts | "How does this even work?" | Instagram + Shorts |
| C | **Sub-brokers, APs, small brokers** — M2 white-label pipeline | LinkedIn, direct | A form/apply rail they can put their brand on | LinkedIn + BD |

**Voice.** Calm, plain, precise. Numbers over adjectives. Never hype, never a call to action on an investment. The design discipline of the product ("calm & data-clear") carries into the feed: the same indigo `#3c2e7e` / gold `#ffcb32`, the same Plus Jakarta Sans + Inter, the same hairline borders. Somebody who sees a post and then opens the site should feel it is the same object.

**North-star metric:** *unique PANs applied through Investoyard, per IPO.* Everything else is a proxy.

---

## 1. Pre-launch — the four weeks before T-0

### 1.1 Launch-blocking product gaps (found in the codebase, 2026-08-24)

These are not marketing tasks — they are engineering tasks that marketing cannot work around. Nothing below should be launched publicly until the first three are done.

| # | Gap | Why it blocks | Fix |
|---|-----|---------------|-----|
| 1 | **No `og:image`** — `apps/web/app/layout.tsx` sets `openGraph.title/description` but no image | Every WhatsApp forward, X post and LinkedIn share renders a blank grey card. In WhatsApp-first India this kills sharing outright | Add a default 1200×630 OG image + `metadata.openGraph.images`, and `twitter.card = 'summary_large_image'` |
| 2 | **No `sitemap.xml`, no `robots.txt`** — neither exists in `apps/web/app` nor `apps/web/public` | The SEO listing pages we deliberately built (`/ipos/open`, `/upcoming`, `/listed`, `/sme`, the hubs) are not being offered to Google | Add `app/sitemap.ts` + `app/robots.ts` (static export supports both), submit in Search Console |
| 3 | **Per-IPO dynamic OG cards** | Highest-leverage social feature we can build. Every shared IPO link becomes a branded card with name, dates, price band, lot size — free distribution on every forward | Pre-render one OG card per IPO at build time into `apps/web/public/og/<slug>.png`; the same renderer feeds the social queue in §3.4 |
| 4 | **No JSON-LD structured data** | `/faqs` → `FAQPage`, `/glossary` → `DefinedTerm`, `/about` → `Organization`, IPO pages → dates. Rich results on exactly the queries we want | Add `<script type="application/ld+json">` blocks per page type |
| 5 | **`whatsappChannel` tenant setting is empty** | `WhatsAppCta` renders a CTA with nothing behind it, and WhatsApp is our #1 channel | Create the channel, set the tenant value |
| 6 | **Mobile app not on Play Store** (EAS build + icon pending) | "Download the app" has nothing behind it | Ship the EAS build. **Interim:** the PWA already works (`manifest.webmanifest` + `sw.js`) — market "Add to Home Screen" |
| 7 | **Untested end-to-end paths** — registrar upload, partner API, MANIPAL blank on a live IPO, reminders/bells, first news post | Any one of these failing in launch week on a live IPO is a public credibility event | Run one full dress rehearsal against a live IPO before T-0 (§1.6) |

### 1.2 Brand kit — freeze it before any post goes out

- **Logo lockups**: primary, horizontal, mono-white, app-icon safe zone. `investoyard-logo.svg` exists — export the raster set.
- **Palette**: indigo `#3c2e7e` (structure, headings), gold `#ffcb32` (accent, one use per asset), a neutral base with a slight indigo bias, and semantic green/red **reserved exclusively for financial signals** — never for decoration.
- **Type**: Plus Jakarta Sans (display) + Inter (body) — identical to the product.
- **Six post templates**, built once in Canva/Figma and never re-improvised: T1 IPO Card · T2 Data/Subscription · T3 Explainer Carousel · T4 Results (allotment/listing) · T5 Quote/Principle · T6 Product Feature.
- **The disclaimer strip** is a permanent design element, not an afterthought — a fixed bottom band on every GMP and data asset.
- **Handle**: `@investoyard` reserved on *every* platform at once, including ones we will not use for a year. Squatting on an IPO-adjacent brand name is a real risk (§7).

### 1.3 Channel priority — build in this order, not all at once

| Rank | Channel | Job | Cadence at steady state |
|------|---------|-----|-------------------------|
| 1 | **WhatsApp Channel** | Highest intent, zero algorithm, closest to the product. Every IPO beat lands here first | 8–12/week, event-driven |
| 2 | **Telegram broadcast** | The IPO/GMP audience already lives here; cheap incremental reach off the same asset | Same as WhatsApp |
| 3 | **Instagram** (Reels + carousels) | Top of funnel, audience B | 5/week: 2 Reels, 2 carousels, 1 story-only day |
| 4 | **YouTube** (Shorts primary) | "How to check IPO allotment", "how to apply for family" are evergreen search — this compounds | 3 Shorts/week + 1 long-form/month |
| 5 | **X (Twitter)** | Real-time subscription numbers, finance journalists, the ecosystem | Event-driven, 10–15/week |
| 6 | **LinkedIn** | M2 broker pipeline + entity credibility for Safal Capital | 2/week |
| 7 | **Google Business Profile** | Local and entity trust; appears on brand searches | Set once, post monthly |
| 8 | **Quora + r/IndiaInvestments, r/IndianStreetBets** | Answer-led, long-tail SEO, zero spam | 2 genuine answers/week |

**Do not open 8 channels in week one.** Launch with 1, 2, 3 and 5. Add 4 and 6 in month two, 7 and 8 in month three.

### 1.4 The content bank — 30 assets ready before T-0

So that launch week is never improvised. Build these during the four pre-launch weeks.

**Education (12)** — What is an IPO · Mainboard vs SME · Price band and lot size · How allotment actually works (a lottery, not first-come) · Cut-off price explained · The UPI mandate: a block, not a payment · Why your application got rejected: the six real reasons · Retail vs HNI vs shareholder quota · What anchor investment is · Reading a subscription table · Listing day: what actually happens · What GMP is and is not.

**Product (8)** — Apply for your family in one flow (the hero asset) · Add a family member profile · Check allotment for any PAN · Print Forms walkthrough · Set an IPO reminder · The calendar hub · Live subscription hub · The glossary.

**Trust (5)** — Who we are (Safal Capital, merchant-banker empanelment) · Why we do not give recommendations · Our GMP-accuracy record · How your data is handled (DPDP) · Our disclaimer, in plain English.

**Founder / brand (5)** — Why we built this · The family-applying problem · What we deliberately left out (ratings, tips, targets) · A build-in-public data story · Our one rule: real data or nothing.

### 1.5 Compliance guardrails — non-negotiable

We are a **distributor** operating on merchant-banker empanelment. We hold **no RIA registration**. Everything below applies to every post, caption, collaboration and reply.

**Never publish**

- "Buy" / "Sell" / "Subscribe" / "Avoid" / "Apply now for listing gains"
- Ratings, stars, scores, "our pick", "top 3 IPOs this month"
- Target prices, expected listing price, expected gains, "multibagger"
- Guarantees or any forward-looking return claim
- Kostak or sauda rates
- Screenshots of another person's allotment or P&L as promotion
- Anything that reads as personalised advice in a DM or comment reply

**Always publish with**

- The **GMP disclaimer** on every GMP asset — unofficial, unregulated, not a price indicator, no basis for a decision. GMP content is suppressed entirely for gmp-disabled tenants.
- The **entity line**: "Investoyard is an IPO application platform operated by Safal Capital Services Private Limited. We distribute and inform; we do not advise."
- ASCI disclosure (`#Ad` or "Paid partnership") on every paid collaboration, in the first line, not buried in hashtags.

**Creator collaborations.** SEBI's 2024 measures restrict regulated entities and their agents from associating with unregistered persons who give advice, recommendations or make return claims. Any creator we pay must therefore either be SEBI-registered, or be contractually bound to non-advisory, non-performance-claiming content. **Put that clause in writing before the first rupee moves, and have counsel confirm the exact scope for a merchant-banker-empanelled distributor** — this sits alongside the Terms/Disclaimer/consent-wording sign-offs already pending.

**DPDP.** Any lead magnet that collects a phone number or email needs a just-in-time consent notice at the point of collection, no pre-ticked boxes, and a stated purpose. Never run "DM us your PAN" mechanics.

**Records.** Archive a screenshot or the rendered asset of every published post, with date, for five years. Cheap now, invaluable later.

### 1.6 The dress rehearsal

One week before T-0, run the entire product against a **live** IPO with a small internal group: apply for three family members, print one form set, upload the registrar allotment file, check a PAN on the public checker, publish one news post, fire the reminder sweep. Fix what breaks. Only then launch.

### 1.7 Measurement setup

- GA4 and Google Search Console on `newipo.finwave.co`, verified before launch.
- **One UTM convention, used without exception:** `?utm_source=<whatsapp|telegram|instagram|youtube|x|linkedin>&utm_medium=social&utm_campaign=<ipo-slug|evergreen-topic>&utm_content=<template-id>`
- A single weekly dashboard: unique PANs applied · applications per IPO · allotment-checker uses · channel followers · site sessions · top 10 organic queries.

---

## 2. Launch — T-0 to T+14

### 2.1 Do not launch on a date. Launch on an IPO.

The product is at its most convincing during a live IPO week — that is when subscription numbers move, the allotment checker matters, and the apply flow has something to do. Pick the **next Mainboard IPO with a recognisable consumer name** and make that the launch moment. It hands us a natural 12–14 day arc with four built-in news pegs (announced → opens → allotment → listing), and removes any need to manufacture attention.

Requirements for the chosen IPO: Mainboard, a name ordinary people recognise, and the operator's bidding rail confirmed live for it.

### 2.2 The launch fortnight

| Day | Moment | Actions |
|-----|--------|---------|
| **T-7** | Soft launch | Open to the existing client book plus friends and family. WhatsApp broadcast to the operator's own list. Goal: 50 real applications, and every bug found here instead of in public |
| **T-3** | Channels go live | WhatsApp Channel, Telegram, Instagram, X published with 9 grid posts already in place — never launch an empty profile. Bio, links and pinned post set |
| **T-1** | Founder story | Long-form post on LinkedIn and X: the family-applying problem, what we built, what we deliberately left out. The most shareable single asset of the launch — write it properly |
| **T-0** | Public launch, tied to the IPO announcement | Launch post across all channels. The IPO card (dates, band, lot, family-apply CTA) is the creative. Press and newsletter outreach the same morning |
| **T+1** | The demo | 60-second Reel/Short: applying for four family members, real screen, no voiceover gimmicks, real time. Pin it everywhere |
| **T+2** | IPO opens | The full lifecycle engine (§3) runs for the first time in public. Day-1 subscription card at 17:00 |
| **T+3 to +5** | Live window | Daily subscription cards, one "closing today" push. Reply to every comment and DM personally — this window sets the tone of the community |
| **T+6** | Close | Final subscription card plus a "what happens next" explainer on the allotment timeline |
| **T+8** | **Allotment day** | The biggest day of the launch. Public checker promoted hard on every channel from 10:00 — any PAN, whether they applied with us or not. Expect the traffic spike; load-test first |
| **T+10** | Listing day | Listing performance card with honest numbers, up or down. Publishing a bad listing accurately buys more trust than three good ones |
| **T+12** | Retro post | "Our first IPO, in numbers" — applications, PANs served, allotment checks. Build-in-public, no vanity inflation |
| **T+14** | Steady state | The recurring engine in §3 takes over |

### 2.3 Seeding, not spamming

- Personal messages from the operator to 100 people who genuinely apply for IPOs. Not a broadcast — one by one.
- Two genuine, useful answers on Quora and Reddit in launch week. No link-drops.
- Offer the allotment checker to two or three finance newsletters as a free reader utility.
- Existing merchant-banker and broker relationships get a personal note — this doubles as the first M2 touch.

---

## 3. The recurring engine — the IPO *is* the calendar

### 3.1 The core idea

We never sit down to "think of content". The IPO lifecycle generates it. Every IPO produces the same **eight beats**, in the same order, from data we already hold in the database:

| Beat | Timing | Asset | Template |
|------|--------|-------|----------|
| 1 | T-7 | **Announced** — dates, price band, lot size, issue size | T1 |
| 2 | T-2 | **RHP + anchor book** — anchor investors and amounts, already captured per IPO | T1 |
| 3 | Day 1, 09:30 | **Open today** | T1 |
| 4 | Day 1, 17:00 | **Day-1 subscription** — by category, real numbers | T2 |
| 5 | Final day, 11:00 | **Closing today** | T1 |
| 6 | Close +0, 18:00 | **Final subscription** | T2 |
| 7 | Allotment day, 10:00 | **Allotment out — check any PAN** | T4 |
| 8 | Listing day, 10:15 | **Listing performance** — real open and close vs issue price | T4 |

With 8–15 Mainboard and SME IPOs live in an active month, that alone is 60–120 posts a month of factual, zero-invention content. **This is the engine. Everything else is garnish.**

### 3.2 The weekly grid, layered on top

| Day | Slot | Source |
|-----|------|--------|
| Mon | **The week ahead** — what opens, closes, lists, allots | `/calendar` hub |
| Tue | **Explainer** — one term, one carousel or Short | `/glossary` |
| Wed | **Data card** — a real chart from our own data | `/subscription`, `/performance` |
| Thu | **Product** — one feature or one family-apply use case | app screens |
| Fri | **Week in review** — allotments and listings settled this week | `/performance` |
| Sat | **Beginner Reel/Short** | content bank |
| Sun | Quiet. Reply to comments and DMs only | — |

### 3.3 Monthly and quarterly

**Monthly** — one long-form YouTube video (10–14 min: "How IPO allotment actually works", "Applying for your family, end to end"); one **data report** built on our own registrar and subscription data (for example "Every SME IPO listed this quarter — subscription vs listing gain, all of them"); one PR-able data story pitched to two or three finance journalists; ten new glossary terms shipped to the site.

**Quarterly** — one brand campaign around a single idea; a full channel review, cutting what is not working and doubling what is; a refresh of the six templates so the feed does not calcify.

### 3.4 Automate the beats — this is a build item

Most of the pieces already exist. Assembling them turns 60–120 manual posts a month into a review queue.

- The **OG card renderer** (§1.1, item 3) already draws an IPO card from IPO data — extend it to the T1/T2/T4 social sizes (1080×1350 Instagram, 1200×675 X, 1080×1920 story).
- `extra.gmpLog` and `extra.subLog` already accumulate day-wise series, so the Day-1 and Final subscription cards need no new data.
- The **hourly alert sweep** (open / closing / allotment / listing) already knows exactly when each beat fires — hang card generation off the same trigger.
- The **news engine** already stores admin-written posts with a rich-text editor — extend it with a "social queue" view: generated card, pre-filled caption, approve / edit / publish.

Target: the operator opens one admin screen a day, approves three to six cards, and is done in ten minutes.

### 3.5 Same beat, different channel

One asset, five adaptations, written once by whoever runs the queue.

| Channel | Adaptation |
|---------|-----------|
| WhatsApp / Telegram | Card, three lines, deep link. No hashtags. Fastest, and first |
| Instagram | Card as feed post; carousel when the beat needs context; story with a link sticker |
| X | Card plus the number in the first line. Numbers are the hook — "Retail 4.2× on day one" outperforms any adjective |
| LinkedIn | Only beats 6 and 8, framed as market observation rather than promotion |
| YouTube Shorts | Only beats 7 and 8 — allotment and listing carry a face and a voice well |

---

## 4. Team, time and tools

Realistic steady-state load once §3.4 is automated:

| Role | Who | Hours/week |
|------|-----|-----------|
| Approve the beat queue, set the tone, reply to DMs | Operator | 3 |
| Produce the weekly grid, Reels/Shorts and captions | One content person, in-house or freelance | 8–10 |
| Design refreshes and templates | Freelance designer, monthly | 4 per month |

**Tools:** Canva or Figma for templates · one scheduler (Buffer / Publer) *or* the in-house social queue from §3.4 — pick one, do not run both · GA4 and Search Console · a shared content calendar · a screenshot archive folder for compliance records.

**A rule worth holding:** the operator personally answers every comment and DM for the first 90 days. In a category where every competitor is an anonymous Telegram channel, being a real, identifiable, accountable business *is* the brand.

---

## 5. Paid — small and surgical

Organic first. Paid only where intent is already maximal.

| Priority | Spend | What |
|----------|-------|------|
| 1 | ₹15–25k/month | **Google Search on allotment intent** — "IPO allotment status", "<IPO name> allotment", "check IPO allotment PAN". The highest-intent query set in the category, and we have the best answer for it |
| 2 | ₹10–15k/month | **Instagram/Meta retargeting** — people who visited an IPO page and did not apply, during the live window only |
| 3 | Variable | **Creator collaborations** — two or three mid-tier finance creators (50k–300k), strictly under the §1.5 clause. Brief them on the family-apply story, never on a specific IPO |
| 4 | ₹0 | **Referral** — after a successful family application, offer a share card ("applied for 4 family members in one go"). The wedge is inherently social; let it be |

Do not spend on paid until the launch fortnight is complete and the funnel numbers are known.

---

## 6. What we measure

| Layer | Metric | Where |
|-------|--------|-------|
| **North star** | Unique PANs applied per IPO | Admin reports |
| Conversion | Applications per IPO · apply-flow completion rate · family members per applying user | Admin reports |
| Product-led acquisition | Allotment-checker uses · checker → signup rate | GA4 |
| Site | Organic sessions · top 10 organic queries · IPO page → apply rate | GA4 + Search Console |
| Social | Followers per channel · saves and shares (**not** likes) · link clicks by UTM | Native + GA4 |
| Community | DMs answered · median reply time | Manual |
| M2 pipeline | Broker/AP conversations opened from LinkedIn | CRM / manual |

Set the actual targets with the operator after the launch fortnight gives a real baseline — targets picked before the first IPO would be fiction. **Saves and shares are the honest social metric here; likes on IPO content mean almost nothing.**

---

## 7. Risks and the standing answer to each

| Risk | Answer |
|------|--------|
| **Compliance drift** — an excited caption slides into a recommendation | The §1.5 never-list is pinned in the content tool; one person approves every post; counsel signs off the standing templates once |
| **Attracting a GMP-only crowd** — high churn, low value, and they punish honesty | GMP is present but never the hero. The hero is always the family-apply flow and the allotment checker |
| **IPO drought** — a quiet quarter with almost no issues | Fall back to the education bank, the data reports (listed-IPO performance never stops being interesting), and buyback/OFS coverage once those modules land |
| **Impersonation** — fake "Investoyard" Telegram channels selling tips | Reserve every handle now (§1.2); publish an official-channels list on `/about`; report fakes on sight. Close to inevitable in this space — plan for it rather than be surprised |
| **Launch-week outage** on the biggest day | Dress rehearsal (§1.6); allotment-day load test; the DB/Redis start after any reboot is a documented, known failure mode |
| **A bad listing on the launch IPO** | Publish it accurately and on time. The honest-data position only exists if it survives an unfavourable number |

---

## 8. First 90 days

| Weeks | Focus | Done means |
|-------|-------|-----------|
| **-4 to -1** | Fix §1.1 gaps 1–5. Brand kit frozen. 30 assets built. Channels created with 9 posts pre-loaded. GA4/GSC/UTMs live. Dress rehearsal passed | Nothing improvised remains |
| **1–2** | The launch fortnight (§2), anchored to a live Mainboard IPO | First 100 real applications; every launch-week bug closed |
| **3–6** | The recurring engine runs manually. Build the social queue (§3.4). Play Store build ships. YouTube opens | Every IPO gets all eight beats without a miss |
| **7–10** | Beat generation automated. First long-form video. First data report pitched to press. LinkedIn/M2 outreach begins | Daily posting costs under 15 operator-minutes |
| **11–13** | First paid test on allotment intent. First creator collaboration under the compliance clause. Quarterly review — cut what is dead | A funnel with real numbers, and a decision on where the next rupee goes |

---

## Appendix A — Post templates

**T1 · IPO announced**

> **&lt;Company Name&gt;** opens &lt;date&gt;.
> Price band ₹&lt;x&gt;–₹&lt;y&gt; · Lot &lt;n&gt; shares · Min application ₹&lt;amt&gt; · Issue size ₹&lt;x&gt; Cr
> Mainboard · Closes &lt;date&gt; · Listing &lt;date&gt;
> Apply for your whole family in one flow → &lt;link&gt;
> *Investoyard is an IPO application platform by Safal Capital Services Pvt Ltd. Information only, not advice.*

**T2 · Subscription update**

> **&lt;Company Name&gt;** — day &lt;n&gt; subscription
> Retail &lt;x&gt;× · HNI &lt;x&gt;× · QIB &lt;x&gt;× · **Overall &lt;x&gt;×**
> Closes &lt;date&gt;, &lt;time&gt;.
> Live numbers → &lt;link&gt;

**T4 · Allotment out**

> **&lt;Company Name&gt;** allotment is out.
> Check any PAN — you do not need an Investoyard account, and it does not matter where you applied.
> → &lt;link&gt;

**T4 · Listing**

> **&lt;Company Name&gt;** listed at ₹&lt;x&gt; against an issue price of ₹&lt;y&gt; — &lt;up/down&gt; &lt;z&gt;%.
> Closed day one at ₹&lt;c&gt;.
> Every listing, with real numbers → &lt;link&gt;

**T5 · Principle**

> We do not rate IPOs. We do not tell you which to apply for. We are not registered to advise, and we will not pretend otherwise.
> What we do: every date and every number, accurate and on time — and an apply flow that handles your whole family at once.

**GMP disclaimer strip** — on every GMP asset, verbatim

> Grey Market Premium is unofficial and unregulated. It is not a price, not an indicator of listing performance, and not a basis for any decision. Shown for information only.

## Appendix B — Hashtags

Keep them boring and few. Four to six per post, never in the first line.

`#IPO #IPOIndia #MainboardIPO #SMEIPO #IPOAllotment #Investoyard`

Add `#<CompanyName>IPO` on beat posts. No trending-hashtag hijacking.

## Appendix C — The never-say list

buy · sell · subscribe · avoid · apply for listing gains · guaranteed · assured · multibagger · sure-shot · target price · expected listing price · our pick · top IPOs · rating · score · stars · kostak · sauda · "DM for details" · any reply that answers "should I apply?"

The correct answer to *"should I apply?"* is always some version of:

> We cannot advise on that — we are not registered to. Here is everything we know about the issue, and here is the flow if you decide to apply.
