/**
 * Investoyard social communication system — the single source for WHAT gets
 * posted, WHERE it goes, and WHAT may never be said.
 *
 * Consumed by scripts/social/social-beats.mjs. When the beat generator folds
 * into the API as a SocialBeatsService, this module moves with it unchanged.
 *
 * Vocabulary, Title Case and the demand wording come from
 * @investoyard/shared-types — never re-implemented here (see CLAUDE.md).
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** Built via `cd packages/shared-types && npx tsc -p tsconfig.json`. */
const { titleCase, demandWord, LABEL } = require('../../packages/shared-types/dist/format.js');

export { titleCase, demandWord, LABEL };

export const SITE = 'newipo.finwave.co';
export const ENTITY_LINE =
  'Investoyard is an IPO application platform by Safal Capital Services Pvt Ltd. Information only, not advice.';
export const GMP_DISCLAIMER =
  'Grey Market Premium is unofficial and unregulated. It is not a price, not an indicator of listing performance, and not a basis for any decision.';

/* ------------------------------------------------------------------ *
 * Volume control
 *
 * India listed 366 IPOs in FY26 (109 mainboard + ~257 SME). Firing all
 * eight beats on every issue would be ~240 posts/month — unpostable, and
 * it would bury the mainboard issues that actually carry the audience.
 * So SME gets the three beats that are genuinely useful to an applicant
 * and nothing else.
 * ------------------------------------------------------------------ */
export const TIER_BEATS = {
  mainboard: ['announced', 'anchor', 'open', 'day1_sub', 'closing', 'final_sub', 'allotment', 'listing'],
  sme: ['announced', 'allotment', 'listing'],
};

/** SME rides the two owned channels only; the public feeds stay mainboard-led. */
export const TIER_CHANNELS = {
  mainboard: null, // no restriction — the beat's own routing applies
  sme: ['whatsapp', 'telegram'],
};

export const CHANNELS = {
  whatsapp: { label: 'WhatsApp Channel', hashtags: false, limit: 1200 },
  telegram: { label: 'Telegram', hashtags: false, limit: 1200 },
  x: { label: 'X', hashtags: true, limit: 280 },
  instagram: { label: 'Instagram', hashtags: true, limit: 2000 },
  linkedin: { label: 'LinkedIn', hashtags: false, limit: 2000 },
};

/* ------------------------------------------------------------------ *
 * Compliance — enforced on every rendered draft before it is written.
 * ------------------------------------------------------------------ */
export const BANNED = [
  [/\bbuy\b/i, 'recommendation verb'],
  [/\bsell\b/i, 'recommendation verb'],
  [/\bsubscribe\b/i, 'recommendation verb (note: "Subscribed" is fine)'],
  [/\bavoid\b/i, 'recommendation verb'],
  [/listing gain/i, 'return claim'],
  [/\bguarantee/i, 'return claim'],
  [/\bassured\b/i, 'return claim'],
  [/multibagger/i, 'return claim'],
  [/sure[- ]?shot/i, 'return claim'],
  [/target price/i, 'price forecast'],
  [/expected listing/i, 'price forecast'],
  [/our pick/i, 'recommendation'],
  [/\btop \d+ ipo/i, 'ranking'],
  [/\brating\b/i, 'rating'],
  [/\bstars?\b/i, 'rating'],
  [/kostak/i, 'unregulated grey-market quote'],
  [/\bsauda\b/i, 'unregulated grey-market quote'],
  [/dm for details/i, 'solicitation'],
  [/should you apply/i, 'advice framing'],
];

/** Beats whose draft must carry the entity/not-advice line. */
const NEEDS_ENTITY_LINE = new Set(['announced', 'open', 'closing']);

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const num = (v) => (v == null ? null : Number(v));
export const inr = (v) => (v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN'));
export const longDate = (d) => (d ? `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : '—');
export const shortDate = (d) => (d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}` : '—');
export const times = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}×`);

const band = (i) =>
  i.priceBandMin != null && i.priceBandMax != null
    ? `${inr(i.priceBandMin)}–${inr(i.priceBandMax).replace('₹', '')}`
    : '—';

const boardWord = (i) => (i.type === 'sme' ? 'SME' : 'Mainboard');

/** `issueSize` is stored in RUPEES, not crore — convert before labelling it Cr. */
const issueCr = (i) => {
  if (i.issueSize == null) return null;
  const cr = Number(i.issueSize) / 1e7;
  const digits = cr >= 100 ? 0 : 2;
  return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: digits })} Cr`;
};

