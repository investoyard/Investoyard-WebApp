import { closeAt, DEFAULT_OPEN_TIME, istToday, milestoneAt, openAt } from './ipoClock';
import { stageOf, type StageInput } from './stage';

/**
 * The Moments engine — WHICH ONE THING the investor needs from us right now.
 *
 * The design handoff's big idea is "a Moments home that reshapes itself around
 * what the investor needs right now", with five states: a quiet day that looks
 * ahead, an open day, a closing day, an allotment evening and a listing
 * morning. This decides which of those it is, for which issue; what a surface
 * then DRAWS is its own business.
 *
 * IT IS PURE AND TAKES `now`, for the reason written on `stageOf`: the `TZ`
 * environment variable has no effect on Node on this box, so injecting the
 * instant is the only honest way to exercise a non-IST reader.
 *
 * IT EXPECTS THE ENRICHED RECORD, NOT THE RAW COLUMN. `stageOf` reads
 * `ipo.status`, and `Ipo.status` in the database is effectively dead — every
 * row says `upcoming` and both apps overwrite it in `enrich()` with
 * `effectiveStatus(ipo)`. Handing this a row straight out of SQL reports every
 * issue in the catalogue as quiet. That mistake has already been made once in
 * this repo, measuring a claim against the dead column and getting an answer
 * that was wrong by 120 records.
 */

export type MomentKind = 'listing' | 'allotment' | 'closing' | 'open' | 'quiet';

/** Every kind except the absence of one. */
export type ActiveMomentKind = Exclude<MomentKind, 'quiet'>;

/**
 * THE PRIORITY ORDER, AND ONLY ONE PAIR OF IT COMES FROM THE DESIGN.
 *
 * The handoff states exactly one clash — "listing morning and closing day …
 * the higher priority (listing) takes the hero" — so results lead actions.
 * The rest is extrapolated from that same principle: a result the family is
 * waiting for outranks an action that still has hours left in it.
 *
 * THAT IS A PRODUCT DECISION AND NOT AN OBVIOUS ONE: a closing deadline, once
 * missed, cannot be recovered, where a result can be read at any time. What
 * makes putting results first safe is `also` below — the losing Moment is
 * never hidden, it gets a card directly under the hero. Flip the order here
 * and nowhere else if that judgement ever changes.
 */
export const MOMENT_PRIORITY: readonly MomentKind[] = [
  'listing',
  'allotment',
  'closing',
  'open',
  'quiet',
] as const;

const RANK: Record<MomentKind, number> = {
  listing: 0,
  allotment: 1,
  closing: 2,
  open: 3,
  quiet: 4,
};

export const momentRank = (kind: MomentKind): number => RANK[kind];

/**
 * A RESULT MOMENT IS ABOUT THE FAMILY'S OWN MONEY, SO IT NEEDS THEM IN IT.
 *
 * "The hero becomes the family's results" and "the family's gain on the shares
 * they were allotted" are not statements that can be made to someone who never
 * applied. Showing them anyway is the same class of fault as the demo store
 * that minted three fake applicants into every browser: a screen asserting a
 * stake the reader does not have.
 *
 * An APPLICATION is enough, not an allotment. A family that applied and missed
 * is the one most curious on listing morning, and the hero can say so; gating
 * on an allotment would hide the Moment from exactly them.
 */
export const RESULT_MOMENTS: readonly ActiveMomentKind[] = ['listing', 'allotment'] as const;

export const requiresApplication = (kind: MomentKind): boolean =>
  kind === 'listing' || kind === 'allotment';

/**
 * MOMENTS THAT CARRY AN ACTION, AND SO MUST NEVER BE BURIED UNDER A RESULT.
 *
 * This is what U7 is actually for. Taking the second-highest candidate by rank
 * alone would, on a day holding a listing, an allotment and a closing, put the
 * ALLOTMENT in the clash card and leave the closing deadline off the screen —
 * two results stacked while the only thing with a deadline went missing.
 */
export const ACTION_MOMENTS: readonly ActiveMomentKind[] = ['closing', 'open'] as const;

export const isActionMoment = (kind: MomentKind): boolean =>
  kind === 'closing' || kind === 'open';

/**
 * The minimum an issue has to carry: whatever `stageOf` reads, plus an
 * identity. `extra` is narrowed to the open shape so this also satisfies
 * `ClockIpo`, which is what supplies the operator's own close hour.
 */
export interface MomentIpo extends StageInput {
  symbol: string;
  name?: string;
  extra?: Record<string, any> | null;
}

export interface MomentCandidate {
  kind: ActiveMomentKind;
  symbol: string;
  name?: string;
  /**
   * The instant this Moment's own event lands, for a countdown — or NULL when
   * there is nothing to count to, which the surface renders as a state rather
   * than a stopped timer (the same rule `CountdownDial` already follows).
   *
   * Allotment is always null: registrars publish when they publish, there is
   * no convention and no stored hour, so a clock here would be invented
   * precision on the one Moment people refresh hardest.
   */
  at: number | null;
  /** Did this family apply? Drives "your results" against "what it did". */
  applied: boolean;
}

