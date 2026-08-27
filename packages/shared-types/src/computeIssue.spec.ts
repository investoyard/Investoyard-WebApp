/**
 * Fixture: MV Electrosystems (MVELECTRO) — Mainboard, book-built, ICDR 6(2).
 * Every expected value comes from §5/§6/§9 of docs/ipo-entry-spec.md, which was
 * reconciled against the live legacy screen. If the engine disagrees with a
 * number here, the fixture is right.
 */
import { computeIssue, floorToLot, IssueInputs } from './computeIssue';

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
  it('reports only B10 on a fixed-price issue with an anchor', () => {
    const r = computeIssue({
      ...MVELECTRO, mechanism: 'fixed_price', fixedPrice: 425, anchor: { pctOfQib: 60 },
    });
    expect(r.issues.map((i) => i.code)).toEqual(['B10']);
  });
});
