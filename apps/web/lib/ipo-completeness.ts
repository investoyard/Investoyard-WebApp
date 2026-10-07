/**
 * IPO detail completeness — the score behind the admin catalog progress bar.
 *
 * Operator ask (2026-09-09): every row on Admin → IPO List carries a bar
 * showing how much of the IPO's detail has been filled in. Click to see
 * WHICH fields are missing, with a jump-to-edit link per group.
 *
 * Design:
 *   - 22 SCORED checks, grouped into 6 buckets, EQUAL WEIGHT. One perm per
 *     check keeps the score transparent — an operator ticks off items one by
 *     one and the bar moves in obvious steps.
 *   - The score measures the DETAIL a reader sees. The three "Application
 *     rail" checks — ASBA PDF template, print form series, bid rail
 *     integration — are STILL SHOWN, with their own 2/3 count, but are
 *     `excluded` from the percentage (operator decision, 2026-09-23). They
 *     gate whether an issue can be APPLIED for, not whether its page is
 *     complete, and no report reads them, so a fully documented issue used
 *     to sit at 88% because nobody had uploaded an ASBA template. Removing
 *     them outright was the first attempt and was wrong: the operator still
 *     wants to SEE the rail state at a glance, just not have it move the bar.
 *   - TWO ways a check leaves the score, and they are not the same:
 *     `excluded` = shown, never counted. `skipped` = neither shown nor
 *     counted, for a check that does not apply to this issue at all.
 *   - "Filled" is deliberately LIBERAL — a truthy scalar, a non-empty
 *     array, an object with keys — so the bar reflects "did the operator
 *     enter something" rather than "did they enter the RIGHT thing"
 *     (validation errors are handled separately by the form's `derived.issues`).
 *
 * Pure data function — no side effects, no I/O. Kept in apps/web because
 * only the admin surface uses it; nothing on the consumer path scores
 * completeness. If mobile ever grows an admin console, promote to
 * packages/shared-types.
 */

export type CompletenessGroup =
  | 'Identity' | 'Pricing' | 'Structure' | 'Dates' | 'Parties' | 'Documents' | 'Application rail';

export interface CompletenessCheck {
  key: string;
  label: string;
  group: CompletenessGroup;
  filled: boolean;
  /** Shown in the breakdown with its own count, but kept OUT of the score. */
  excluded?: boolean;
  /** Neither shown nor counted — the check doesn't apply to this issue. */
  skipped?: boolean;
  /**
   * NOT APPLICABLE to this issue — shown, but there is NOTHING TO DO and it
   * counts nowhere: not in the score, not in its group's n/m.
   *
   * The third state, added 2026-10-07, and the distinction from `excluded` is
   * the whole point. An excluded check is REAL WORK that simply does not belong
   * in a page-completeness score — an ASBA template can be uploaded, so a ✗
   * against it is honest. An `na` check can never be satisfied by anyone: an
   * OFS-only issue has no fresh leg, and a ✗ there says "missing" about
   * something that does not exist.
   *
   * The operator caught this the day after the single-leg rule shipped: the
   * headline read complete while the breakdown read `Structure 2/3` with a ✗
   * beside Fresh issue. The score was right and the badge was wrong — the row
   * had been marked `excluded`, whose RENDERING was built for the Application
   * rail, where every check in the group carries the flag.
   */
  na?: boolean;
}

export interface Completeness {
  filled: number;
  total: number;
  pct: number;
  checks: CompletenessCheck[];
  missing: CompletenessCheck[];
}

/** Is this value considered "filled"? Deliberately permissive — see file doc. */
function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return true;
}

/** Fresh / OFS leg is filled when its `basis` isn't 'none' and its value
 *  is a positive number. The form stores { basis, value } where basis is
 *  'amount' | 'percent' | 'shares' | 'none' — 'none' means the operator
 *  hasn't declared this leg exists on the issue. */
function legFilled(leg: any): boolean {
  if (!leg || leg.basis === 'none' || leg.basis == null) return false;
  const v = Number(leg.value ?? leg.amountCr ?? 0);
  return Number.isFinite(v) && v > 0;
}

/**
 * THE OPERATOR HAS DECLARED THIS LEG DOES NOT EXIST: a real unit chosen on the
 * dropdown (₹ Cr or Shares) with a value of exactly 0.
 *
 * This is a POSITIVE ACT and that is the whole reason it can be trusted. The
 * field defaults to *Not set* with an empty value, so nobody picks a unit and
 * types 0 by accident — whereas "Not set" itself cannot carry the meaning,
 * because it is also the state of every record nobody has opened. (That was my
 * first proposal and it was wrong: persisting `basis: 'none'` would have
 * stamped the default onto untouched records and recreated the very ambiguity
 * it was meant to remove. The operator's suggestion is the better design and
 * needs less code — 2026-10-07.)
 *
 * It is deliberately NOT inferred from the other leg being filled. "OFS entered
 * and Fresh not" is the same stored state as "OFS entered, Fresh not reached
 * yet", and guessing would hide a real gap behind a "nothing to do" — which is
 * worse than a wrong ✗, because a wrong ✗ is noise while a wrong n/a is an item
 * the operator is never prompted about again.
 *
 * Only the OBJECT shape counts. The importer's flat `freshIssueCr` / `ofsCr`
 * keys carry no basis, so a 0 there is indistinguishable from an empty cell.
 */
