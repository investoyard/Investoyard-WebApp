/**
 * ASBA print form — which blank we print on, and which number series that
 * form's number comes from.
 *
 * THESE TWO QUESTIONS HAVE ONE ANSWER AND MUST HAVE ONE RESOLVER. A form
 * number printed on a Syndicate blank has to come from the Syndicate range;
 * two functions deciding that separately is exactly how they drift, which
 * this codebase has already paid for with `FailPct`, `shownCount` and the
 * three mappers into `computeIssue`.
 *
 * It lives here rather than in `applications.service.ts` for the same reason
 * `offeredFromIpo`, `parseAnchorRows` and `offerTotals` moved out of the files
 * that hid them: the service pulls in Prisma's `Decimal`, which will not
 * compile under the test tsconfig, so nothing in it can be reached by a test.
 * The one impure part — does the blank actually exist on disk — stays in the
 * service, which is the only thing that can answer it.
 *
 * Operator's model (16 Oct 2026): THREE series per IPO *partner*. You pick the
 * partner and can swap it; that partner's three ranges go live together.
 * ASBA_SERIES_FALLBACK is the DEFAULT range — any type you have not entered
 * draws from it. It was `resident` until 16 Oct 2026 and is now `syndicate`.
 */
import { ASBA_SYNDICATE_ABOVE } from './issueRules';

/** The four blanks an operator can upload. `single` is the SME/NCD form. */
export type AsbaDocType =
  | 'asba_form_resident'
  | 'asba_form_syndicate'
  | 'asba_form_single'
  | 'asba_form_shareholder';

/**
 * The three number series an operator enters per partner.
 *
 * There is deliberately NO `single`: an SME issue prints the `asba_form_single`
 * blank and draws its number from ASBA_SERIES_FALLBACK, the default range.
 * A fourth slot nobody fills is a fourth thing to keep in step.
 */
export type AsbaSeriesKind = 'resident' | 'syndicate' | 'shareholder';

/**
 * Display order, AND the order the operator reads them in on the admin panel.
 * The fallback kind leads, because the first row is the one that serves
 * everything else when nothing more specific has been entered.
 */
export const ASBA_SERIES_KINDS: readonly AsbaSeriesKind[] = ['syndicate', 'resident', 'shareholder'] as const;

/**
 * THE DEFAULT RANGE — what any form type draws from when it has no range of
 * its own, and where a single-range issue (SME, NCD) puts its one entry.
 *
 * Changed from `resident` to `syndicate` on 16 Oct 2026 on sir's instruction.
 * It is a single constant rather than a value repeated at each decision point
 * precisely so that this is one edit: the resolver, the SME slot, the legacy
 * row's home and the panel's ordering all read it.
 */
export const ASBA_SERIES_FALLBACK: AsbaSeriesKind = 'syndicate';

/** Customer-facing names — the operator's words, used on the admin panel. */
export const ASBA_SERIES_LABEL: Record<AsbaSeriesKind, string> = {
  resident: 'Physical Resident Form',
  syndicate: 'Syndicate ASBA Form',
  shareholder: 'Shareholders Form',
};

/** One row of `Ipo.extra.pdfSeries`. Every field is optional — legacy rows carry no `kind`. */
export interface PdfSeriesRow {
  member?: string | null;
  kind?: string | null;
  from?: string | number | null;
  to?: string | number | null;
  /** Legacy single-row selector. Superseded by `extra.pdfSeriesMember`; still read as a fallback. */
  active?: boolean;
}

export interface AsbaFormInput {
  board: 'mainboard' | 'sme';
  /** NCD/debt issues use the single form whatever the board says. */
  isNcd?: boolean;
  applicantType?: string | null;
  amount: number;
}

