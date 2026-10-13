/**
 * `offeredFromIpo()` — the poller's denominator.
 *
 * WHY THIS FILE EXISTS. This one function decides whether an issue gets ANY
 * subscription data at all: `computeSubs` returns `[]` the moment it has no map,
 * and the write is destructive, so a missing denominator means the exchange's
 * demand is fetched and thrown away on every tick with nothing stored. That loss
 * is permanent — the usual rescue, `nseShares ÷ timesSubscribed`, needs a row
 * that was written. It has now produced three separate operator reports (the
 * carve-out categories in September, then ten SME issues closing empty in
 * October) and had no test of any kind.
 *
 * It is exported solely so this file can reach it. Everything else in
 * `subscription.service.ts` needs DI; this is pure.
 */
import { offeredFromIpo } from './offered';

/** A book-built SME record: band ₹50–53, ₹30.21 Cr, split typed as percentages. */
const BOOK_BUILT = {
  issueSize: 30.21e7,
  priceBandMax: 53,
  priceBandMin: 50,
  extra: {
    shareResv: { qib: { pct: '50' }, hni: { pct: '10' }, hni2: { pct: '5' }, retail: { pct: '35' } },
  },
};

/** SJP as stored: FIXED price, so `priceBandMax` is null and ₹67 sits in `priceBandMin`. */
const FIXED_PRICE = {
  issueSize: 22.27e7,
  priceBandMax: null,
  priceBandMin: 67,
  extra: {
    totalShares: '3324000',
    totalSharesSource: 'derived',
    shareResv: { qib: { pct: '50' }, hni: { pct: '10' }, hni2: { pct: '5' }, retail: { pct: '35' } },
  },
};

describe('no reservation table means NO denominator — the hard prerequisite', () => {
  it('returns null when `shareResv` is absent entirely', () => {
    expect(offeredFromIpo({ issueSize: 30.21e7, priceBandMax: 53, extra: {} })).toBeNull();
  });

  it('returns null when every row is blank — the shape the ten October SME issues had', () => {
    const empty = {
      ...BOOK_BUILT,
      extra: { shareResv: { qib: { pct: '' }, hni: { pct: '' }, retail: { pct: '' } } },
    };
    expect(offeredFromIpo(empty)).toBeNull();
  });

  it('a market-maker carve-out alone is NOT enough — it is not one of the seven categories', () => {
    const mmOnly = {
      ...BOOK_BUILT,
      extra: {
        shareResv: { qib: { pct: '' } },
        carveouts: { marketmaker: '300000' },
        carveoutBasis: { marketmaker: 'shares' },
      },
    };
    expect(offeredFromIpo(mmOnly)).toBeNull();
  });

  it('PERCENTAGES ALONE are enough — no share counts needed', () => {
    const m = offeredFromIpo(BOOK_BUILT)!;
    expect(m).not.toBeNull();
    // ₹30.21 Cr ÷ ₹53 = 57,00,000 shares
    expect(Math.round(m.get('qib')!)).toBe(28_50_000);
    expect(Math.round(m.get('retail')!)).toBe(19_95_000);
  });
});

describe('a FIXED-PRICE issue has its price in priceBandMin, not priceBandMax', () => {
  /**
   * The October bug. `priceBandMax` is NULL on a fixed-price record, and reading
   * only the cap left the function with no price at all — so SJP and SOLLFEGE
   * could never have got a denominator however complete their tables were.
   */
  it('derives a denominator from the floor when the cap is null', () => {
    const m = offeredFromIpo(FIXED_PRICE)!;
    expect(m).not.toBeNull();
    // ₹22.27 Cr ÷ ₹67 = 33,23,880 shares
    expect(Math.round(m.get('qib')!)).toBe(16_61_940);
    expect(Math.round(m.get('retail')!)).toBe(11_63_358);
  });

  it('still prefers the CAP when both are present, so a band issue is unchanged', () => {
    const m = offeredFromIpo(BOOK_BUILT)!;
    // at the ₹50 floor QIB would be 30,21,000 — the cap's 28,50,000 is what we want
    expect(Math.round(m.get('qib')!)).toBe(28_50_000);
  });

  it('a ₹ carve-out also resolves at the floor on a fixed-price issue', () => {
    const withEmp = {
      ...FIXED_PRICE,
      extra: { ...FIXED_PRICE.extra, carveouts: { employee: '0.67' }, carveoutBasis: { employee: 'amount' } },
    };
    // ₹0.67 Cr ÷ ₹67 = 1,00,000 shares. Absent before the fix: no price, no bucket.
    expect(Math.round(offeredFromIpo(withEmp)!.get('employee')!)).toBe(1_00_000);
  });
});

