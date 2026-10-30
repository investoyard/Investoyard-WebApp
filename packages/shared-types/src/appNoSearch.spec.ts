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
