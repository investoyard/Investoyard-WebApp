/**
 * Fixture: MV Electrosystems (MVELECTRO) — Mainboard, book-built, ICDR 6(2).
 * Every expected value comes from §5/§6/§9 of docs/ipo-entry-spec.md, which was
 * reconciled against the live legacy screen. If the engine disagrees with a
 * number here, the fixture is right.
 */
import { computeIssue, floorToLot, IssueInputs } from './computeIssue';
import { isTradingHoliday } from './holidays';

const MVELECTRO: IssueInputs = {
  board: 'mainboard',
  mechanism: 'book_built',
  regulationBasis: 'icdr_6_2',
  lotSize: 34,
  priceFloor: 400,
  priceCap: 425,
  // Expressed in SHARES: the spec's floor check (6,823,528 x 400 = 272.94 Cr)
  // holds the share count fixed and lets the amount move, which is only true on
  // a shares basis. Whether MVELECTRO's offer was really fresh-only is open
  // (brief §6 Q1); the arithmetic is unaffected by which leg carries it.
  fresh: { basis: 'shares', value: 6_823_528 },
  // CORRECTED split — Big takes two-thirds of the NII quota
  reservation: { qib: 75, hni: 10, hni2: 5, retail: 10 },
  anchor: { pctOfQib: 60 },
};

const cat = (r: ReturnType<typeof computeIssue>, key: string) =>
  r.primary!.categories.find((c) => c.key === key)!;

describe('floorToLot', () => {
  it('rounds down to a whole number of lots', () => {
    expect(floorToLot(6_823_529.4, 34)).toBe(6_823_528);
    expect(floorToLot(100, 34)).toBe(68);
    expect(floorToLot(34, 34)).toBe(34);
  });
  it('is 0 when the lot size is unknown', () => {
    expect(floorToLot(1000, 0)).toBe(0);
  });
});

describe('computeIssue — MVELECTRO fixture', () => {
  const res = computeIssue(MVELECTRO);

  it('resolves the total offer at cap and at floor (spec §5 Step 1)', () => {
    expect(res.scenarios.cap!.totalOfferShares).toBe(6_823_528);
    expect(res.scenarios.cap!.totalOfferAmount / 1e7).toBeCloseTo(290.0, 1);
    expect(res.scenarios.floor!.totalOfferAmount / 1e7).toBeCloseTo(272.94, 1);
  });

  it('splits categories and absorbs the residual into QIB (spec §5 Step 3)', () => {
    expect(cat(res, 'qib').shares).toBe(5_117_680);   // after residual
    expect(cat(res, 'hni').shares).toBe(682_346);     // Big, 10%
    expect(cat(res, 'hni2').shares).toBe(341_156);    // Small, 5%
    expect(cat(res, 'retail').shares).toBe(682_346);
  });

  it('assigns every share — nothing is lost to rounding', () => {
    const sum = res.primary!.categories.reduce((a, c) => a + c.shares, 0);
    expect(sum).toBe(res.primary!.netOfferShares);
  });

  it('keeps every category a whole number of lots', () => {
    for (const c of res.primary!.categories) expect(c.shares % 34).toBe(0);
  });

  it('derives the minimum application per category (spec §5 Step 5)', () => {
    expect(cat(res, 'retail').minAppShares).toBe(34);      // 1 lot, ₹14,450
    expect(cat(res, 'hni2').minLots).toBe(14);
    expect(cat(res, 'hni2').minAppShares).toBe(476);       // > ₹2,00,000
    expect(cat(res, 'hni').minLots).toBe(70);
    expect(cat(res, 'hni').minAppShares).toBe(2_380);      // > ₹10,00,000
  });

  it('derives applications for 1x — the numbers the legacy screen got wrong', () => {
    expect(cat(res, 'retail').appsFor1x).toBe(20_069);
    expect(cat(res, 'hni2').appsFor1x).toBe(717);          // Small
    expect(cat(res, 'hni').appsFor1x).toBe(287);           // Big — legacy showed 717 here
  });

  it('distinguishes applications-for-1x from allotment capacity (spec §5 Step 6)', () => {
    const retail = cat(res, 'retail');
    // divides exactly, so the two agree
    expect(retail.appsFor1x).toBe(retail.maxAllottees);
    const big = cat(res, 'hni');
    // does not divide, so demand-to-reach-1x is one more than capacity-at-1x
    expect(big.appsFor1x).toBe(287);
    expect(big.maxAllottees).toBe(286);
  });

  it('sub-allocates the QIB book to anchor (spec §5 Step 4)', () => {
    expect(res.primary!.anchor!.shares).toBe(3_070_608);
    expect(res.primary!.anchor!.netQibShares).toBe(2_047_072);
  });

  it('generates the category remark instead of accepting one', () => {
    expect(cat(res, 'retail').remark).toBe('₹29.00 Cr @ 20,069 forms for 1x');
  });

  it('infers ICDR 6(2) from a 75% QIB quota', () => {
    const { regulationBasis } = computeIssue({ ...MVELECTRO, regulationBasis: undefined });
    expect(regulationBasis).toBe('icdr_6_2');
  });
});