describe('the stated total is honoured only when the OPERATOR stated it', () => {
  /**
   * `Total issue size (shares)` fills itself when left blank and stamps
   * `derived`, so a `derived` count is our own `round(₹ total ÷ cap)` snapshot —
   * and it goes stale the moment the issue size is corrected underneath it.
   * NITYAS is the live case: its derived 1,44,65,333 implies ₹108.49 Cr against
   * a stored ₹108.42 Cr, and honouring it would have moved a live denominator
   * by 0.065% in favour of a figure nothing stands behind.
   */
  const base = {
    issueSize: 108.42e7,
    priceBandMax: 75,
    priceBandMin: 70,
    extra: { shareResv: { qib: { pct: '50' } } },
  };

  it('IGNORES a `derived` count and uses the current issue size — the NITYAS guard', () => {
    const m = offeredFromIpo({
      ...base,
      extra: { ...base.extra, totalShares: '14465333', totalSharesSource: 'derived' },
    })!;
    expect(Math.round(m.get('qib')!)).toBe(72_28_000);      // 108.42 Cr / 75 / 2
    expect(Math.round(m.get('qib')!)).not.toBe(72_32_667);   // what the stale count gives
  });

  it('USES an `operator` count, which is read off the document', () => {
    const m = offeredFromIpo({
      ...base,
      extra: { ...base.extra, totalShares: '14465333', totalSharesSource: 'operator' },
    })!;
    expect(Math.round(m.get('qib')!)).toBe(72_32_667);
  });

  it('ignores a count with no provenance at all, as the legacy rows have', () => {
    const m = offeredFromIpo({ ...base, extra: { ...base.extra, totalShares: '14465333' } })!;
    expect(Math.round(m.get('qib')!)).toBe(72_28_000);
  });
});

describe('the vestigial `on` flag is not read', () => {
  /**
   * SKYWAYS as stored: `on: false` on every row, beside a percentage AND a
   * count. Five mainboard records look like this — ANNU · SYMBIOTEC · HYTECH ·
   * SKYWAYS · LUMINO — and while the flag was honoured this resolver returned
   * an EMPTY MAP for them, which is the one condition `computeSubs` cannot
   * recover from: it discards the exchange's demand on every tick and nothing
   * is stored. All five closed long before this was found, so nothing was
   * actually lost; the fix is so that a flag three other readers now ignore
   * cannot go on meaning something here.
   */
  const SKYWAYS = {
    issueSize: 4140000000,
    priceBandMin: 131,
    priceBandMax: 138,
    lotSize: 100,
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

  it('resolves every bucket, where it used to return nothing at all', () => {
    const m = offeredFromIpo(SKYWAYS as any);
    expect(m).not.toBeNull();
    expect([...m!.keys()].sort()).toEqual(['hni', 'hni2', 'qib', 'retail']);
    // UPPER band, per the industry convention
    expect(m!.get('qib')).toBe(14976000);
    expect(m!.get('retail')).toBe(10512000);
  });

  it('still leaves out a row holding neither a percentage nor a count', () => {
    expect(offeredFromIpo(SKYWAYS as any)!.has('other' as any)).toBe(false);
  });
});

describe('precedence between the three sources', () => {
  it('a stored COUNT wins for its own bucket, whatever the percentages imply', () => {
    const m = offeredFromIpo({
      ...BOOK_BUILT,
      extra: { shareResv: { qib: { pct: '50', sharesUpper: '9999999' }, retail: { pct: '35' } } },
    })!;
    expect(m.get('qib')).toBe(9999999);
  });

  it('the IMPLIED total outranks an operator count, because it matches the counts beside it', () => {
    /* qib 60,00,000 at 50% implies a 1,20,00,000-share offer. The operator's
       stated 90,00,000 must not become retail's denominator while QIB's own
       numerator says otherwise — one bucket disagreeing with its neighbour is
       worse than either figure being slightly off. */
    const m = offeredFromIpo({
      ...BOOK_BUILT,
      extra: {
        totalShares: '9000000', totalSharesSource: 'operator',
        shareResv: { qib: { pct: '50', sharesUpper: '6000000' }, retail: { pct: '35' } },
      },
    })!;
    expect(m.get('qib')).toBe(6000000);
    expect(Math.round(m.get('retail')!)).toBe(42_00_000); // 35% of 1,20,00,000
  });

  it('a carve-out fills a reserved category the reservation table does not cover', () => {
    /* RUNWALENTR, 2026-09-28: 1,20,275 employee shares reserved, no employee row
       in `shareResv`, and the exchange's employee demand was discarded. */
    const m = offeredFromIpo({
      ...BOOK_BUILT,
      extra: {
        ...BOOK_BUILT.extra,
        carveouts: { employee: '120275' },
        carveoutBasis: { employee: 'shares' },
      },
    })!;
    expect(m.get('employee')).toBe(120275);
  });

  it('a typed employee count still beats the carve-out', () => {
    const m = offeredFromIpo({
      ...BOOK_BUILT,
      extra: {
        shareResv: { ...BOOK_BUILT.extra.shareResv, employee: { pct: '', sharesUpper: '54496' } },
        carveouts: { employee: '120275' },
        carveoutBasis: { employee: 'shares' },
      },
    })!;
    expect(m.get('employee')).toBe(54496);
  });

  it('IGNORES a row switched explicitly off — the flag is vestigial', () => {
    const m = offeredFromIpo({
      ...BOOK_BUILT,
      extra: { shareResv: { ...BOOK_BUILT.extra.shareResv, hni2: { pct: '5', on: false } } },
    })!;
    expect(m.has('hni2')).toBe(true);
    expect(m.has('hni')).toBe(true);
  });
});
