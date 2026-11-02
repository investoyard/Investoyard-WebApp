/**
 * Fixtures are REAL values measured out of JPL's and VNL's allotment data on
 * 2026-10-30, not invented ones — the whole point of this module is that the
 * column is messier than it looks.
 *
 * Jest, with the globals. Do not import from 'vitest': this package has no
 * vitest dependency, `tsconfig.json` compiles `src/**` including the specs, so
 * such an import passes under `npx vitest` and breaks `npm run build`.
 */
import {
  APP_NO_BULK_CONTAINS_MAX, APP_NO_BULK_MAX, APP_NO_MODES, appNoBulkMax,
  cleanAppNo, isAppNoMode, rangeProblem, rangeSpan, seriesPrefix,
} from './appNoSearch';

describe('modes and caps', () => {
  it('knows its three modes and nothing else', () => {
    expect(APP_NO_MODES).toEqual(['exact', 'prefix', 'contains']);
    expect(isAppNoMode('exact')).toBe(true);
    expect(isAppNoMode('prefix')).toBe(true);
    expect(isAppNoMode('contains')).toBe(true);
    expect(isAppNoMode('startsWith')).toBe(false);
    expect(isAppNoMode(undefined)).toBe(false);
  });

  it('caps contains far lower than the index-backed modes, because it is a seq scan', () => {
    expect(appNoBulkMax('exact')).toBe(APP_NO_BULK_MAX);
    expect(appNoBulkMax('prefix')).toBe(APP_NO_BULK_MAX);
    expect(appNoBulkMax('contains')).toBe(APP_NO_BULK_CONTAINS_MAX);
    expect(APP_NO_BULK_CONTAINS_MAX).toBeLessThan(APP_NO_BULK_MAX);
  });
});

describe('cleanAppNo', () => {
  it('trims', () => {
    expect(cleanAppNo('  UPJPL00000001 ')).toBe('UPJPL00000001');
    expect(cleanAppNo(undefined)).toBe('');
    expect(cleanAppNo(null)).toBe('');
  });

  /* 47,92,920 JPL rows contain a lowercase letter. Uppercasing would fail to
     match every Groww application while looking like an empty result. */
  it('NEVER changes case', () => {
    expect(cleanAppNo('GROWW000005b35bd')).toBe('GROWW000005b35bd');
    expect(cleanAppNo('ka02br14455606')).toBe('ka02br14455606');
    expect(cleanAppNo('b8c92fead0b743c1')).toBe('b8c92fead0b743c1');
  });
});

describe('seriesPrefix', () => {
  it('reads the leading non-digit run', () => {
    expect(seriesPrefix('UPJPL00000001')).toBe('UPJPL');
    expect(seriesPrefix('A12462920100001')).toBe('A');
    expect(seriesPrefix('GROWW000005b35bd')).toBe('GROWW');
    expect(seriesPrefix('DHNJPL100002')).toBe('DHNJPL');
  });

  it('is empty for a digit-led series, including one with letters inside it', () => {
    expect(seriesPrefix('1700000001')).toBe('');
    expect(seriesPrefix('2400000042985001')).toBe('');
    expect(seriesPrefix('002E211026000691')).toBe('');
  });
});

describe('rangeProblem', () => {
  it('accepts a same-width pair inside one series', () => {
    expect(rangeProblem('1700000001', '1700010000')).toBeNull();
    expect(rangeProblem('UPJPL00000001', 'UPJPL00005000')).toBeNull();
    expect(rangeProblem('A12462920100001', 'A12462920105000')).toBeNull();
    expect(rangeProblem('2400000042985001', '2400000042999999')).toBeNull();
  });

  it('accepts a single application number as a range of one', () => {
    expect(rangeProblem('1700000001', '1700000001')).toBeNull();
    expect(rangeSpan('1700000001', '1700000001')).toBe(1);
  });

  it('trims before judging, so a pasted cell with spaces still works', () => {
    expect(rangeProblem(' UPJPL00000001', 'UPJPL00005000 ')).toBeNull();
  });

  it('needs both ends', () => {
    expect(rangeProblem('', '1700010000')).toMatch(/both a start and an end/);
    expect(rangeProblem('1700000001', '   ')).toMatch(/both a start and an end/);
    expect(rangeProblem(undefined, undefined)).toMatch(/both a start and an end/);
  });

  /* THE ONE THAT MATTERS. Text-wise '170000001' sorts before '1700001', so a
     short end drops the first 9,000 rows of the range and says nothing. */
  it('REFUSES a mismatched width and names both widths', () => {
    const msg = rangeProblem('1700001', '170010000');
    expect(msg).toMatch(/same length/);
    expect(msg).toMatch(/7 characters/);
    expect(msg).toMatch(/end is 9/);
  });

  it('refuses a mismatched width even when the numbers look sensible', () => {
    expect(rangeProblem('1700000001', '17000100000')).toMatch(/same length/);
    expect(rangeProblem('1', '9999')).toMatch(/same length/);
  });

  it('gets the singular right for a one-character start', () => {
    expect(rangeProblem('1', '99')).toMatch(/is 1 character and the end is 2/);
  });

  it('refuses two different series, which a text range would silently span', () => {
    /* both 13 characters, so the width check passes and the series check is
       what has to catch it. A text range between these two would sweep up
       every series that sorts in between. */
    const msg = rangeProblem('UPJPL00000001', 'DHNJPL0000001');
    expect(msg).toMatch(/different series/);
    expect(msg).toMatch(/UPJPL/);
    expect(msg).toMatch(/DHNJPL/);
    /* and when the widths DO differ, that is reported first */
    expect(rangeProblem('UPJPL00000001', 'DHNJPL00000001')).toMatch(/same length/);
  });

  it('names a digit-led series readably rather than printing an empty quote', () => {
    const msg = rangeProblem('1700000001', 'UPJP000001');
    expect(msg).toMatch(/digits only/);
  });

  it('refuses a reversed pair', () => {
    expect(rangeProblem('1700010000', '1700000001')).toMatch(/start is after the end/);
    expect(rangeProblem('UPJPL00005000', 'UPJPL00000001')).toMatch(/start is after the end/);
  });
});

