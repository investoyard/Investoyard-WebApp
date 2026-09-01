# Social beat generator

Turns the IPO catalog into a daily queue of ready-to-post drafts.
**It never posts.** Output is a folder a human reviews and posts by hand.

```bash
node scripts/social/social-beats.mjs                  # today
node scripts/social/social-beats.mjs --date=2026-08-24 --dry-run
```

Output lands in `content/social/<date>/` — one file per post, each carrying
every routed channel's copy, plus an `index.md` summarising the day.

Register the daily run once, as the operator:

```
schtasks /Create /TN "Investoyard Social Beats" /TR "\"D:\Investoyard\scripts\social\run-daily.cmd\"" /SC DAILY /ST 08:15
```

## How it decides what to post

- **Stages come from dates, never from `Ipo.status`.** The status column drifts
  out of sync with the calendar in the live catalog — issues that closed weeks
  ago still read `upcoming`. `system.mjs` derives every beat from `openDate`,
  `closeDate`, `allotmentDate` and `listingDate`, the same way `ipoStage.ts`
  does on mobile.
- **Volume is tiered.** India listed 366 IPOs in FY26 (109 mainboard, ~257 SME).
  All eight beats on every issue would be ~240 posts a month. Mainboard gets all
  eight beats and the public channels; SME gets three beats (announced, allotment,
  listing) on WhatsApp and Telegram only.
- **Real data or nothing.** A beat whose numbers we do not hold is skipped and
  listed in the index — never filled with an estimate.
- **Duplicate catalog rows are collapsed** on (dates + band + lot), because the
  same issue exists twice under different symbols in places.
- **Every draft is linted** against the never-say list before it is written. The
  IPO's own name is masked first, so "Priority Jewels" or "Star Cement" does not
  trip the ratings rule. A blocked draft is reported, not written.

## Data gaps that currently keep beats dry

Measured against the live catalog (1,207 visible IPOs):

| Field | Coverage | Beat it blocks |
|-------|----------|----------------|
| `listingGainPct` | **0 of 1,172 listed** | Listing performance — the highest-value recurring post |
| `allotmentDate` | **20 of 1,207** | Allotment out — the biggest top-of-funnel moment |
| subscription rows | 295 IPOs | Day-1 and final subscription |
| GMP rows | 13 IPOs | The GMP hub and the GMP-accuracy scoreboard |
| `extra.anchors` | empty where sampled | Anchor book |

Backfilling listing prices and allotment dates is what unlocks the two beats
that matter most. The generator is ready for them.

## Files

- `system.mjs` — the communication system: the eight beats, tiering, channel
  routing, every template, and the compliance rules. Vocabulary, Title Case and
  the demand wording are imported from `@investoyard/shared-types`.
- `social-beats.mjs` — the runner: reads the catalog, matches beats to the day,
  renders, lints, writes.
- `run-daily.cmd` — Scheduled Task wrapper.

`system.mjs` requires the shared types to be built once:

```bash
cd packages/shared-types && npx tsc -p tsconfig.json
```
