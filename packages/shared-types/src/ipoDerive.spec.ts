/**
 * The shared IPO derivations — the figures both surfaces publish.
 *
 * This code ran for months in `apps/web/lib/ipoCalc.ts` with no tests, while
 * mobile ran its own copy that was simply wrong. The cases below are the ones
 * that were actually broken on 2026-10-07, so a regression on any of them puts
 * a wrong number back in front of an investor.
 */
import { subscriptionTable, lotLadder, reservedPctFor, offeredByBucket, reservation } from './ipoDerive';

const RES = { qib: 50, nii: 15, retail: 35, employee: 5, total: 100 };
const RSME = { qib: 0, nii: 50, retail: 50, employee: 0, total: 100 };

/** A mainboard record with a REAL split — QIB 50 / bHNI 10 / sHNI 5 / Retail 35. */
const MAINBOARD = {
  type: 'mainboard',
  lotSize: 49,
  priceBandMin: 290,
  priceBandMax: 305,
  issueSize: '5001700000',
  extra: {
    totalShares: '16398962',
    shareResv: {
      qib: { pct: '50', sharesUpper: '8139344' },
      hni: { pct: '10', sharesUpper: '1627869' },
      hni2: { pct: '5', sharesUpper: '813934' },
      retail: { pct: '35', sharesUpper: '5697540' },
    },
    anchorShares: '4883605',
  },
};

const row = (category: string, times = 1) => ({ category, timesSubscribed: times, asOf: '2026-10-07' } as any);

describe('the synthetic NII row — three cases, not two', () => {
  /**
   * The condition used to be `both ? keep : drop`, which also swept up the
   * case where NEITHER split row exists — and that is 295 of the 319 records
   * carrying subscription data, because the pre-2026 importer never split NII.
   * Every one of them showed QIB and Retail with no NII line between them.
   */
  it('KEEPS nii when neither hni nor hni2 exists — it is the only NII data there is', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('nii'), row('retail')].map((r) => ({ ...r, reservedPct: RES[r.category as 'qib'] })),
    } as any)!;
    expect(t.rows.map((r) => r.key)).toContain('nii');
  });

  it('KEEPS nii when BOTH split rows exist — it is their subtotal', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('nii'), row('retail')] as any,
    } as any)!;
    const keys = t.rows.map((r) => r.key);
    expect(keys).toContain('nii');
    expect(keys).toContain('hni');
    expect(keys).toContain('hni2');
  });

  it('DROPS nii when exactly one split row exists — it would print the same figure twice', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('nii'), row('retail')] as any,
    } as any)!;
    expect(t.rows.map((r) => r.key)).not.toContain('nii');
  });

  it('never counts the nii subtotal twice in the Total', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('nii'), row('retail')] as any,
    } as any)!;
    const split = t.rows.filter((r) => r.key !== 'nii').reduce((a, r) => a + r.bookSize, 0);
    expect(t.total.bookSize).toBe(split);
  });
});

describe('Book Size comes from the record, not from a generic split', () => {
  /**
   * Mobile divided a hardcoded { qib: 50, nii: 15, retail: 35 } which has no
   * key for hni, hni2, shareholder or policyholder — so all four rendered ZERO.
   */
  it('gives every split category a real Book Size', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('hni'), row('hni2'), row('retail')] as any,
    } as any)!;
    for (const r of t.rows) expect(r.bookSize).toBeGreaterThan(0);
  });

  it('deducts the anchor from QIB and says the basis is actual', () => {
    const t = subscriptionTable({
      ...MAINBOARD,
      subscription: [row('qib'), row('retail')] as any,
    } as any)!;
    expect(t.anchorDeducted).toBe(4883605);
    expect(t.anchorBasis).toBe('actual');
    // QIB 81,39,344 gross − 48,83,605 anchor
    expect(t.rows.find((r) => r.key === 'qib')!.bookSize).toBe(8139344 - 4883605);
  });

  it('reports NO anchor rather than assuming one', () => {
    const noAnchor = { ...MAINBOARD, extra: { ...MAINBOARD.extra, anchorShares: '' } };
    const t = subscriptionTable({ ...noAnchor, subscription: [row('qib')] as any } as any)!;
    expect(t.anchorDeducted).toBe(0);
    expect(t.anchorBasis).toBeNull();
  });

  it('offeredByBucket resolves each category from the stored counts', () => {
    const o = offeredByBucket(MAINBOARD as any);
    expect(o.qib).toBe(8139344);
    expect(o.hni).toBe(1627869);
    expect(o.hni2).toBe(813934);
  });
});

