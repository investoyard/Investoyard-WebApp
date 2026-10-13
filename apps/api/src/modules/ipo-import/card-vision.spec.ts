/**
 * The IPO-card parser's defensive layer.
 *
 * Everything here is built from the FIRST REAL CARD put through it — HD Fire
 * Protect, 2026-10-07 — which found four separate faults in one upload. The
 * model's reading itself cannot be unit-tested (it is a Vision call), but the
 * shape-defence and the arithmetic guard around it can, and those are what
 * decide whether a misread reaches the form pre-ticked.
 */
import { parseCardJsonForTest } from './card-vision.service';

/** The reservation block exactly as the model returned it for HD Fire Protect. */
const HDFIRE_BAD_HNI = JSON.stringify({
  name: 'HD Fire Protect Limited',
  reservation: { qib: 50, hni: 15, hni2: 5, retail: 35 },
  warnings: [],
});

describe('the combined-HNI misread is caught by arithmetic', () => {
  it('drops Big HNI and explains why, on the real HD Fire Protect numbers', () => {
    const p = parseCardJsonForTest(HDFIRE_BAD_HNI);
    // 50 + 15 + 5 + 35 = 105; dropping Small HNI gives exactly 100
    expect(p.reservation).toEqual({ qib: 50, hni2: 5, retail: 35 });
    expect(p.reservation!.hni).toBeUndefined();
    expect(p.warnings.join(' ')).toMatch(/Big HNI/i);
    expect(p.warnings.join(' ')).toMatch(/probably 10/);
  });

  it('leaves a correct split alone and adds no warning', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      reservation: { qib: 50, hni: 10, hni2: 5, retail: 35 }, warnings: [],
    }));
    expect(p.reservation).toEqual({ qib: 50, hni: 10, hni2: 5, retail: 35 });
    expect(p.warnings).toHaveLength(0);
  });

  it('leaves an SME split alone — a tiny QIB is legal, not a fault', () => {
    /* DOVE SOFT gave QIB 1.03% of the net offer. A percentage that looks absurd
       beside a mainboard issue must not trip this guard. */
    const p = parseCardJsonForTest(JSON.stringify({
      reservation: { qib: 1.03, hni: 32.64, hni2: 16.33, retail: 50 }, warnings: [],
    }));
    expect(p.reservation!.hni).toBe(32.64);
    expect(p.warnings).toHaveLength(0);
  });

  it('does NOT fire when a category is missing — there is nothing to reconcile', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      reservation: { qib: 50, hni: 15, retail: 35 }, warnings: [],
    }));
    expect(p.reservation!.hni).toBe(15);
    expect(p.warnings).toHaveLength(0);
  });

  it('keeps the model’s own warnings and appends to them', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      reservation: { qib: 50, hni: 15, hni2: 5, retail: 35 },
      warnings: ['Issue Detail shows No Fresh Issue'],
    }));
    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toMatch(/No Fresh Issue/);
  });
});

describe('the Fresh / OFS legs stay on their own lines', () => {
  it('reports an OFS-only card with NO fresh leg', () => {
    /* HD Fire Protect: "-----No Fresh Issue-----" above
       "26,284,500 OFS Shares worth Rs 712.13 Cr." The model first reported those
       shares as `fresh`, which is the leg the card explicitly says does not
       exist. Nothing downstream can detect that, so it has to come back right. */
    const p = parseCardJsonForTest(JSON.stringify({
      ofs: { basis: 'shares', value: 26284500 },
      issueSizeCr: 712.13,
      warnings: ['Issue Detail shows No Fresh Issue'],
    }));
    expect(p.fresh).toBeNull();
    expect(p.ofs).toEqual({ basis: 'shares', value: 26284500 });
  });

  it('drops a leg reported with a zero or missing value rather than storing 0', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      fresh: { basis: 'shares', value: 0 }, ofs: { basis: 'amount' }, warnings: [],
    }));
    expect(p.fresh).toBeNull();
    expect(p.ofs).toBeNull();
  });

  it('defaults an unstated basis to amount, never to shares', () => {
    // a rupee figure misfiled as a share count would be a 10^7 error
    const p = parseCardJsonForTest(JSON.stringify({ fresh: { value: 500 }, warnings: [] }));
    expect(p.fresh).toEqual({ basis: 'amount', value: 500 });
  });
});

describe('the shape is defended, not trusted', () => {
  it('strips markdown fences the model sometimes wraps JSON in', () => {
    const p = parseCardJsonForTest('```json\n{"name":"X Ltd","warnings":[]}\n```');
    expect(p.name).toBe('X Ltd');
  });

  it('finds the object when the model wraps it in prose', () => {
    const p = parseCardJsonForTest('Here you go:\n{"name":"X Ltd","warnings":[]}\nHope that helps.');
    expect(p.name).toBe('X Ltd');
  });

  it('rejects a date that is not ISO rather than passing it to the form', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      openDate: '13-Oct-2026', closeDate: '2026-10-15', warnings: [],
    }));
    expect(p.openDate).toBeNull();          // the form would not accept it
    expect(p.closeDate).toBe('2026-10-15');
  });

  it('keeps crossCheck separate and never promotes it into shares', () => {
    const p = parseCardJsonForTest(JSON.stringify({
      shares: { qib: 13106681 },
      crossCheck: { minBid: { retail: 55, hni2: 770, hni: 3740 }, applications: { retail: 166812 } },
      warnings: [],
    }));
    expect(p.shares).toEqual({ qib: 13106681 });
    expect(p.crossCheck.minBid).toEqual({ retail: 55, hni2: 770, hni: 3740 });
    expect(p.crossCheck.applications).toEqual({ retail: 166812 });
  });

  it('throws on something that is not JSON at all', () => {
    expect(() => parseCardJsonForTest('I could not read this image.')).toThrow(/JSON/i);
  });

  it('survives an empty object without inventing anything', () => {
    const p = parseCardJsonForTest('{}');
    expect(p.name).toBeNull();
    expect(p.reservation).toBeNull();
    expect(p.leadManagers).toEqual([]);
    expect(p.warnings).toEqual([]);
  });
});
