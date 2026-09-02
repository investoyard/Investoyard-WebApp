/**
 * The contract is only worth having if something enforces it. These tests are
 * what stop a field quietly joining or leaving the frozen set.
 *
 * The key list below is the 48 keys actually present in the live database on
 * 2 September 2026 plus every key the entry form writes. If a new key reaches a
 * record without being classified, `unclassifiedKeys` reports it and the last
 * test here fails — which is the whole mechanism.
 */
import {
  OPERATIONAL_COLUMNS, OPERATIONAL_EXTRA, CONTENT_EXTRA, REPORTING_EXTRA,
  DEAD_EXTRA, ALIAS_EXTRA, CLASSIFIED_EXTRA_KEYS,
  bucketOf, unclassifiedKeys, partnerV1Extra, offerLegFrom,
} from './operationalContract';

/** Every key the IPO entry form writes into `extra`, read off payload(). */
const FORM_WRITES = [
  'issueType', 'faceValue', 'categoryName', 'retailDiscount', 'applicationsReceived', 'noOfApp',
  'mechanism', 'regulationBasis', 'issueSizeCr', 'tickSize', 'employeeDiscount',
  'shareholderDiscount', 'finalIssuePrice', 'anchorPct', 'anchorMfPct', 'lockin1Pct',
  'lockin1Days', 'lockin2Days', 'empMaxPerApplicant', 'empInitialPerApplicant',
  'minSubscriptionPct', 'upiMandateCutoff', 'carveouts', 'fresh', 'ofs', 'anchorDate',
  'refundDate', 'bseListingPrice', 'nseListingPrice', 'openDate', 'closeDate', 'qibCloseDate',
  'dematDate', 'registrarEmail', 'registrarPhone', 'registrarUrl', 'companyWebsite',
  'companyPromoter', 'companyDescription', 'companyStrength', 'companyFinancials', 'contactInfo',
  'faqs', 'leads', 'partners', 'pdfSeries', 'onlineSeries', 'asbaNames', 'anchors',
  'totalShares', 'anchorShares', 'anchorPrice', 'sponsorBank', 'startBid', 'startPrint',
  'shareResv', 'resvRemarks',
];

/** Keys observed on live records that the form does not write (importer, feeds). */
const LIVE_ONLY = [
  'importedAt', 'exchanges', 'sector', 'freshIssueShares', 'freshIssueCr',
  'ofsShares', 'ofsCr', 'finalSub', 'gmpSourceId', 'gmpLog',
  'maxAmtRetail', 'retailCutOff', 'sharesSize', 'ncdMaxSeries', 'resvRemarks2',
];

describe('operational contract — structure', () => {
  it('classifies every key exactly once', () => {
    const seen = new Map<string, number>();
    for (const k of CLASSIFIED_EXTRA_KEYS) seen.set(k, (seen.get(k) ?? 0) + 1);
    const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(twice).toEqual([]);
  });

  it('has no empty bucket', () => {
    for (const b of [OPERATIONAL_COLUMNS, OPERATIONAL_EXTRA, CONTENT_EXTRA, REPORTING_EXTRA, DEAD_EXTRA]) {
      expect(b.length).toBeGreaterThan(0);
    }
  });

  it('points every alias at a key that is itself classified', () => {
    for (const a of ALIAS_EXTRA) {
      // the winner must be a real bucket, never another alias
      expect(['operational', 'content', 'reporting']).toContain(bucketOf(a.wins));
    }
  });
});

describe('operational contract — coverage of what actually exists', () => {
  it('accounts for every key the entry form writes', () => {
    expect(unclassifiedKeys(Object.fromEntries(FORM_WRITES.map((k) => [k, 1])))).toEqual([]);
  });

  it('accounts for every key seen on live records', () => {
    expect(unclassifiedKeys(Object.fromEntries(LIVE_ONLY.map((k) => [k, 1])))).toEqual([]);
  });

  it('reports a key nobody has classified', () => {
    expect(unclassifiedKeys({ shareResv: 1, somethingBrandNew: 2 })).toEqual(['somethingBrandNew']);
  });

  it('does not let the form write a dead key', () => {
    const revived = FORM_WRITES.filter((k) => bucketOf(k) === 'dead');
    expect(revived).toEqual([]);
  });
});