describe('computeIssue — the legacy defect it prevents', () => {
  it('produces different figures when Big and Small are transposed', () => {
    const swapped = computeIssue({ ...MVELECTRO, reservation: { qib: 75, hni: 5, hni2: 10, retail: 10 } });
    // this is what the live site published before the data was repaired
    expect(swapped.primary!.categories.find((c) => c.key === 'hni2')!.appsFor1x).toBe(1_434);
    // 144, not the 143 the old code produced: reaching 1x needs ceil(143.34)
    // applications, and Math.round quietly reported one fewer than required.
    expect(swapped.primary!.categories.find((c) => c.key === 'hni')!.appsFor1x).toBe(144);
  });
});

describe('computeIssue — degrades instead of guessing', () => {
  it('returns empty when the lot size is missing', () => {
    expect(computeIssue({ ...MVELECTRO, lotSize: undefined }).empty).toBe(true);
  });
  it('returns empty when there is no offer size at all', () => {
    expect(computeIssue({ ...MVELECTRO, fresh: undefined, issueSizeCr: undefined }).empty).toBe(true);
  });
  it('omits a category with no percentage rather than showing zero', () => {
    const r = computeIssue({ ...MVELECTRO, reservation: { qib: 75, retail: 25 } });
    expect(r.primary!.categories.map((c) => c.key)).toEqual(['qib', 'retail']);
  });
  it('carves employee shares off the top before the category split', () => {
    const r = computeIssue({
      ...MVELECTRO,
      carveouts: [{ key: 'employee', basis: 'amount', value: 2 }],
    });
    expect(r.primary!.carveoutShares).toBeGreaterThan(0);
    expect(r.primary!.netOfferShares).toBe(r.primary!.totalOfferShares - r.primary!.carveoutShares);
    const sum = r.primary!.categories.reduce((a, c) => a + c.shares, 0);
    expect(sum).toBe(r.primary!.netOfferShares);
  });
});

describe('computeIssue — legacy amount-only records', () => {
  /**
   * Our legacy rows carry a single `issueSize` in rupees and no Fresh/OFS split.
   * On an AMOUNT basis the money is fixed and the share count moves with price,
   * the opposite of the shares basis above — so the two scenarios differ in
   * shares, not in rupees. Worth asserting: it is the behaviour every existing
   * record falls back to until the split is entered.
   */
  const legacy: IssueInputs = {
    board: 'mainboard', mechanism: 'book_built', regulationBasis: 'icdr_6_2',
    lotSize: 34, priceFloor: 400, priceCap: 425, issueSizeCr: 290,
    reservation: { qib: 75, hni: 10, hni2: 5, retail: 10 },
  };
  const r = computeIssue(legacy);

  it('still derives, so no record is left blank for want of a split', () => {
    expect(r.empty).toBe(false);
    expect(r.scenarios.cap!.totalOfferShares).toBe(6_823_528);
  });

  it('holds the AMOUNT fixed across scenarios and moves the share count', () => {
    expect(r.scenarios.cap!.totalOfferAmount / 1e7).toBeCloseTo(290.0, 1);
    expect(r.scenarios.floor!.totalOfferAmount / 1e7).toBeCloseTo(290.0, 1);
    expect(r.scenarios.floor!.totalOfferShares).toBeGreaterThan(r.scenarios.cap!.totalOfferShares);
  });

  it('reaches the same retail figure as the shares basis at cap price', () => {
    expect(cat(r, 'retail').appsFor1x).toBe(20_069);
  });
});

