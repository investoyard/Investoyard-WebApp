/**
 * The mapper that three surfaces had their own copy of. Every fixture here is a
 * REAL stored record, because the faults this file guards against were all
 * fields quietly absent from one copy — a synthetic fixture would have been
 * built from whichever copy I was reading.
 */
import { issueInputsFrom, parseIssueSizeRupees, CARVEOUT_ROW_KEYS } from './issueInputs';
import { computeIssue } from './computeIssue';

/**
 * RUNWALENTR as stored. Mainboard, Reg 6(1), band ₹290–305, lot 49, an EMPLOYEE
 * carve-out of 1,20,275 shares at a ₹14 discount, anchor allotment 48,83,605.
 *
 * Chittorgarh publishes total `1,63,98,962`, employee `1,20,275`, net offer
 * `1,62,78,687`; the exchange publishes net QIB `32,55,739`. Those three are the
 * assertions — the record is only interesting because it is the one that proved
 * the admin form was dividing the gross back in September.
 */
const RUNWALENTR = {
  type: 'mainboard',
  lotSize: 49,
  priceBandMin: 290,
  priceBandMax: 305,
  issueSize: '5001700000',
  extra: {
    totalShares: '16398962',
    shareResv: {
      qib: { pct: '50' }, hni: { pct: '10' }, hni2: { pct: '5' }, retail: { pct: '35' },
      employee: { pct: '' }, shareholder: { pct: '' }, other: { pct: '' },
    },
    carveouts: { employee: '120275', marketmaker: '', shareholder: '' },
    carveoutBasis: { employee: 'shares', marketmaker: 'amount', shareholder: 'amount' },
    employeeDiscount: '14',
    anchorShares: '4883605',
    anchorPrice: '305',
    mechanism: 'book_built',
    regulationBasis: 'icdr_6_1',
    fresh: { basis: 'amount', value: 500.17 },
  },
};

/**
 * SAIURJA as stored. BSE SME, band ₹107–113, lot 1200, a MARKET-MAKER carve-out
 * of 2,16,000 shares, and the 4-dp percentages the 2026-09-30 repair wrote.
 * Published net offer is `19,92,000`.
 */
const SAIURJA = {
  type: 'sme',
  lotSize: 1200,
  priceBandMin: 107,
  priceBandMax: 113,
  issueSize: '249500000',
  extra: {
    totalShares: '2208000',
    shareResv: {
      qib: { pct: '49.1566' }, hni: { pct: '10.1205' }, hni2: { pct: '5.0602' }, retail: { pct: '35.6627' },
    },
    carveouts: { marketmaker: '216000' },
    carveoutBasis: { marketmaker: 'shares' },
    anchorShares: '586800',
    mechanism: 'book_built',
    regulationBasis: 'icdr_6_1',
    fresh: { basis: 'shares', value: 1828800 },
    ofs: { basis: 'shares', value: 379200 },
  },
};

describe('carve-outs reach the engine — the bug this file exists for', () => {
  it('passes an employee carve-out through, on its own basis', () => {
    const inp = issueInputsFrom(RUNWALENTR);
    expect(inp.carveouts).toEqual([{ key: 'employee', basis: 'shares', value: 120275 }]);
  });

  it('reproduces RUNWALENTR’s published net offer', () => {
    const d = computeIssue(issueInputsFrom(RUNWALENTR));
    expect(d.primary!.totalOfferOffered).toBe(16398962);
    expect(d.primary!.netOfferOffered).toBe(16278687); // 1,63,98,962 − 1,20,275
  });

  it('reproduces the exchange’s net QIB after anchor', () => {
    const d = computeIssue(issueInputsFrom(RUNWALENTR));
    expect(d.primary!.anchor!.netQibOffered).toBe(3255739);
  });

  it('WITHOUT the carve-out the net offer is the gross — what both public mappers did', () => {
    const inp = issueInputsFrom(RUNWALENTR);
    const broken = computeIssue({ ...inp, carveouts: [] });
    expect(broken.primary!.netOfferOffered).toBe(16398962);
    // the whole quota fell through into the split, 60,137 of it into QIB
    expect(broken.primary!.netOfferOffered - 16278687).toBe(120275);
  });

  it('passes a MARKET-MAKER carve-out too, and SAIURJA’s net offer comes out exact', () => {
    const inp = issueInputsFrom(SAIURJA);
    expect(inp.carveouts).toEqual([{ key: 'marketmaker', basis: 'shares', value: 216000 }]);
    expect(computeIssue(inp).primary!.netOfferOffered).toBe(1992000);
  });

  it('drops a carve-out field that is blank or zero rather than sending value 0', () => {
    // RUNWALENTR stores '' for marketmaker and shareholder — three keys, one carve-out.
    expect(issueInputsFrom(RUNWALENTR).carveouts).toHaveLength(1);
  });
});

