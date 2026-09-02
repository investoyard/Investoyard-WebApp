/**
 * THE OPERATIONAL CONTRACT — Layer 1 of the launch structure.
 *
 * Every field an IPO record can carry is classified here, exactly once. The
 * point is not documentation; it is that `extra` is a single JSON column with
 * no schema, so without this file nobody can tell whether a key is load-bearing
 * or decoration. Before it existed, the reservation table that drives the bid
 * engine sat beside the company write-up that only fills a web page, and every
 * new reporting field landed in the same blob the bid engine reads.
 *
 * The buckets and what they promise:
 *
 *   OPERATIONAL  Load-bearing. Displaying an IPO, printing an ASBA form, taking
 *                a bid, or answering the partner API all depend on these.
 *                FROZEN: additive-with-default is allowed, renames and removals
 *                are breaking changes and need a version bump.
 *
 *   CONTENT      Shown on the public detail page and always optional. An issue
 *                is fully operable with every one of these blank, which is why
 *                they are not in the frozen set even though they are displayed.
 *
 *   REPORTING    Read by reports and by nothing else. Add, rename or drop these
 *                freely — no operational code path and no partner response
 *                changes. This is the bucket that is allowed to keep growing.
 *
 *   DEAD         Removed from the entry form but still present on legacy rows.
 *                Never written again. Listed so they are not mistaken for live
 *                fields and quietly revived.
 *
 *   ALIAS        The same fact stored twice in incompatible shapes, pending
 *                consolidation. Each entry names the key that wins.
 *
 * `partnerV1View()` at the bottom is the mechanism the whole split exists for:
 * the partner API serialises OPERATIONAL + CONTENT and nothing else, so adding
 * a reporting field can never alter a partner response.
 */

/* ── Layer 1: real columns on Ipo ─────────────────────────────────────────── */

export const OPERATIONAL_COLUMNS = [
  'symbol', 'name', 'type', 'instrument', 'exchanges', 'status', 'hidden',
  'openDate', 'closeDate', 'allotmentDate', 'listingDate',
  'priceBandMin', 'priceBandMax', 'lotSize', 'minAmount', 'issueSize',
  'isin', 'registrar', 'logoUrl', 'objectsOfIssue',
  'reservations', 'listingGainPct',
  'autoPollSubscription', 'subscriptionAsOf',
] as const;

/* ── Layer 1: the operational subset of `extra` ───────────────────────────── */

export const OPERATIONAL_EXTRA = [
  // classification and pricing
  'faceValue', 'categoryName', 'tickSize', 'sector', 'industry',
  'mechanism', 'regulationBasis',
  'retailDiscount', 'employeeDiscount', 'shareholderDiscount', 'finalIssuePrice',
  // offer structure — every derived figure comes off these
  'issueSizeCr', 'totalShares', 'fresh', 'ofs', 'carveouts', 'shareResv', 'resvRemarks',
  // anchor PORTION (the roster is content; see below)
  'anchorPct', 'anchorMfPct', 'anchorShares', 'anchorPrice',
  'lockin1Pct', 'lockin1Days', 'lockin2Days',
  // per-applicant rules
  'empMaxPerApplicant', 'empInitialPerApplicant', 'minSubscriptionPct',
  // payment + timing
  'upiMandateCutoff', 'sponsorBank',
  'openDate', 'closeDate', 'qibCloseDate', 'dematDate', 'refundDate', 'anchorDate',
  // intermediaries and printing
  'registrarEmail', 'registrarPhone', 'registrarUrl',
  'leads', 'partners', 'pdfSeries', 'onlineSeries', 'asbaNames',
  // operator gates
  'startBid', 'startPrint',
  // listing outcome — a public figure on every listed issue
  'nseListingPrice', 'bseListingPrice',
  // the importer's copy; the `exchanges` COLUMN wins when both are present
  'exchanges',
] as const;

/* ── Public detail-page prose. Optional by definition ─────────────────────── */

export const CONTENT_EXTRA = [
  'companyDescription', 'companyStrength', 'companyFinancials',
  'contactInfo', 'companyWebsite', 'companyPromoter', 'faqs',
  // the anchor ROSTER. Displayed today; moves to its own table because five of
  // the eight anchor reports group by investor across every IPO, which a JSON
  // blob cannot serve.
  'anchors',
] as const;

/* ── Layer 2: reports only ────────────────────────────────────────────────── */

export const REPORTING_EXTRA = [
  'applicationsReceived',
  // provenance and feed bookkeeping
  'importedAt', 'gmpSourceId', 'gmpLog', 'subLog', 'finalSub',
] as const;

/* ── Removed from the form; still on legacy rows. Never written again ─────── */

export const DEAD_EXTRA = [
  'maxAmtRetail',   // the retail ceiling is RETAIL_MAX_AMOUNT, not per-issue
  'retailCutOff',   // derived: price cap minus the retail discount (spec B23)
  'sharesSize',     // the Shares Size grid was dropped
  'ncdMaxSeries',   // NCD columns were dropped
  'resvRemarks2',   // Remarks 2 was dropped
] as const;