export interface MomentPlan {
  /** `quiet` when nothing is live — then `hero` is null and `nextOpen` leads. */
  kind: MomentKind;
  hero: MomentCandidate | null;
  /** U7's clash card: the losing Moment, shown directly under the hero. */
  also: MomentCandidate | null;
  /** What a quiet day looks ahead to. Computed either way; ignore it otherwise. */
  nextOpen: MomentIpo | null;
  nextOpenAt: number | null;
  /** Every active Moment, hero first. */
  all: MomentCandidate[];
}

/**
 * The exchange opens at 10:00, so a listing-morning price exists from then.
 * Borrowed from `DEFAULT_OPEN_TIME` rather than restated, so one edit moves
 * both.
 */
export const LISTING_TIME = DEFAULT_OPEN_TIME;

/** "2026-10-23T19:00" and "2026-10-23" both -> "2026-10-23". */
const day = (v?: string | null): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;

/**
 * SYMBOLS ARE FOLDED TO UPPER CASE HERE, which is the opposite of the rule the
 * allotment search follows for application numbers — and the difference is in
 * the data. A symbol is canonically upper case (registrars ship them that way
 * and `titleCase` exists because of it), while 47,92,920 stored application
 * numbers contain a lower-case letter by design. Folding is safe for one and
 * destroys the other.
 */
const key = (s: string): string => s.trim().toUpperCase();

/**
 * Which Moment a single issue is in for this family, or `quiet` if none.
 *
 * A RESULT MOMENT IS TODAY ONLY. It is a *Moment*: allotment evening is the
 * evening the registrar publishes, not the fortnight afterwards, and the
 * results stay readable on the Applied tab for as long as anyone wants them.
 * Without that bound every issue the family ever applied to would queue up
 * behind today's.
 */
export function momentKindFor(ipo: MomentIpo, applied: boolean, now?: number): MomentKind {
  const today = istToday(now);
  const stage = stageOf(ipo, now);

  if (stage === 'listed') {
    return applied && day(ipo.listingDate) === today ? 'listing' : 'quiet';
  }
  if (stage === 'allotmentout') {
    return applied && day(ipo.allotmentDate) === today ? 'allotment' : 'quiet';
  }
  if (stage === 'closingtoday') return 'closing';
  if (stage === 'opentoday' || stage === 'live') return 'open';
  return 'quiet';
}

/** When this Moment's own event lands. See `MomentCandidate.at`. */
function momentAt(kind: ActiveMomentKind, ipo: MomentIpo): number | null {
  if (kind === 'listing') return milestoneAt(day(ipo.listingDate), LISTING_TIME);
  if (kind === 'allotment') return null;
  return closeAt(ipo);
}

/**
 * The whole plan: the hero, U7's clash card, and what a quiet day looks at.
 *
 * `appliedSymbols` is the set of symbols this family holds a live application
 * on. It is passed IN rather than derived here because "eligible" and "live"
 * are the apply screen's rules — PAN, demat, consent, and which statuses
 * count — and a second reading of them in here is how the two drift.
 */
export function momentPlan(
  ipos: readonly MomentIpo[],
  appliedSymbols: Iterable<string> = [],
  now?: number,
): MomentPlan {
  const applied = new Set<string>();
  for (const s of appliedSymbols) if (typeof s === 'string' && s.trim()) applied.add(key(s));

  const all: MomentCandidate[] = [];
  for (const ipo of ipos) {
    if (!ipo || typeof ipo.symbol !== 'string' || !ipo.symbol.trim()) continue;
    const did = applied.has(key(ipo.symbol));
    const kind = momentKindFor(ipo, did, now);
    if (kind === 'quiet') continue;
    all.push({
      kind,
      symbol: ipo.symbol,
      name: ipo.name,
      at: momentAt(kind, ipo),
      applied: did,
    });
  }

  /**
   * Sorted by kind, then by the sooner event, then by SYMBOL — and that last
   * tie-break is not decoration. Four issues sharing a kind and an hour is
   * ordinary, and returning 0 leaves the order to whatever the API sent, which
   * has already produced a list that rendered one issue first in one build and
   * another in the next.
   */
  all.sort((a, b) => {
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
    const at = a.at ?? Number.POSITIVE_INFINITY;
    const bt = b.at ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.symbol.localeCompare(b.symbol);
  });

  const hero = all[0] ?? null;

  /**
   * The clash card prefers an ACTION over a second result — see
   * `ACTION_MOMENTS`. Falling back to any differing kind keeps the card
   * useful on a day that holds two results and no deadline.
   */
  let also: MomentCandidate | null = null;
  if (hero) {
    const others = all.filter((c) => c.kind !== hero.kind);
    also = others.find((c) => isActionMoment(c.kind)) ?? others[0] ?? null;
  }

  const upcoming = ipos
    .filter((ipo) => {
      if (!ipo || !day(ipo.openDate)) return false;
      const stage = stageOf(ipo, now);
      return stage === 'upcoming' || stage === 'preapply';
    })
    .sort((a, b) => {
      const ad = day(a.openDate) ?? '';
      const bd = day(b.openDate) ?? '';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.symbol.localeCompare(b.symbol);
    });

  const nextOpen = upcoming[0] ?? null;

  return {
    kind: hero ? hero.kind : 'quiet',
    hero,
    also,
    nextOpen,
    nextOpenAt: nextOpen ? openAt(nextOpen) : null,
    all,
  };
}