/** X has 280 characters. Facts get abbreviated, and the disclaimer shortens. */
const xFacts = (i) => {
  const bits = [];
  const b = band(i);
  if (b !== '—') bits.push(`${LABEL.offerPrice} ${b}`);
  if (i.lotSize) bits.push(`Lot ${i.lotSize}`);
  if (i.minAmount != null) bits.push(`Min ${inr(i.minAmount)}`);
  const dates = [];
  if (i.closeDate) dates.push(`Closes ${shortDate(i.closeDate)}`);
  if (i.listingDate) dates.push(`Lists ${shortDate(i.listingDate)}`);
  return [bits.join(' · '), dates.join(' · ')].filter(Boolean).join('\n');
};
const X_TAGS = (i) => `#IPO #IPOIndia #${i.type === 'sme' ? 'SMEIPO' : 'MainboardIPO'}`;
const X_NOTE = 'Not advice.';

const link = (path) => `${SITE}${path}`;

const hashtags = (i) =>
  `#IPO #IPOIndia #${i.type === 'sme' ? 'SMEIPO' : 'MainboardIPO'} #${i.symbol}IPO`;

/** The stat block every announcement-shaped beat reuses. */
function factLines(i) {
  const out = [];
  const b = band(i);
  const bits = [];
  if (b !== '—') bits.push(`${LABEL.offerPrice} ${b}`);
  if (i.lotSize) bits.push(`${LABEL.lotSize} ${i.lotSize} shares`);
  if (i.minAmount != null) bits.push(`${LABEL.minApplication} ${inr(i.minAmount)}`);
  if (bits.length) out.push(bits.join(' · '));
  const meta = [boardWord(i)];
  if (issueCr(i)) meta.push(`${LABEL.issueSize || 'Issue Size'} ${issueCr(i)}`);
  if (i.closeDate) meta.push(`Closes ${longDate(i.closeDate)}`);
  if (i.listingDate) meta.push(`Lists ${shortDate(i.listingDate)}`);
  out.push(meta.join(' · '));
  return out.join('\n');
}

/** Subscription line — omitted entirely when we hold no real numbers. */
function subLines(sub) {
  if (!sub || !sub.categories.length) return null;
  const order = ['retail', 'hni', 'nii', 'qib', 'employee', 'shareholder'];
  const parts = sub.categories
    .slice()
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
    .filter((c) => c.code !== 'total')
    .map((c) => `${c.label} ${times(c.x)}`);
  const total = sub.categories.find((c) => c.code === 'total');
  const line = parts.join(' · ');
  return total ? `${line}\n**Overall ${times(total.x)}**` : line;
}

/* ------------------------------------------------------------------ *
 * The eight beats
 *
 * `on(i)` returns the Date this beat fires for a given IPO, or null.
 * Everything is derived from DATES, never from the `status` column —
 * status drifts out of sync with the calendar in the live catalog.
 * ------------------------------------------------------------------ */
const day = 86400000;
const shift = (d, n) => (d ? new Date(d.getTime() + n * day) : null);