describe('the lot ladder differs in KIND between SME and mainboard', () => {
  /** Mobile always returned the five-row mainboard shape. An SME individual
   *  bids a FIXED two lots, so showing "1 lot" understates the minimum. */
  it('mainboard gets the five-row ladder with min/max bands', () => {
    expect(lotLadder(MAINBOARD as any)).toHaveLength(5);
  });

  it('SME gets three rows and its Individual row starts at TWO lots', () => {
    const sme = { ...MAINBOARD, type: 'sme', lotSize: 1200, priceBandMin: 107, priceBandMax: 113 };
    const rows = lotLadder(sme as any);
    expect(rows).toHaveLength(3);
    expect(rows[0].lots).toBe(2);
    expect(rows[0].shares).toBe(2400);
  });
});

describe('reservedPctFor — the record first, the generic split only as fallback', () => {
  it('reads the stored percentage when the record has one', () => {
    expect(reservedPctFor(MAINBOARD.extra, 'qib', RES)).toBe(50);
    expect(reservedPctFor(MAINBOARD.extra, 'hni', RES)).toBe(10);
  });

  it('sums hni + hni2 for the synthetic nii row', () => {
    expect(reservedPctFor(MAINBOARD.extra, 'nii', RES)).toBe(15);
  });

  it('falls back to the generic split for a record with no table', () => {
    expect(reservedPctFor({}, 'qib', RES)).toBe(50);
    expect(reservedPctFor(undefined, 'retail', RSME)).toBe(50);
  });

  it('total is always 100', () => {
    expect(reservedPctFor({}, 'total', RES)).toBe(100);
  });

  it('is 0 for a category nobody has declared, rather than guessing', () => {
    expect(reservedPctFor({}, 'policyholder', RES)).toBe(0);
  });
});

/**
 * The reservation legend must reconcile to the TOTAL ISSUE SIZE.
 *
 * Reported by the operator on 2026-10-09 against IPOPremium's RKFAL table: our
 * legend summed to 94.97% with no Market maker row, because `reservation()`
 * read `extra.shareResv` only and `marketmaker` was not even in its bucket
 * list — carve-outs live in `extra.carveouts`.
 *
 * Both fixtures are the REAL stored records.
 */
const RKFAL = {
  symbol: 'RKFAL',
  type: 'sme',
  lotSize: 1600,
  priceBandMin: 77,
  priceBandMax: 82,
  issueSize: '349900000',
  extra: {
    totalShares: '4267200',
    carveouts: { employee: '', marketmaker: '214400', shareholder: '', policyholder: '' },
    carveoutBasis: { employee: 'amount', marketmaker: 'shares', shareholder: 'amount', policyholder: 'amount' },
    shareResv: {
      qib: { sharesUpper: '43200', source: 'operator' },
      hni: { sharesUpper: '1070400', source: 'operator' },
      hni2: { sharesUpper: '536000', source: 'operator' },
      retail: { sharesUpper: '2403200', source: 'operator' },
    },
  },
};