/**
 * The same fact stored twice. Each entry names the key that WINS, and the loser
 * is migrated then stopped.
 *
 * `freshIssueCr` and friends are the reason the coverage review reported
 * Fresh/OFS as "0 records": the Excel importer writes these flat keys while the
 * form and the issue engine read `fresh` / `ofs` as objects. 596 records hold a
 * fresh-issue share count and 273 an OFS share count that nothing has ever read.
 */
export const ALIAS_EXTRA: { alias: string; wins: string; note: string }[] = [
  { alias: 'freshIssueCr', wins: 'fresh', note: "importer flat key → { basis: 'amount', value }" },
  { alias: 'freshIssueShares', wins: 'fresh', note: "importer flat key → { basis: 'shares', value }" },
  { alias: 'ofsCr', wins: 'ofs', note: "importer flat key → { basis: 'amount', value }" },
  { alias: 'ofsShares', wins: 'ofs', note: "importer flat key → { basis: 'shares', value }" },
  { alias: 'noOfApp', wins: 'applicationsReceived', note: 'legacy name, mirrored on write' },
  { alias: 'issueType', wins: 'mechanism', note: 'holds the PRICING METHOD as free text, not an issue type' },
];

/* ── Derived sets and the checks that keep this file honest ───────────────── */

export type OperationalColumn = (typeof OPERATIONAL_COLUMNS)[number];
export type OperationalExtraKey = (typeof OPERATIONAL_EXTRA)[number];

const asSet = (a: readonly string[]) => new Set<string>(a);

export const OPERATIONAL_EXTRA_SET = asSet(OPERATIONAL_EXTRA);
export const CONTENT_EXTRA_SET = asSet(CONTENT_EXTRA);
export const REPORTING_EXTRA_SET = asSet(REPORTING_EXTRA);
export const DEAD_EXTRA_SET = asSet(DEAD_EXTRA);
export const ALIAS_EXTRA_SET = asSet(ALIAS_EXTRA.map((a) => a.alias));

/** Every key this file knows about, in any bucket. */
export const CLASSIFIED_EXTRA_KEYS: string[] = [
  ...OPERATIONAL_EXTRA, ...CONTENT_EXTRA, ...REPORTING_EXTRA,
  ...DEAD_EXTRA, ...ALIAS_EXTRA.map((a) => a.alias),
];

export type ExtraBucket = 'operational' | 'content' | 'reporting' | 'dead' | 'alias' | 'unclassified';

/**
 * Which bucket a key falls in. `unclassified` is the useful answer: it means a
 * key reached the database without anyone deciding what it is, which is exactly
 * the drift this file exists to catch.
 */
export function bucketOf(key: string): ExtraBucket {
  if (OPERATIONAL_EXTRA_SET.has(key)) return 'operational';
  if (CONTENT_EXTRA_SET.has(key)) return 'content';
  if (REPORTING_EXTRA_SET.has(key)) return 'reporting';
  if (DEAD_EXTRA_SET.has(key)) return 'dead';
  if (ALIAS_EXTRA_SET.has(key)) return 'alias';
  return 'unclassified';
}

/** Keys present on a record that this file does not account for. */
export function unclassifiedKeys(extra: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(extra ?? {}).filter((k) => bucketOf(k) === 'unclassified');
}

/**
 * What the partner API v1 serialises: the operational contract plus optional
 * content, and nothing else.
 *
 * This is the promise the layering buys — a partner integrating today keeps
 * working through every reporting field we ever add, because reporting keys
 * cannot reach this projection. Reporting data, when partners want it, gets its
 * own endpoints rather than widening these.
 */
/**
 * Read an offer leg, whichever shape it was stored in.
 *
 * The entry form writes `fresh` / `ofs` as `{ basis, value }`. The Excel
 * importer writes four flat keys instead — `freshIssueCr`, `freshIssueShares`,
 * `ofsCr`, `ofsShares` — and nothing ever read them, which is why the coverage
 * review reported Fresh/OFS as absent on all 1,207 records when in fact 596
 * carried a fresh-issue share count and 273 an OFS share count.
 *
 * The object shape wins when both are present: it is what the operator last
 * typed. A share count outranks a rupee figure within the flat keys, being the
 * exact number the offer document states rather than a rounded ₹ Cr.
 */
export function offerLegFrom(
  extra: Record<string, any> | null | undefined,
  leg: 'fresh' | 'ofs',
): { basis: 'shares' | 'amount'; value: number } | undefined {
  const x = extra ?? {};
  const obj = x[leg];
  if (obj && typeof obj === 'object' && Number(obj.value) > 0 && obj.basis && obj.basis !== 'none') {
    return { basis: obj.basis, value: Number(obj.value) };
  }
  const sharesKey = leg === 'fresh' ? 'freshIssueShares' : 'ofsShares';
  const crKey = leg === 'fresh' ? 'freshIssueCr' : 'ofsCr';
  const shares = Number(x[sharesKey]);
  if (Number.isFinite(shares) && shares > 0) return { basis: 'shares', value: shares };
  const cr = Number(x[crKey]);
  if (Number.isFinite(cr) && cr > 0) return { basis: 'amount', value: cr };
  return undefined;
}

export function partnerV1Extra(extra: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    if (OPERATIONAL_EXTRA_SET.has(k) || CONTENT_EXTRA_SET.has(k)) out[k] = v;
  }
  return out;
}