/**
 * Spec §9 negative cases. One test per rule code.
 *
 * These sit in the engine rather than the admin form because the form is not
 * the only writer — the Excel importer and the API reach computeIssue directly.
 */
describe('computeIssue — validation catalogue (spec §6)', () => {
  const problem = (r: ReturnType<typeof computeIssue>, code: string) =>
    r.issues.find((i) => i.code === code);

  it('is silent on the corrected fixture', () => {
    expect(computeIssue(MVELECTRO).issues).toEqual([]);
  });

  /* ── negative case 1 ── */
  it('B01 — reservation percentages must total 100', () => {
    const r = computeIssue({ ...MVELECTRO, reservation: { qib: 75, hni: 10, hni2: 5, retail: 9.9 } });
    expect(problem(r, 'B01')?.severity).toBe('blocking');
  });

  it('B01 fires even though the residual absorbs the shortfall invisibly', () => {
    const r = computeIssue({ ...MVELECTRO, reservation: { qib: 75, hni: 10, hni2: 5, retail: 9.9 } });
    const s = r.scenarios.cap!;
    // the post-conditions still pass — which is exactly why B01 cannot be left
    // to a Sigma-check downstream
    expect(s.categories.reduce((a, c) => a + c.shares, 0)).toBe(s.netOfferShares);
    expect(problem(r, 'B01')).toBeDefined();
  });

  /* ── negative case 3 ── */
  it('B09 — anchor cannot exceed the rule pack cap', () => {
    const r = computeIssue({ ...MVELECTRO, anchor: { pctOfQib: 65 } });
    expect(problem(r, 'B09')?.severity).toBe('blocking');
    expect(problem(r, 'B09')?.message).toContain('60');
  });

  it('B09 accepts the cap exactly', () => {
    expect(problem(computeIssue({ ...MVELECTRO, anchor: { pctOfQib: 60 } }), 'B09')).toBeUndefined();
  });

  /* ── negative case 4 ── */
  it('B10 — a fixed-price issue cannot have an anchor round', () => {
    const r = computeIssue({
      ...MVELECTRO, mechanism: 'fixed_price', fixedPrice: 425, anchor: { pctOfQib: 60 },
    });
    expect(problem(r, 'B10')?.severity).toBe('blocking');
  });

  it('B10 does not fire on a fixed-price issue with no anchor', () => {
    const r = computeIssue({
      ...MVELECTRO, mechanism: 'fixed_price', fixedPrice: 425, anchor: undefined,
    });
    expect(problem(r, 'B10')).toBeUndefined();
  });

  /* ── negative case 5: not reachable, and that is the point ── */
  it('B03/B04 cannot be violated — every leg and carve-out is floored to a lot', () => {
    for (const lotSize of [7, 34, 37, 200, 1_600]) {
      const s = computeIssue({ ...MVELECTRO, lotSize }).scenarios.cap!;
      expect(s.netOfferShares % lotSize).toBe(0);
      expect(s.categories.every((c) => c.shares % lotSize === 0)).toBe(true);
      expect(s.categories.reduce((a, c) => a + c.shares, 0)).toBe(s.netOfferShares);
    }
  });
});

describe('computeIssue — B09/B10 do not stack', () => {
  it('reports B10 but not B09 on a fixed-price issue with an anchor', () => {
    const r = computeIssue({
      ...MVELECTRO, mechanism: 'fixed_price', fixedPrice: 425, anchor: { pctOfQib: 60 },
    });
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('B10');
    // the fixed-price pack caps the anchor at 0, so an unguarded B09 would tell
    // the operator to REDUCE a percentage they need to REMOVE
    expect(codes).not.toContain('B09');
    // B02 does fire here, and correctly: a fixed-price issue owes retail 50%
    expect(r.issues.find((i) => i.code === 'B02')?.message).toMatch(/Retail.*at least 50/);
  });
});

/**
 * B02 — spec §9 negative case 2, and the rule the brief singles out:
 * "B02 must reject the legacy HNI Big/Small swap under ICDR_6_2."
 */