describe('a carve-out key is excluded from the category split', () => {
  /**
   * THE TRAP. Both old mappers put employee / shareholder / policyholder
   * percentages into `reservation`. Adding `carveouts` without removing them
   * would have counted the quota TWICE — once off the top and once inside the
   * split — which is the double-count the form avoided by excluding them.
   */
  const DOUBLE = {
    ...RUNWALENTR,
    extra: {
      ...RUNWALENTR.extra,
      // the legacy shape: a quota in the table AND in the carve-out
      shareResv: { ...RUNWALENTR.extra.shareResv, employee: { pct: '0.73' } },
    },
  };

  it('never puts a carve-out key in reservation', () => {
    const inp = issueInputsFrom(DOUBLE);
    for (const k of CARVEOUT_ROW_KEYS) expect(inp.reservation[k]).toBeUndefined();
  });

  it('so the net offer is unchanged by a stray percentage in the table', () => {
    expect(computeIssue(issueInputsFrom(DOUBLE)).primary!.netOfferOffered)
      .toBe(computeIssue(issueInputsFrom(RUNWALENTR)).primary!.netOfferOffered);
  });

  it('keeps `other`, which IS a split category', () => {
    const src = { ...SAIURJA, extra: { ...SAIURJA.extra, shareResv: { ...SAIURJA.extra.shareResv, other: { pct: '2' } } } };
    expect(issueInputsFrom(src).reservation.other).toBe(2);
  });

  it('honours a row’s own on/off switch', () => {
    const src = { ...SAIURJA, extra: { ...SAIURJA.extra, shareResv: { ...SAIURJA.extra.shareResv, hni2: { pct: '5.0602', on: false } } } };
    expect(issueInputsFrom(src).reservation.hni2).toBeUndefined();
  });
});

describe('a row with NO `on` key is ON — the bug that zeroed 39 records', () => {
  /**
   * `on` is VESTIGIAL. The admin form has no concept of it: `Resv` carries
   * `pct` / `sharesLower` / `sharesUpper` / `source` and nothing else, and the
   * form's own engine mapping tests `pct > 0` alone. Only 13 of the 72 records
   * with a reservation table still hold an `on` anywhere — legacy rows that
   * also still carry the long-stripped `count` / `req1x` / `remark` — and
   * EVERY stored `on: false` row has an empty `pct`, so it contributes nothing
   * either way.
   *
   * Both old public mappers nevertheless required it to be TRUTHY
   * (`r?.on && Number.isFinite(v)`), so on the 59 records that carry no `on`
   * they returned a reservation of all zeros and `derive()` produced no
   * categories at all. Measured across the catalogue: **39 records go from an
   * all-zero split to real figures** once this is read correctly. Web's own
   * `reservation()` — in the same file as one of those mappers — had always
   * used `on === false`, which is the correct reading.
   */
  const noOnKey = {
    ...SAIURJA,
    extra: {
      ...SAIURJA.extra,
      // exactly as stored: pct and source, no `on`
      shareResv: {
        qib: { pct: '49.1566', source: 'operator' },
        hni: { pct: '10.1205', source: 'operator' },
        hni2: { pct: '5.0602', source: 'operator' },
        retail: { pct: '35.6627', source: 'operator' },
      },
    },
  };

  it('includes every row, so the split is not silently empty', () => {
    expect(issueInputsFrom(noOnKey).reservation).toEqual({
      qib: 49.1566, hni: 10.1205, hni2: 5.0602, retail: 35.6627,
    });
  });

  it('yields real category figures rather than nothing', () => {
    const cats = computeIssue(issueInputsFrom(noOnKey)).primary!.categories;
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => c.shares > 0)).toBe(true);
  });

  it('a row that is explicitly off still goes, even with a percentage on it', () => {
    const src = {
      ...noOnKey,
      extra: { ...noOnKey.extra, shareResv: { ...noOnKey.extra.shareResv, hni2: { pct: '5.0602', on: false } } },
    };
    expect(issueInputsFrom(src).reservation.hni2).toBeUndefined();
  });
});