export const BEATS = [
  {
    id: 'announced',
    title: 'Announced',
    slot: '10:30',
    on: (i) => shift(i.openDate, -7),
    channels: ['whatsapp', 'telegram', 'x', 'instagram'],
    needs: (i) => i.openDate != null,
    render: (i) => {
      const head = `${titleCase(i.name)} opens ${longDate(i.openDate)}.`;
      const facts = factLines(i);
      const cta = `Apply for your whole family in one flow →\n${link('/ipos/' + i.symbol.toLowerCase())}`;
      return {
        whatsapp: `${head}\n\n${facts}\n\n${cta}\n\n${ENTITY_LINE}`,
        telegram: `${head}\n\n${facts}\n\n${cta}\n\n${ENTITY_LINE}`,
        x: `${titleCase(i.name)} — ${issueCr(i) ? issueCr(i) + ' ' : ''}${boardWord(i)} IPO opens ${shortDate(i.openDate)}.\n\n${xFacts(i)}\n\n${X_NOTE}\n${X_TAGS(i)}`,
        instagram: `${head}\n\n${facts}\n\nOne flow, every family member — self, spouse, parents, HUF. Link in bio.\n\n${ENTITY_LINE}\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'anchor',
    title: 'Anchor book',
    slot: '17:30',
    on: (i) => i.anchorDate ?? shift(i.openDate, -2),
    channels: ['whatsapp', 'telegram', 'x'],
    // Real data or nothing: no anchors captured → no post.
    needs: (i) => i.openDate != null && i.anchors.length > 0,
    render: (i) => {
      const total = i.anchors.reduce((s, a) => s + (a.amount ?? 0), 0);
      const top = i.anchors.slice(0, 5).map((a) => `· ${a.name}${a.amount ? ` — ₹${a.amount.toLocaleString('en-IN')} Cr` : ''}`).join('\n');
      const head = `${titleCase(i.name)} — anchor book placed ahead of the ${shortDate(i.openDate)} open.`;
      const body = `${i.anchors.length} anchor investors${total ? `, ₹${total.toLocaleString('en-IN')} Cr` : ''}\n\n${top}`;
      return {
        whatsapp: `${head}\n\n${body}\n\nFull anchor list → ${link('/ipos/' + i.symbol.toLowerCase())}`,
        telegram: `${head}\n\n${body}\n\nFull anchor list → ${link('/ipos/' + i.symbol.toLowerCase())}`,
        x: `${titleCase(i.name)} anchor book: ${i.anchors.length} investors${total ? `, ₹${total.toLocaleString('en-IN')} Cr` : ''}.\n\nOpens ${shortDate(i.openDate)}.\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'open',
    title: 'Open today',
    slot: '09:30',
    on: (i) => i.openDate,
    channels: ['whatsapp', 'telegram', 'x', 'instagram'],
    needs: (i) => i.openDate != null,
    render: (i) => {
      const head = `${titleCase(i.name)} is open today.`;
      const facts = factLines(i);
      const cta = `Apply for your family → ${link('/apply/' + i.symbol.toLowerCase())}`;
      return {
        whatsapp: `${head}\n\n${facts}\n\n${cta}\n\n${ENTITY_LINE}`,
        telegram: `${head}\n\n${facts}\n\n${cta}\n\n${ENTITY_LINE}`,
        x: `${head}\n\n${xFacts(i)}\n\n${X_NOTE}\n${X_TAGS(i)}`,
        instagram: `${head}\n\n${facts}\n\nLink in bio.\n\n${ENTITY_LINE}\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'day1_sub',
    title: 'Day-1 subscription',
    slot: '17:00',
    on: (i) => i.openDate,
    channels: ['whatsapp', 'telegram', 'x'],
    needs: (i) => i.sub != null,
    render: (i) => {
      const lines = subLines(i.sub);
      const word = i.sub.total != null ? demandWord(i.sub.total, i.type === 'sme') : null;
      const head = `${titleCase(i.name)} — day 1 subscription`;
      const tail = `Closes ${longDate(i.closeDate)}, 5:00 pm.\nLive numbers → ${link('/subscription')}`;
      return {
        whatsapp: `${head}\n\n${lines}\n${word ? `\n${word}.\n` : ''}\n${tail}`,
        telegram: `${head}\n\n${lines}\n${word ? `\n${word}.\n` : ''}\n${tail}`,
        x: `${head}\n\n${lines}\n\nCloses ${shortDate(i.closeDate)}.\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'closing',
    title: 'Closing today',
    slot: '11:00',
    on: (i) => i.closeDate,
    channels: ['whatsapp', 'telegram', 'x', 'instagram'],
    needs: (i) => i.closeDate != null,
    render: (i) => {
      const head = `${titleCase(i.name)} closes today at 5:00 pm.`;
      const lines = subLines(i.sub);
      const mandate = 'UPI mandates must be approved by 5:00 pm — an unapproved mandate is not an application.';
      const cta = `Apply for your family → ${link('/apply/' + i.symbol.toLowerCase())}`;
      return {
        whatsapp: `${head}\n${lines ? `\n${lines}\n` : ''}\n${mandate}\n\n${cta}\n\n${ENTITY_LINE}`,
        telegram: `${head}\n${lines ? `\n${lines}\n` : ''}\n${mandate}\n\n${cta}\n\n${ENTITY_LINE}`,
        x: `${head}\n\n${mandate}\n\n${X_NOTE}\n${X_TAGS(i)}`,
        instagram: `${head}\n\n${mandate}\n\nLink in bio.\n\n${ENTITY_LINE}\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'final_sub',
    title: 'Final subscription',
    slot: '18:00',
    on: (i) => i.closeDate,
    channels: ['whatsapp', 'telegram', 'x', 'linkedin'],
    needs: (i) => i.sub != null,
    render: (i) => {
      const lines = subLines(i.sub);
      const head = `${titleCase(i.name)} — final subscription`;
      const next = i.allotmentDate ? `Allotment expected ${longDate(i.allotmentDate)}.` : 'Allotment date to be confirmed.';
      return {
        whatsapp: `${head}\n\n${lines}\n\n${next}\nWhat happens next → ${link('/allotment')}`,
        telegram: `${head}\n\n${lines}\n\n${next}\nWhat happens next → ${link('/allotment')}`,
        x: `${head}\n\n${lines}\n\n${next}\n\n${hashtags(i)}`,
        linkedin: `${titleCase(i.name)} closed its ${boardWord(i).toLowerCase()} issue today.\n\n${lines}\n\n${next}\n\nEvery issue, with the real numbers: ${link('/subscription')}`,
      };
    },
  },
  {
    id: 'allotment',
    title: 'Allotment out',
    slot: '10:00',
    on: (i) => i.allotmentDate,
    channels: ['whatsapp', 'telegram', 'x', 'instagram'],
    needs: (i) => i.allotmentDate != null,
    render: (i) => {
      const head = `${titleCase(i.name)} allotment is out.`;
      const body = `Check any PAN — you don't need an Investoyard account, and it doesn't matter where you applied.`;
      const cta = `→ ${link('/allotment')}`;
      return {
        whatsapp: `${head}\n\n${body}\n\n${cta}`,
        telegram: `${head}\n\n${body}\n\n${cta}`,
        x: `${head}\n\n${body}\n\n${hashtags(i)}`,
        instagram: `${head}\n\n${body}\n\nLink in bio.\n\n${hashtags(i)}`,
      };
    },
  },
  {
    id: 'listing',
    title: 'Listing performance',
    slot: '10:15',
    on: (i) => i.listingDate,
    channels: ['whatsapp', 'telegram', 'x', 'instagram', 'linkedin'],
    // Real data or nothing — no listing gain recorded yet, no post.
    needs: (i) => i.listingDate != null && i.listingGainPct != null,
    render: (i) => {
      const g = Number(i.listingGainPct);
      const dir = g >= 0 ? 'up' : 'down';
      const issue = i.priceBandMax != null ? inr(i.priceBandMax) : null;
      const at = i.listingPrice != null ? `listed at ${inr(i.listingPrice)}` : 'listed';
      const head = issue
        ? `${titleCase(i.name)} ${at} against an issue price of ${issue} — ${dir} ${Math.abs(g).toFixed(1)}%.`
        : `${titleCase(i.name)} ${at} — ${dir} ${Math.abs(g).toFixed(1)}%.`;
      const tail = `Every listing, up or down, with real numbers → ${link('/performance')}`;
      return {
        whatsapp: `${head}\n\n${tail}`,
        telegram: `${head}\n\n${tail}`,
        x: `${head}\n\n${hashtags(i)}`,
        instagram: `${head}\n\nLink in bio.\n\n${hashtags(i)}`,
        linkedin: `${head}\n\nWe publish every listing on the same template, whichever way it went.\n\n${tail}`,
      };
    },
  },
];

/* ------------------------------------------------------------------ *
 * The weekly grid — briefs, not copy. These are the slots a human (or
 * the editorial agent) fills; the generator only emits the prompt so
 * nothing is invented from thin air by a template.
 * ------------------------------------------------------------------ */
export const WEEKLY_GRID = {
  1: { slot: 'The week ahead', brief: 'What opens, closes, lists and allots this week. Source: /calendar.' },
  2: { slot: 'Explainer', brief: 'One glossary term, one carousel or Short. Source: /glossary.' },
  3: { slot: 'Data card', brief: 'One real chart from our own data. Source: /subscription or /performance.' },
  4: { slot: 'Product', brief: 'One feature, or one family-apply use case. Source: app screens.' },
  5: { slot: 'Week in review', brief: 'Allotments and listings settled this week. Source: /performance.' },
  6: { slot: 'Beginner Short', brief: 'One beginner question answered on camera. Source: content bank.' },
  0: { slot: 'Quiet', brief: 'No scheduled post. Reply to comments and DMs only.' },
};

/**
 * Lint a rendered draft. The IPO name is masked first so a company called
 * "Star Cement" or "Priority Jewels" does not trip the ratings rule.
 */
export function lint(text, ipoName) {
  const masked = ipoName ? text.split(ipoName).join('«NAME»') : text;
  const hits = [];
  for (const [re, why] of BANNED) {
    const m = masked.match(re);
    if (m) hits.push({ term: m[0], why });
  }
  return hits;
}

export function requiresEntityLine(beatId) {
  return NEEDS_ENTITY_LINE.has(beatId);
}