describe('computeIssue — B02 category bounds', () => {
  const find = (r: ReturnType<typeof computeIssue>, code: string) => r.issues.filter((i) => i.code === code);

  it('rejects the legacy Big/Small transposition under ICDR 6(2)', () => {
    const r = computeIssue({ ...MVELECTRO, reservation: { qib: 75, hni: 5, hni2: 10, retail: 10 } });
    const b02 = find(r, 'B02');
    expect(b02.some((i) => i.severity === 'blocking' && /transposed/.test(i.message))).toBe(true);
  });

  it('rejects the same transposition under ICDR 6(1)', () => {
    const r = computeIssue({
      ...MVELECTRO, regulationBasis: 'icdr_6_1',
      reservation: { qib: 50, hni: 5, hni2: 10, retail: 35 },
    });
    expect(find(r, 'B02').some((i) => /transposed/.test(i.message))).toBe(true);
  });

  it('accepts a 2:1 split at an NII total above the 6(1) floor', () => {
    // 6(1) sets a FLOOR on NII, so 24/12 is legal — absolute 10/5 bounds
    // would have rejected it
    const r = computeIssue({
      ...MVELECTRO, regulationBasis: 'icdr_6_1',
      reservation: { qib: 29, hni: 24, hni2: 12, retail: 35 },
    });
    expect(r.issues).toEqual([]);
  });

  it('warns, but does not block, on an off-ratio split that is not transposed', () => {
    const r = computeIssue({
      ...MVELECTRO, regulationBasis: 'icdr_6_1',
      reservation: { qib: 50, hni: 8, hni2: 7, retail: 35 },
    });
    const w = find(r, 'W01');
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('warning');
    expect(find(r, 'B02').filter((i) => /transposed/.test(i.message))).toHaveLength(0);
  });

  it('enforces the QIB floor under 6(2) and the retail floor under 6(1)', () => {
    const lowQib = computeIssue({ ...MVELECTRO, reservation: { qib: 70, hni: 13, hni2: 7, retail: 10 } });
    expect(find(lowQib, 'B02').some((i) => /QIB.*at least 75/.test(i.message))).toBe(true);

    const lowRetail = computeIssue({
      ...MVELECTRO, regulationBasis: 'icdr_6_1',
      reservation: { qib: 50, hni: 20, hni2: 10, retail: 20 },
    });
    expect(find(lowRetail, 'B02').some((i) => /Retail.*at least 35/.test(i.message))).toBe(true);
  });

  it('bounds the COMBINED NII quota, not just the rows', () => {
    // 20% NII under 6(2), correctly split 2:1 — each row alone looks unremarkable
    const r = computeIssue({ ...MVELECTRO, reservation: { qib: 75, hni: 13.334, hni2: 6.666, retail: 5 } });
    expect(find(r, 'B02').some((i) => /Big \+ Small.*caps it at 15/.test(i.message))).toBe(true);
  });

  it('stays silent on the corrected fixture', () => {
    expect(computeIssue(MVELECTRO).issues).toEqual([]);
  });
});

/**
 * SME two-lot retail minimum, and the date / market-maker rules.
 *
 * The SME case is a REGRESSION test: the engine used to return one lot for SME
 * retail while apps/api's Min Application used two, so one issue reported two
 * different minimums to two different screens.
 */
describe('computeIssue — SME differs from Mainboard', () => {
  const base = {
    mechanism: 'book_built' as const, lotSize: 1_000,
    priceFloor: 100, priceCap: 100,
    ofs: { basis: 'shares' as const, value: 1_000_000 },
    // carries both HNI rows, so the last case can prove the rupee bands are
    // untouched and only the retail lot floor moves
    reservation: { retail: 50, hni: 20, hni2: 10, qib: 20 },
  };
  const retailOf = (board: 'mainboard' | 'sme') =>
    computeIssue({ ...base, board }).primary!.categories.find((c) => c.key === 'retail')!;

  it('asks SME retail for TWO lots and Mainboard for one', () => {
    expect(retailOf('mainboard').minLots).toBe(1);
    expect(retailOf('sme').minLots).toBe(2);
  });

  it('agrees with the API rule: minApp = lot x (sme ? 2 : 1) x price', () => {
    for (const board of ['mainboard', 'sme'] as const) {
      const r = retailOf(board);
      expect(r.minAppAmount).toBe(1_000 * (board === 'sme' ? 2 : 1) * 100);
    }
  });

  it('halves the SME forms-for-1x, because each form is twice the size', () => {
    expect(retailOf('sme').appsFor1x).toBe(retailOf('mainboard').appsFor1x! / 2);
  });

  it('leaves the rupee bands alone — only the lot floor differs', () => {
    const m = computeIssue({ ...base, board: 'mainboard' }).primary!;
    const s = computeIssue({ ...base, board: 'sme' }).primary!;
    for (const k of ['hni', 'hni2']) {
      expect(s.categories.find((c) => c.key === k)!.minLots)
        .toBe(m.categories.find((c) => c.key === k)!.minLots);
    }
  });
});