describe('rangeSpan', () => {
  it('counts the application numbers a range covers', () => {
    expect(rangeSpan('1700000001', '1700010000')).toBe(10000);
    expect(rangeSpan('UPJPL00000001', 'UPJPL00005000')).toBe(5000);
    expect(rangeSpan('A12462920100001', 'A12462920100010')).toBe(10);
  });

  /* A Groww id has no count, and claiming one would be a made-up denominator
     under a real numerator. */
  it('is null for a non-numeric tail', () => {
    expect(rangeSpan('GROWW000005b35bd', 'GROWW00000ffffff')).toBeNull();
    expect(rangeSpan('b8c92fead0b743c1', 'b8c92fead0b743c9')).toBeNull();
  });

  it('is null when the pair is not a range at all', () => {
    expect(rangeSpan('1700001', '170010000')).toBeNull();
    expect(rangeSpan('', '1700010000')).toBeNull();
    expect(rangeSpan('1700000001', 'UPJP000001')).toBeNull();
  });

  /* 16-digit series reach 9.96e15, above 2^53 — the money-column trap. The
     arithmetic is BigInt and an unstatable span comes back null. */
  it('does the arithmetic in BigInt and refuses a span past MAX_SAFE_INTEGER', () => {
    expect(rangeSpan('9000000000000001', '9000000000000003')).toBe(3);
    expect(rangeSpan('0000000000000001', '9964330316610780')).toBeNull();
  });

  it('is exact at the top of the 16-digit range, where a double would not be', () => {
    expect(rangeSpan('9964330316610775', '9964330316610780')).toBe(6);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * THE SERIES RECONCILIATION
 *
 * Same rule as above: every fixture is a value measured out of JPL's real
 * allotment data on 2026-11-02, including the series widths and densities that
 * decide whether a range can be enumerated at all.
 */
import {
  APP_NO_MAX_LEN, RANGE_SERIES_MAX_SPAN, SERIES_STATUS_LABEL, bumpByte, memberAt,
  memberFor, normaliseEnds, padMember, seriesParts, seriesProblem, seriesStatus,
  seriesWindow,
} from './appNoSearch';

/** UPJPL: 5,00,088 rows, every value 13 characters, tail 8 decimal digits. */
const UPJPL = () => seriesParts('UPJPL00000001', 'UPJPL00001000')!;

describe('seriesParts', () => {
  it('resolves the smoke-test range into its series', () => {
    const p = UPJPL();
    expect(p.prefix).toBe('UPJPL');
    expect(p.width).toBe(13);
    expect(p.tailWidth).toBe(8);
    expect(p.from).toBe(1n);
    expect(p.to).toBe(1000n);
    expect(p.span).toBe(1000);
  });

  it('resolves a digits-only series, where the prefix is empty', () => {
    const p = seriesParts('1700000001', '1700000010')!;
    expect(p.prefix).toBe('');
    expect(p.tailWidth).toBe(10);
    expect(p.span).toBe(10);
  });

  it('is null for a GROWW id, whose tail is hexadecimal', () => {
    // GROWW is 30,11,479 rows and only 27,437 of them have a decimal tail.
    expect(seriesParts('GROWW000005b35bd', 'GROWW9ffff69e9b4')).toBeNull();
  });

  it('is null for ends of different widths, different series, or reversed', () => {
    expect(seriesParts('1700001', '170010000')).toBeNull();
    expect(seriesParts('UPJPL00000001', 'DHNJPL000001')).toBeNull();
    expect(seriesParts('UPJPL00001000', 'UPJPL00000001')).toBeNull();
  });

  it('is null when the span cannot be stated honestly in a number', () => {
    // A 16-digit series reaches 9.96e15, above 2^53.
    expect(seriesParts('0000000000000001', '9999999999999999')).toBeNull();
  });

  it('accepts a single-number range', () => {
    expect(seriesParts('UPJPL00000500', 'UPJPL00000500')!.span).toBe(1);
  });
});

describe('members', () => {
  it('pads to the series width', () => {
    expect(padMember('UPJPL', 1n, 8)).toBe('UPJPL00000001');
    expect(padMember('', 1700000001n, 10)).toBe('1700000001');
  });

  it('counts from the start of the range', () => {
    const p = UPJPL();
    expect(memberAt(p, 0)).toBe('UPJPL00000001');
    expect(memberAt(p, 999)).toBe('UPJPL00001000');
  });
});

describe('bumpByte', () => {
  it('increments the last character', () => {
    expect(bumpByte('UPJPL0001')).toBe('UPJPL0002');
  });

  it('turns a trailing 9 into the character above every digit', () => {
    // ':' is 0x3A, so '< UPJPL000:' still covers 'UPJPL0009999'.
    expect(bumpByte('UPJPL0009')).toBe('UPJPL000:');
    expect('UPJPL0009999' < 'UPJPL000:').toBe(true);
  });

  it('bumps a trailing Z plainly, and that is still a correct prefix bound', () => {
    // My first assertion here was that 'Z' needed a CARRY, because 'Z'+1 is
    // '[' (0x5B) and lowercase sits above it. The test caught that it does
    // not: the bumped byte sorts after the original AT THAT POSITION, which
    // decides the comparison before anything after it is read. So a bare bump
    // is correct for every byte below 0xFF.
    expect(bumpByte('ABZ')).toBe('AB[');
    expect('ABZ' < 'AB[').toBe(true);
    expect('ABZa' < 'AB[').toBe(true);
    expect('ABZzzz' < 'AB[').toBe(true);
  });

  it('truncates after the bumped character, which is all an upper bound needs', () => {
    // Only a CARRY truncates, and only 0xFF carries.
    expect(bumpByte('AB\u00ff')).toBe('AC');
    expect('AB\u00ffzz' < 'AC').toBe(true);
  });

  it('is null when there is nothing left to carry into', () => {
    expect(bumpByte('ÿÿ')).toBeNull();
  });
});

describe('seriesWindow', () => {
  it('closes the window on the last member under exact', () => {
    expect(seriesWindow(UPJPL(), 'exact')).toEqual({ gte: 'UPJPL00000001', lte: 'UPJPL00001000' });
  });

  it('opens it past the last member under prefix, so longer numbers come too', () => {
    const w = seriesWindow(UPJPL(), 'prefix')!;
    expect(w.gte).toBe('UPJPL00000001');
    expect(w.lt).toBe('UPJPL00001001');
    expect(w.lte).toBeUndefined();
    // The whole point: a stored value carrying extra digits is inside it.
    expect('UPJPL000010007' < w.lt!).toBe(true);
    expect('UPJPL00001000' < w.lt!).toBe(true);
  });

  it('has no window for contains, which cannot use the index', () => {
    expect(seriesWindow(UPJPL(), 'contains')).toBeNull();
  });

  it('narrows to a batch when asked', () => {
    expect(seriesWindow(UPJPL(), 'exact', 1n, 100n))
      .toEqual({ gte: 'UPJPL00000001', lte: 'UPJPL00000100' });
  });
});

describe('memberFor', () => {
  const p = UPJPL();

  it('attributes an exact row to itself', () => {
    expect(memberFor('UPJPL00000500', p)).toBe('UPJPL00000500');
  });

  it('attributes a LONGER row to the member it begins with', () => {
    expect(memberFor('UPJPL000005007', p)).toBe('UPJPL00000500');
  });

  it('refuses a row outside the range, which a string window can admit', () => {
    expect(memberFor('UPJPL00009999', p)).toBeNull();
  });

  it('refuses a shorter row, a foreign prefix and a non-decimal head', () => {
    expect(memberFor('UPJPL0001', p)).toBeNull();
    expect(memberFor('DHNJPL100002', p)).toBeNull();
    expect(memberFor('UPJPLab000001', p)).toBeNull();
  });

  it('works on the JPL series, where a short needle really does match longer rows', () => {
    // Measured: JPL1 -> JPL10000000007, 84,241 rows from 2 needles.
    const jpl = seriesParts('JPL1', 'JPL9')!;
    expect(memberFor('JPL10000000007', jpl)).toBe('JPL1');
    expect(memberFor('JPL1720224210', jpl)).toBe('JPL1');
  });
});

describe('seriesStatus', () => {
  it('calls a byte-identical row full and a longer one partial', () => {
    expect(seriesStatus('UPJPL00000500', 'UPJPL00000500')).toBe('full');
    expect(seriesStatus('UPJPL000005007', 'UPJPL00000500')).toBe('partial');
    expect(SERIES_STATUS_LABEL.full).toBe('Matched (full)');
    expect(SERIES_STATUS_LABEL.missing).toBe('Not found');
  });
});

describe('seriesProblem', () => {
  it('passes the smoke-test range in every mode that can serve it', () => {
    expect(seriesProblem('UPJPL00000001', 'UPJPL00001000', 'exact')).toBeNull();
    expect(seriesProblem('UPJPL00000001', 'UPJPL00001000', 'prefix')).toBeNull();
  });

  it('defaults to exact when the mode is missing or junk', () => {
    expect(seriesProblem('UPJPL00000001', 'UPJPL00001000')).toBeNull();
    expect(seriesProblem('UPJPL00000001', 'UPJPL00001000', 'nonsense')).toBeNull();
  });

  it('still reports the width mismatch first, with both widths named', () => {
    const msg = seriesProblem('1700001', '170010000', 'exact');
    expect(msg).toContain('7');
    expect(msg).toContain('9');
  });

  it('refuses a hexadecimal tail and says there is no number to list', () => {
    expect(seriesProblem('GROWW000005b35bd', 'GROWW9ffff69e9b4', 'exact'))
      .toContain('hexadecimal');
  });

  it('refuses a span past the cap and names the figure', () => {
    // OPJP's real span is 99,99,611 against 1,26,945 rows - 1.3% dense.
    const msg = seriesProblem('OPJP0000102', 'OPJP9999712', 'exact')!;
    expect(msg).toContain('99,99,611');
    expect(msg).toContain('10,00,000');
  });

  it('lets UPJPL’s WHOLE span through, which is what the cap was sized for', () => {
    // 6,04,627 - the widest dense series in the data.
    expect(seriesParts('UPJPL00000001', 'UPJPL00604627')!.span).toBe(604627);
    expect(seriesProblem('UPJPL00000001', 'UPJPL00604627', 'exact')).toBeNull();
  });

  it('refuses contains for anything bigger than a handful, naming the measured cost', () => {
    const msg = seriesProblem('UPJPL00000001', 'UPJPL00001000', 'contains')!;
    expect(msg).toContain('1,000');
    expect(msg).toContain('25');
    expect(seriesProblem('UPJPL00000001', 'UPJPL00000025', 'contains')).toBeNull();
    expect(seriesProblem('UPJPL00000001', 'UPJPL00000026', 'contains')).not.toBeNull();
  });

  it('refuses a blank end before anything else', () => {
    expect(seriesProblem('UPJPL00000001', '', 'exact')).toContain('both');
  });
});

describe('normaliseEnds', () => {
  it('re-pads a short list to the stored width', () => {
    // The operator's case: a list written without the leading zeros.
    const p = seriesParts('UPJPL0001', 'UPJPL1000')!;
    expect(normaliseEnds(p, 13)).toEqual({ from: 'UPJPL00000001', to: 'UPJPL00001000' });
  });

  it('does nothing when the stored width is the same or narrower', () => {
    expect(normaliseEnds(UPJPL(), 13)).toBeNull();
    expect(normaliseEnds(UPJPL(), 9)).toBeNull();
  });

  it('refuses when the range’s own numbers would not fit', () => {
    const p = seriesParts('UPJPL999999', 'UPJPL999999')!;
    expect(normaliseEnds(p, 8)).toBeNull();
  });

  it('refuses a width past what an application number can be', () => {
    expect(normaliseEnds(seriesParts('UPJPL0001', 'UPJPL1000')!, APP_NO_MAX_LEN + 1)).toBeNull();
  });

  it('keeps the series pointing at the same numbers', () => {
    const p = seriesParts('UPJPL0001', 'UPJPL1000')!;
    const n = normaliseEnds(p, 13)!;
    const re = seriesParts(n.from, n.to)!;
    expect(re.from).toBe(p.from);
    expect(re.to).toBe(p.to);
    expect(re.span).toBe(p.span);
  });
});

describe('the cap is a real number, not a placeholder', () => {
  it('is a million, which covers every dense series measured', () => {
    expect(RANGE_SERIES_MAX_SPAN).toBe(1_000_000);
    expect(APP_NO_MAX_LEN).toBeGreaterThan(16);
  });
});