function legDeclaredAbsent(leg: any): boolean {
  if (!leg || typeof leg !== 'object') return false;
  if (leg.basis !== 'amount' && leg.basis !== 'shares') return false;
  const raw = leg.value ?? leg.amountCr;
  if (raw == null || raw === '') return false;
  return Number(raw) === 0;
}

/** Reservation table filled = the map exists AND its `pct` values sum near 100. */
function reservationFilled(extra: any): boolean {
  const t = extra?.shareResv;
  if (!t || typeof t !== 'object') return false;
  const entries = Object.values(t as Record<string, any>).filter((r: any) => r && r.on !== false);
  if (!entries.length) return false;
  const sum = entries.reduce((a, r: any) => a + (Number(r?.pct) || 0), 0);
  return sum >= 99.5 && sum <= 100.5;
}

/**
 * Compute the completeness score. `ipo` is a full row from `fetchIpos({all:true})`
 * — the admin catalog page already holds this shape.
 */
export function computeIpoCompleteness(ipo: any): Completeness {
  const extra = ipo?.extra ?? {};
  const docs: any[] = Array.isArray(ipo?.documents) ? ipo.documents : [];
  const leads: any[] = Array.isArray(extra?.leads) ? extra.leads : Array.isArray(ipo?.leadManagers) ? ipo.leadManagers : [];
  const exchanges: string[] = Array.isArray(ipo?.exchanges) ? ipo.exchanges : [];

  const raw: CompletenessCheck[] = [
    // Identity (5)
    { key: 'symbol',     label: 'Symbol',                    group: 'Identity', filled: has(ipo?.symbol) },
    { key: 'name',       label: 'Full name',                 group: 'Identity', filled: has(ipo?.name) },
    { key: 'category',   label: 'Category (Board + type)',   group: 'Identity', filled: has(ipo?.type) && (has(extra?.categoryName) || ipo.type === 'mainboard' || ipo.type === 'sme') },
    // Face value is persisted in `extra.faceValue` (the form field); some
    // records also carry a top-level `faceValue`. Check both.
    { key: 'faceValue',  label: 'Face value',                group: 'Identity', filled: has(ipo?.faceValue) || has(extra?.faceValue) },
    { key: 'isin',       label: 'ISIN',                      group: 'Identity', filled: has(ipo?.isin) },

    // Pricing (4)
    { key: 'priceMin',   label: 'Price band — min',          group: 'Pricing',  filled: has(ipo?.priceBandMin) },
    { key: 'priceMax',   label: 'Price band — max',          group: 'Pricing',  filled: has(ipo?.priceBandMax) || ipo?.mechanism === 'fixed_price' },
    { key: 'lotSize',    label: 'Lot size',                  group: 'Pricing',  filled: has(ipo?.lotSize) },
    { key: 'issueSize',  label: 'Issue size (₹ Cr)',         group: 'Pricing',  filled: has(ipo?.issueSizeCr) || has(extra?.issueSizeCr) || has(ipo?.issueSize) },

    // Structure (3). Fresh / OFS are saved as `{ basis, value }` under
    // `extra.fresh` / `extra.ofs` — `basis` says whether `value` is in
    // ₹ Cr, %, or shares. Any non-'none' basis + positive value counts.
    /*
     * AN ISSUE MAY HAVE ONLY ONE LEG, AND THAT IS COMPLETE — but ONLY when the
     * operator has SAID SO (operator, 2026-10-07: "no fresh issue in this IPO,
     * I set it to zero, why is it still pending").
     *
     * `legFilled` needs a POSITIVE value, so a leg correctly declared absent
     * could never be satisfied and the score sat under 100% with nothing anyone
     * could do about it. HD Fire Protect is pure OFS and says so on its own
     * card ("-----No Fresh Issue-----"); a fresh-only issue, the commoner shape
     * by far, had the identical fault on the OFS row.
     *
     * THE DECLARATION IS A UNIT PLUS A ZERO — see `legDeclaredAbsent`. It is
     * emphatically NOT inferred from the other leg being filled: that would
     * read "OFS entered, Fresh not reached yet" as "this issue has no fresh
     * leg" and hide a real gap behind a "nothing to do".
     *
     * `na`, not `excluded` and not `skipped`: the row stays VISIBLE — so "this
     * issue has no fresh leg" is something the operator can see rather than a
     * field that vanished — but it carries no ✗ and counts in no total, because
     * there is nothing anyone could ever do about it.
     */
    ...(() => {
      const fresh = legFilled(extra?.fresh) || has(extra?.freshIssueCr);
      const ofs = legFilled(extra?.ofs) || has(extra?.ofsCr);
      return [
        { key: 'freshCr', label: 'Fresh issue (₹ Cr)', group: 'Structure' as const, filled: fresh, na: legDeclaredAbsent(extra?.fresh) },
        { key: 'ofsCr', label: 'OFS (₹ Cr)', group: 'Structure' as const, filled: ofs, na: legDeclaredAbsent(extra?.ofs) },
      ];
    })(),
    { key: 'shareResv',  label: 'Reservation table',        group: 'Structure', filled: reservationFilled(extra) },

    // Dates (5)
    { key: 'anchorDate',    label: 'Anchor date',             group: 'Dates',    filled: has(ipo?.anchorDate) || has(extra?.anchorDate) },
    { key: 'openDate',      label: 'Issue open',              group: 'Dates',    filled: has(ipo?.openDate) },
    { key: 'closeDate',     label: 'Issue close',             group: 'Dates',    filled: has(ipo?.closeDate) },
    { key: 'allotmentDate', label: 'Basis of allotment',      group: 'Dates',    filled: has(ipo?.allotmentDate) },
    { key: 'listingDate',   label: 'Listing date',            group: 'Dates',    filled: has(ipo?.listingDate) },

    // Parties (3)
    { key: 'registrar',  label: 'Registrar',                 group: 'Parties',   filled: has(ipo?.registrar) },
    { key: 'leads',      label: 'Lead managers',             group: 'Parties',   filled: leads.length > 0 },
    { key: 'exchanges',  label: 'Exchanges',                 group: 'Parties',   filled: exchanges.length > 0 },

    // Documents (2) — a row counts as filled when EITHER the type matches
    // AND the row has a URL (uploaded PDF or external link), OR the URL
    // itself mentions the doc kind. Any Prospectus / RHP / DRHP counts for
    // the corresponding check regardless of source (operator ask
    // 2026-09-22: 'either PDF upload OR add link — both should be done').
    //
    // Compare case-insensitively (form saves 'DRHP' / 'RHP' uppercase per
    // DOC_TYPES). Also check the URL for 'drhp' / 'rhp' fragments — a
    // link mislabeled as 'Other' with a SEBI DRHP URL should still count.
    { key: 'drhp',       label: 'DRHP link / file',          group: 'Documents', filled:
        has(ipo?.drhpUrl) ||
        docs.some((d) => {
          const t = String(d?.type ?? '').toLowerCase();
          const u = String(d?.url ?? '').toLowerCase();
          return has(d?.url) && (t === 'drhp' || u.includes('drhp'));
        }) },
    { key: 'rhp',        label: 'RHP link / file',           group: 'Documents', filled:
        has(ipo?.rhpUrl) ||
        docs.some((d) => {
          const t = String(d?.type ?? '').toLowerCase();
          const u = String(d?.url ?? '').toLowerCase();
          if (!has(d?.url)) return false;
          if (t === 'rhp' || t === 'prospectus') return true;
          // /rhp filename or "prospectus" in the URL path
          return /(?:^|\/|_|-)rhp[._-]/.test(u) || u.includes('prospectus');
        }) },

    // Application rail (3) — SHOWN with its own count, never scored.
    { key: 'asba',       label: 'Application PDF template',  group: 'Application rail', excluded: true, filled: docs.some((d) => typeof d?.type === 'string' && d.type.startsWith('asba_form') && has(d?.url)) },
    { key: 'series',     label: 'Application series for PDF', group: 'Application rail', excluded: true, filled: has(extra?.printFormSeries) || has(extra?.pdfSeries) || has(extra?.printSeries) },
    { key: 'bid',        label: 'Bid rail integration',       group: 'Application rail', excluded: true, filled: has(extra?.bidding) || has(extra?.exchangeSymbol) || ipo?.startBid === true },
  ];

  // `excluded` leaves the score but stays in `checks` so the breakdown can
  // still render it; `skipped` leaves both.
  const active = raw.filter((c) => !c.skipped && !c.excluded && !c.na);
  const filled = active.filter((c) => c.filled).length;
  const total = active.length;
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const missing = active.filter((c) => !c.filled);
  return { filled, total, pct, checks: raw, missing };
}

/** Groups in display order — mirrors the operator's IPO form tab flow. */
export const COMPLETENESS_GROUPS: CompletenessGroup[] = [
  'Identity', 'Pricing', 'Structure', 'Dates', 'Parties', 'Documents', 'Application rail',
];