describe('computeIssue — price band and calendar', () => {
  const find = (r: ReturnType<typeof computeIssue>, code: string) => r.issues.filter((i) => i.code === code);

  it('B08 — the cap may not exceed the floor by more than 20%', () => {
    expect(find(computeIssue({ ...MVELECTRO, priceFloor: 400, priceCap: 480 }), 'B08')).toHaveLength(0);
    const wide = computeIssue({ ...MVELECTRO, priceFloor: 400, priceCap: 500 });
    expect(find(wide, 'B08')[0]?.severity).toBe('blocking');
    const inverted = computeIssue({ ...MVELECTRO, priceFloor: 425, priceCap: 400 });
    expect(find(inverted, 'B08')[0]?.message).toMatch(/cap is below the floor/);
  });

  it('B13 — milestone dates only ever move forwards', () => {
    const ok = computeIssue({ ...MVELECTRO, dates: { open: '2026-07-30', close: '2026-08-03', allotment: '2026-08-04', listing: '2026-08-06' } });
    expect(find(ok, 'B13')).toHaveLength(0);
    const back = computeIssue({ ...MVELECTRO, dates: { open: '2026-07-30', close: '2026-08-03', listing: '2026-08-01' } });
    expect(find(back, 'B13')[0]?.severity).toBe('blocking');
  });

  it('B11 / B12 warn rather than block — exchange holidays are not modelled', () => {
    // Thu 30 Jul → Mon 3 Aug is 3 weekdays: inside the 3–10 window
    const r = computeIssue({ ...MVELECTRO, dates: { open: '2026-07-30', close: '2026-08-03', listing: '2026-08-06' } });
    for (const c of [...find(r, 'B11'), ...find(r, 'B12')]) expect(c.severity).toBe('warning');
  });

  it('says nothing at all when no dates are given', () => {
    const r = computeIssue(MVELECTRO);
    expect([...find(r, 'B11'), ...find(r, 'B12'), ...find(r, 'B13')]).toHaveLength(0);
  });
});

describe('computeIssue — B18 SME market maker', () => {
  const sme = {
    board: 'sme' as const, mechanism: 'book_built' as const, lotSize: 100,
    priceFloor: 100, priceCap: 100,
    ofs: { basis: 'shares' as const, value: 1_000_000 },
    reservation: { retail: 50, hni: 35, qib: 15 },
  };
  const b18 = (i: any) => computeIssue(i).issues.filter((x) => x.code === 'B18');

  it('blocks an SME issue with no market-maker carve-out', () => {
    expect(b18(sme)[0]?.severity).toBe('blocking');
    expect(b18(sme)[0]?.message).toMatch(/at least 5%/);
  });

  it('blocks one that is under the floor, and accepts one that meets it', () => {
    // 1,000,000 shares at ₹100 = ₹10 Cr, so 5% = ₹0.5 Cr
    expect(b18({ ...sme, carveouts: [{ key: 'marketmaker', basis: 'amount', value: 0.3 }] })[0]?.severity).toBe('blocking');
    expect(b18({ ...sme, carveouts: [{ key: 'marketmaker', basis: 'amount', value: 0.5 }] })).toHaveLength(0);
  });

  it('never asks a Mainboard issue for one', () => {
    expect(b18({ ...sme, board: 'mainboard' })).toHaveLength(0);
  });
});

/**
 * Spec §5 Step 4 derives TWO mutual-fund figures and they are different
 * numbers. The old field carried only one of them under the name `mfShares`.
 */