describe('reservation() — the legend reconciles to the issue size', () => {
  it('adds the Market maker row, and RKFAL then sums to 100%', () => {
    const rows = reservation(RKFAL as any);
    const mm = rows.find((r) => r.key === 'marketmaker');
    expect(mm).toBeTruthy();
    expect(mm!.shares).toBe(214400);
    expect(mm!.cat).toBe('Market maker');       // not "MARKETMAKER"
    const shares = rows.reduce((a, r) => a + r.shares, 0);
    expect(shares).toBe(4267200);               // === extra.totalShares
    const pct = rows.reduce((a, r) => a + r.pct, 0);
    expect(Math.abs(pct - 100)).toBeLessThan(0.05);
  });

  it('reproduces IPOPremium RKFAL percentages to the digit', () => {
    const rows = reservation(RKFAL as any);
    const pct = (k: string) => rows.find((r) => r.key === k)!.pct;
    expect(pct('qib')).toBeCloseTo(1.01, 2);
    expect(pct('retail')).toBeCloseTo(56.32, 2);
    expect(pct('marketmaker')).toBeCloseTo(5.02, 2);
    // Their table groups the two HNI bands as one 37.65% row.
    expect(pct('hni') + pct('hni2')).toBeCloseTo(37.65, 1);
  });

  it('puts the carve-out AFTER the split rows, as every reference prints it', () => {
    const rows = reservation(RKFAL as any);
    expect(rows[rows.length - 1].key).toBe('marketmaker');
  });

  it('DERIVES the percentage from the count, so the two agree on a row', () => {
    /* SPECTRAA stores percentages of the NET offer (49.9473 etc.) beside counts
       that are of the GROSS, so the legend printed QIB 49.95% next to a count
       that is 47.42% of the issue size. The count decides now. */
    const SPECTRAA = {
      type: 'sme', lotSize: 1200, priceBandMin: 112, priceBandMax: 118,
      issueSize: '425200000',
      extra: {
        totalShares: '3603600',
        carveouts: { marketmaker: '182400' },
        carveoutBasis: { marketmaker: 'shares' },
        shareResv: {
          qib: { pct: '49.9473', sharesUpper: '1708800' },
          hni: { pct: '10.0316', sharesUpper: '343200' },
          hni2: { pct: '5.0158', sharesUpper: '171600' },
          retail: { pct: '35.0053', sharesUpper: '1197600' },
        },
      },
    };
    const rows = reservation(SPECTRAA as any);
    const qib = rows.find((r) => r.key === 'qib')!;
    expect(qib.pct).toBeCloseTo(47.42, 1);      // was 49.95 — the stored net-basis figure
    expect(qib.shares).toBe(1708800);
    const shares = rows.reduce((a, r) => a + r.shares, 0);
    expect(shares).toBe(3603600);
  });

  it('still honours a stored percentage when there is no count to derive from', () => {
    const pctOnly = {
      type: 'mainboard', lotSize: 10, priceBandMin: 95, priceBandMax: 100,
      issueSize: '1000000000',
      extra: { totalShares: '10000000', shareResv: { qib: { pct: '50' }, retail: { pct: '35' } } },
    };
    const rows = reservation(pctOnly as any);
    expect(rows.find((r) => r.key === 'qib')!.pct).toBe(50);
  });

  /**
   * `on: false` ON A ROW THAT HOLDS DATA. Five mainboard records store exactly
   * this — ANNU · SYMBIOTEC · HYTECH · SKYWAYS · LUMINO — and while the flag
   * was honoured `reservation()` returned NO ROWS for them, so those five
   * published no reservation legend at all, and `offeredByBucket()` gave them
   * no Book Size either. The flag is vestigial; see `pct()` in issueInputs.ts.
   */
  const SKYWAYS = {
    type: 'mainboard', lotSize: 100, priceBandMin: 131, priceBandMax: 138,
    issueSize: 4140000000,
    extra: {
      shareResv: {
        qib: { on: false, pct: '49.92', source: 'derived', sharesLower: '15776200', sharesUpper: '14976000' },
        hni: { on: false, pct: '10.03', source: 'derived', sharesLower: '3169700', sharesUpper: '3009000' },
        hni2: { on: false, pct: '5.01', source: 'derived', sharesLower: '1583300', sharesUpper: '1503000' },
        retail: { on: false, pct: '35.04', source: 'derived', sharesLower: '11073700', sharesUpper: '10512000' },
        other: { on: false, pct: '' },
      },
    },
  };

  it('renders a legend for a row flagged `on: false` — it is vestigial', () => {
    const rows = reservation(SKYWAYS as any);
    expect(rows.map((r) => r.key).sort()).toEqual(['hni', 'hni2', 'qib', 'retail']);
    // the UPPER band, per the industry convention
    expect(rows.find((r) => r.key === 'qib')!.shares).toBe(14976000);
    expect(rows.reduce((a, r) => a + r.shares, 0)).toBe(30000000);
  });

  it('and gives it a Book Size, which it also had none of', () => {
    const book = offeredByBucket(SKYWAYS as any);
    expect(book.qib).toBe(14976000);
    expect(book.retail).toBe(10512000);
  });

  it('still skips a row holding neither a percentage nor a count', () => {
    expect(reservation(SKYWAYS as any).find((r) => r.key === 'other')).toBeUndefined();
  });

  it('does not double-count a quota already held as a shareResv row', () => {
    /* A legacy record with its employee quota in the TABLE and the carve-out
       also set must show one employee row, not two. */
    const both = {
      type: 'mainboard', lotSize: 10, priceBandMin: 95, priceBandMax: 100,
      issueSize: '1000000000',
      extra: {
        totalShares: '10000000',
        carveouts: { employee: '100000' },
        carveoutBasis: { employee: 'shares' },
        shareResv: { qib: { sharesUpper: '5000000' }, employee: { sharesUpper: '100000' } },
      },
    };
    const rows = reservation(both as any);
    expect(rows.filter((r) => r.key === 'employee')).toHaveLength(1);
  });
});