export interface SeriesIssue {
  code: string;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const num = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** A row is usable only once it has a `from`; an empty slot must fall through. */
export const seriesRowFilled = (r?: PdfSeriesRow | null): boolean => num(r?.from) !== null;

/**
 * Normalise a stored `kind`. Tolerates the `asba_form_` prefix in case a row
 * was written with the document-type string, and maps `single` onto the default
 * — the same mapping `seriesKindForDoc` makes, so the two cannot disagree.
 * Anything unrecognised (including a legacy row with no kind at all) → null.
 */
export function normSeriesKind(k: unknown): AsbaSeriesKind | null {
  const s = norm(k).replace(/^asba_form_/, '');
  if (s === 'resident' || s === 'syndicate' || s === 'shareholder') return s;
  if (s === 'single') return ASBA_SERIES_FALLBACK;
  return null;
}

/**
 * The blanks to try, best first.
 *
 * Reproduces the long-standing ladder exactly: a shareholder applicant tries
 * the shareholder blank first and falls through to the ordinary amount-based
 * pick when it was never uploaded; everything then falls back to the single
 * form and finally to any ASBA blank at all. The only change is that the last
 * resort is now a FIXED order rather than whatever order `documents` arrived
 * in — the same inputs used to be able to pick different forms.
 */
export function asbaDocOrder(i: AsbaFormInput): AsbaDocType[] {
  const mainboard = i.board === 'mainboard' && !i.isNcd;
  const byAmount: AsbaDocType = mainboard
    ? (i.amount > ASBA_SYNDICATE_ABOVE ? 'asba_form_syndicate' : 'asba_form_resident')
    : 'asba_form_single';
  const order: AsbaDocType[] = [];
  if (norm(i.applicantType) === 'shareholder') order.push('asba_form_shareholder');
  order.push(byAmount, 'asba_form_single', 'asba_form_resident', 'asba_form_syndicate', 'asba_form_shareholder');
  return order.filter((t, n) => order.indexOf(t) === n);
}

/** What we WANT before looking at what is uploaded — the head of the ladder. */
export const intendedAsbaDoc = (i: AsbaFormInput): AsbaDocType => asbaDocOrder(i)[0];

/**
 * The series a given blank draws its number from.
 *
 * Keyed on the form that ACTUALLY printed, never on the one we wanted: if an
 * issue offers a shareholder quota but no shareholder blank was uploaded, the
 * ladder prints a Resident form, and a Shareholder number on a Resident form
 * is worse than the quota being invisible.
 */
export function seriesKindForDoc(doc?: AsbaDocType | null): AsbaSeriesKind {
  if (doc === 'asba_form_syndicate') return 'syndicate';
  if (doc === 'asba_form_shareholder') return 'shareholder';
  if (doc === 'asba_form_resident') return 'resident';
  // The SME/NCD single blank, and anything unrecognised, take the default range.
  return ASBA_SERIES_FALLBACK;
}

/**
 * Which partner's ranges are live.
 *
 * ONE value (`extra.pdfSeriesMember`), not a flag per row: three booleans that
 * must agree is how an IPO ends up with two active partners and numbers coming
 * from a range nobody chose. The legacy per-row `active` is still read, so the
 * 40 IPOs configured before this change resolve to exactly what they do today.
 */
export function activeSeriesMember(rows: PdfSeriesRow[] | null | undefined, explicit?: string | null): string | null {
  const list = (Array.isArray(rows) ? rows : []).filter(seriesRowFilled);
  if (!list.length) return null;
  const want = String(explicit ?? '').trim();
  if (want && list.some((r) => norm(r.member) === norm(want))) return want;
  const act = list.find((r) => r.active === true);
  return String((act ?? list[0]).member ?? '');
}

/**
 * The range to allocate from: the asked-for kind → the DEFAULT kind → any row this
 * partner has. That tail is the operator's rule verbatim — "if any one is
 * entered, use it for all three" — and it is also what makes a legacy row,
 * which carries no kind at all, keep working untouched.
 *
 * Empty slots are filtered out first, so a half-filled panel falls through
 * rather than resolving to a range with no `from`.
 */
export function pickSeriesRow(
  rows: PdfSeriesRow[] | null | undefined,
  member: string | null,
  kind: AsbaSeriesKind,
): PdfSeriesRow | null {
  if (member === null) return null;
  const mine = (Array.isArray(rows) ? rows : []).filter(
    (r) => seriesRowFilled(r) && norm(r.member) === norm(member),
  );
  if (!mine.length) return null;
  return (
    mine.find((r) => normSeriesKind(r.kind) === kind) ??
    mine.find((r) => normSeriesKind(r.kind) === ASBA_SERIES_FALLBACK) ??
    mine.find((r) => normSeriesKind(r.kind) === null) ?? // legacy row, no kind
    mine[0]
  );
}

/**
 * Everything the allocator needs, resolved together.
 * `docType` is what the service actually found on disk — pass it in.
 */
export function resolveSeriesRange(
  extra: { pdfSeries?: unknown; pdfSeriesMember?: unknown } | null | undefined,
  docType?: AsbaDocType | null,
): { member: string | null; kind: AsbaSeriesKind; row: PdfSeriesRow | null } {
  const rows = Array.isArray(extra?.pdfSeries) ? (extra!.pdfSeries as PdfSeriesRow[]) : [];
  const member = activeSeriesMember(rows, extra?.pdfSeriesMember as string | undefined);
  const kind = seriesKindForDoc(docType);
  return { member, kind, row: pickSeriesRow(rows, member, kind) };
}

/**
 * Admin-form validation.
 *
 * Both blocking rules only start to matter once there is more than one range,
 * which is why no existing IPO violates either — and why they have to land
 * with the feature rather than after it:
 *  - an open-ended range has an upper bound of Infinity and will swallow the
 *    next series' numbers, because the allocator's scan is bounded by [from,to];
 *  - overlapping ranges are cross-contamination between form types for the
 *    same reason.
 */
export function seriesIssues(rows: PdfSeriesRow[] | null | undefined): SeriesIssue[] {
  const list = (Array.isArray(rows) ? rows : []).filter(seriesRowFilled);
  const out: SeriesIssue[] = [];
  const where = (r: PdfSeriesRow) => {
    const k = normSeriesKind(r.kind);
    return `${String(r.member ?? '').trim() || 'unnamed partner'} · ${k ? ASBA_SERIES_LABEL[k] : 'unassigned'}`;
  };

  for (const r of list) {
    const f = num(r.from), t = num(r.to);
    if (t === null && list.length > 1) {
      out.push({ code: 'S-OPEN', severity: 'blocking',
        message: `${where(r)}: enter a "To" number. With more than one series an open-ended range takes numbers that belong to the next one.` });
    }
    if (f !== null && t !== null && f > t) {
      out.push({ code: 'S-ORDER', severity: 'blocking', message: `${where(r)}: "From" (${f}) is after "To" (${t}).` });
    }
  }

  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const fa = num(list[a].from)!, fb = num(list[b].from)!;
      const ta = num(list[a].to) ?? Infinity, tb = num(list[b].to) ?? Infinity;
      if (fa <= tb && fb <= ta) {
        out.push({ code: 'S-OVERLAP', severity: 'blocking',
          message: `${where(list[a])} and ${where(list[b])} overlap. Two form types cannot draw from the same numbers.` });
      }
    }
  }
  return out;
}

/**
 * What a given partner's panel will actually do, for the hint under each empty
 * slot. Says which range a type will borrow rather than leaving the operator to
 * work it out from the fallback rule.
 */
export function seriesFallbackNote(
  rows: PdfSeriesRow[] | null | undefined,
  member: string | null,
  kind: AsbaSeriesKind,
): string | null {
  const row = pickSeriesRow(rows, member, kind);
  if (!row) return 'No series entered — forms will print without a number.';
  if (normSeriesKind(row.kind) === kind) return null; // it has its own range
  const k = normSeriesKind(row.kind);
  return `Will use ${k ? ASBA_SERIES_LABEL[k] : 'the entered'} range (${row.from}–${row.to ?? '…'}).`;
}