describe('computeIssue — the two mutual-fund figures', () => {
  const r = computeIssue(MVELECTRO).primary!.anchor!;

  it('gives a third of the ANCHOR book to mutual funds', () => {
    // 3,070,608 anchor shares x 33.33%, floored to the 34-share lot
    expect(r.anchorMfShares).toBe(floorToLot(3_070_608 * 0.3333, 34));
  });

  it('gives 5% of the POST-ANCHOR qib book to mutual funds', () => {
    expect(r.qibMfShares).toBe(floorToLot(2_047_072 * 0.05, 34));
  });

  it('keeps them distinct — the whole reason both exist', () => {
    expect(r.anchorMfShares).not.toBe(r.qibMfShares);
    expect(r.anchorMfShares).toBeGreaterThan(r.qibMfShares);
  });

  it('lets the RHP override the anchor MF share', () => {
    const custom = computeIssue({ ...MVELECTRO, anchor: { pctOfQib: 60, mfPct: 50 } }).primary!.anchor!;
    expect(custom.anchorMfShares).toBe(floorToLot(3_070_608 * 0.5, 34));
    // the QIB figure is driven by the rule pack, not the RHP, so it holds
    expect(custom.qibMfShares).toBe(r.qibMfShares);
  });

  it('reports no anchor at all when none is configured', () => {
    expect(computeIssue({ ...MVELECTRO, anchor: undefined }).primary!.anchor).toBeUndefined();
  });
});

/**
 * B11 / B12 with the real NSE equity calendar.
 *
 * Holidays are why these were warnings before: counting weekends alone makes a
 * legitimate T+4 look wrong. They block only where the calendar covers the
 * dates, and say so where it does not.
 */
describe('computeIssue — NSE trading calendar', () => {
  const find = (r: ReturnType<typeof computeIssue>, code: string) => r.issues.filter((i) => i.code === code);
  const withDates = (dates: any) => computeIssue({ ...MVELECTRO, dates });

  it('knows Republic Day is not a trading day', () => {
    expect(isTradingHoliday('2026-01-26')).toBe(true);   // Republic Day
    expect(isTradingHoliday('2026-01-27')).toBe(false);  // the Tuesday after
    expect(isTradingHoliday('2026-01-24')).toBe(true);   // a Saturday
  });

  it('counts a holiday out of the listing window, so T+3 still passes', () => {
    // close Wed 2026-03-18 → Holi falls Tue 2026-03-03, outside this window
    expect(find(withDates({ close: '2026-03-18', listing: '2026-03-23' }), 'B12')).toHaveLength(0);
  });

  it('lets SEVEN calendar days be a trading-day T+3 across two holidays', () => {
    // Close Mon 30 Mar. Tue 31st is Mahavir Jayanti and Fri 3 Apr is Good
    // Friday, so the three trading days are Wed 1, Thu 2 and Mon 6 April —
    // a whole week on the calendar, and exactly on time. Counting weekdays
    // alone would have called this T+5 and flagged a correct issue.
    expect(find(withDates({ close: '2026-03-30', listing: '2026-04-06' }), 'B12')).toHaveLength(0);
    expect(find(withDates({ close: '2026-03-30', listing: '2026-04-02' }), 'B12')[0]?.message)
      .toMatch(/2 trading days/);
  });

  it('BLOCKS inside the covered years rather than warning', () => {
    const bad = find(withDates({ close: '2026-03-18', listing: '2026-03-27' }), 'B12');
    expect(bad[0]?.severity).toBe('blocking');
    expect(bad[0]?.message).toMatch(/trading day/);
  });

  it('drops back to a warning outside the calendar, and says why', () => {
    const far = find(withDates({ close: '2031-03-18', listing: '2031-03-27' }), 'B12');
    expect(far[0]?.severity).toBe('warning');
    expect(far[0]?.message).toMatch(/counted on weekends alone/);
  });

  it('measures the bidding window in trading days too', () => {
    // Fri 2026-05-01 is Maharashtra Day, so Thu 30 Apr → Mon 4 May is 2 days
    const r = find(withDates({ open: '2026-04-30', close: '2026-05-04' }), 'B11');
    expect(r[0]?.severity).toBe('blocking');
    expect(r[0]?.message).toMatch(/2 trading days/);
  });
});