/**
 * The importer and the form store the same fact in different shapes. These
 * assert the reader sees both, because for months it saw only one — a fresh
 * issue count sat on 596 records that no calculation ever read.
 */
describe('offer legs — both storage shapes', () => {
  it('reads the form shape', () => {
    expect(offerLegFrom({ fresh: { basis: 'shares', value: 6_823_528 } }, 'fresh'))
      .toEqual({ basis: 'shares', value: 6_823_528 });
  });

  it('reads the importer flat keys the engine used to miss', () => {
    expect(offerLegFrom({ freshIssueShares: 1_76_47_058 }, 'fresh'))
      .toEqual({ basis: 'shares', value: 1_76_47_058 });
    expect(offerLegFrom({ ofsShares: 50_00_000 }, 'ofs'))
      .toEqual({ basis: 'shares', value: 50_00_000 });
    expect(offerLegFrom({ ofsCr: 300 }, 'ofs')).toEqual({ basis: 'amount', value: 300 });
  });

  it('prefers the share count over the rupee figure', () => {
    // ₹ Cr is rounded to two decimals; the share count is the document's own number
    expect(offerLegFrom({ freshIssueShares: 1_000_000, freshIssueCr: 40 }, 'fresh'))
      .toEqual({ basis: 'shares', value: 1_000_000 });
  });

  it('lets the form shape win over the importer keys', () => {
    const both = { fresh: { basis: 'amount', value: 99 }, freshIssueShares: 1_000_000 };
    expect(offerLegFrom(both, 'fresh')).toEqual({ basis: 'amount', value: 99 });
  });

  it("treats basis 'none' and zeros as absent", () => {
    expect(offerLegFrom({ fresh: { basis: 'none', value: 0 } }, 'fresh')).toBeUndefined();
    expect(offerLegFrom({ ofsShares: 0, ofsCr: 0 }, 'ofs')).toBeUndefined();
    expect(offerLegFrom({}, 'fresh')).toBeUndefined();
    expect(offerLegFrom(null, 'ofs')).toBeUndefined();
  });
});

describe('partner v1 projection', () => {
  const record = {
    shareResv: { qib: { on: true, pct: '50' } },   // operational
    lotSize: 34,                                    // operational (column, not extra)
    companyDescription: '<p>About</p>',             // content
    applicationsReceived: '1200',                   // reporting — must not appear
    importedAt: '2026-08-01',                       // reporting — must not appear
    retailCutOff: '425',                            // dead — must not appear
    freshIssueCr: 300,                              // alias — must not appear
  };

  it('carries operational and content through', () => {
    const v = partnerV1Extra(record);
    expect(v.shareResv).toBeDefined();
    expect(v.companyDescription).toBe('<p>About</p>');
  });

  it('never leaks reporting, dead or alias keys', () => {
    const v = partnerV1Extra(record);
    for (const k of ['applicationsReceived', 'importedAt', 'retailCutOff', 'freshIssueCr']) {
      expect(v[k]).toBeUndefined();
    }
  });

  it('drops blanks so a partner sees absence, not empty string', () => {
    expect(partnerV1Extra({ sponsorBank: '', faceValue: '10' })).toEqual({ faceValue: '10' });
  });

  it('survives a null extra', () => {
    expect(partnerV1Extra(null)).toEqual({});
    expect(partnerV1Extra(undefined)).toEqual({});
  });

  /**
   * The promise in one test: a reporting field added tomorrow cannot change
   * what a partner integrating today receives.
   */
  it('is unchanged when a brand-new reporting field appears on the record', () => {
    const before = partnerV1Extra(record);
    const after = partnerV1Extra({ ...record, someFutureReportField: 'x', anotherOne: 42 });
    expect(after).toEqual(before);
  });
});