describe('the fields each old copy was missing', () => {
  it('passes `instrument` — the W04 follow-on gate, which MOBILE never sent', () => {
    expect(issueInputsFrom({ ...RUNWALENTR, instrument: 'fpo' }).instrument).toBe('fpo');
    expect(issueInputsFrom(RUNWALENTR).instrument).toBe('ipo');
  });

  it('passes all four discounts — WEB sent retail alone', () => {
    const inp = issueInputsFrom({
      ...RUNWALENTR,
      extra: { ...RUNWALENTR.extra, retailDiscount: '5', shareholderDiscount: '20', policyholderDiscount: '60' },
    });
    expect(inp.discounts).toEqual({ retail: 5, employee: 14, shareholder: 20, policyholder: 60 });
  });

  it('passes `finalIssuePrice`, which NEITHER copy sent', () => {
    const inp = issueInputsFrom({ ...RUNWALENTR, extra: { ...RUNWALENTR.extra, finalIssuePrice: '300' } });
    expect(inp.finalIssuePrice).toBe(300);
    expect(issueInputsFrom(RUNWALENTR).finalIssuePrice).toBeUndefined();
  });

  it('leaves `regulationBasis` undefined when unstated, so the engine owns the default', () => {
    const src = { ...SAIURJA, extra: { ...SAIURJA.extra, regulationBasis: '' } };
    expect(issueInputsFrom(src).regulationBasis).toBeUndefined();
    // 49.16% QIB is below the 75% threshold, so the engine infers 6(1)
    expect(computeIssue(issueInputsFrom(src)).regulationBasis).toBe('icdr_6_1');
  });

  it('does NOT pass dates — 564 of 1,267 records would raise one (see the source note)', () => {
    expect((issueInputsFrom(RUNWALENTR) as any).dates).toBeUndefined();
  });
});

describe('parseIssueSizeRupees — one parser, previously copied into both apps', () => {
  it('reads the formatted crore string the API sends', () => {
    expect(parseIssueSizeRupees('₹500.17 Cr')).toBeCloseTo(5001700000, 0);
    expect(parseIssueSizeRupees('Rs 1,234.50 Cr')).toBeCloseTo(12345000000, 0);
  });

  it('reads plain rupees, which is what the COLUMN holds', () => {
    expect(parseIssueSizeRupees('5001700000')).toBe(5001700000);
    expect(parseIssueSizeRupees(5001700000)).toBe(5001700000);
  });

  it('is 0 for nothing, never NaN', () => {
    expect(parseIssueSizeRupees(undefined)).toBe(0);
    expect(parseIssueSizeRupees(null)).toBe(0);
    expect(parseIssueSizeRupees('')).toBe(0);
    expect(parseIssueSizeRupees('—')).toBe(0);
  });
});

describe('an empty record does not throw', () => {
  it('maps to a mainboard IPO with nothing in it', () => {
    const inp = issueInputsFrom({});
    expect(inp.board).toBe('mainboard');
    expect(inp.reservation).toEqual({});
    expect(inp.carveouts).toEqual([]);
    expect(() => computeIssue(inp)).not.toThrow();
  });
});
