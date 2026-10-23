/* No vitest import — this package runs on jest and takes its globals from
   @types/jest; importing a runner it has no dependency on fails the BUILD. */
import { DAY_WISE_COLUMNS, dayValue, dayWiseRows, hasAppFigures } from './dayWise';

/* Shapes are the real stored ones, read off CORE4 on 2026-10-23:
   { d, qib, nii, hni, hni2, retail, employee, shareholder, total, apps }
   and the hourly entry adds `t: "15:00"`. Note `t`, not `h`. */

describe('dayWiseRows', () => {
  const log = [
    { d: '2026-10-20', qib: 0.4, total: 0.5 },
    { d: '2026-10-21', qib: 1.2, total: 1.1 },
    { d: '2026-10-23', qib: 3.3, total: 2.9 },
  ];

  it('numbers by POSITION in the log, so a weekend cannot skip a bidding day', () => {
    /* 21st to 23rd is a gap, and these are still days 2 and 3. A date
       subtraction would have called the last one day 4. */
    const rows = dayWiseRows(log, [], '2026-10-23');
    expect(rows.map((r) => [r.d, r.dayNo])).toEqual([
      ['2026-10-23', 3],
      ['2026-10-21', 2],
      ['2026-10-20', 1],
    ]);
  });

  it('returns days newest first while numbering from the first', () => {
    const rows = dayWiseRows(log, [], undefined);
    expect(rows[0].d).toBe('2026-10-23');
    expect(rows[0].dayNo).toBe(3);
    expect(rows[rows.length - 1].dayNo).toBe(1);
  });

  it('flags the close date as the last day, and only that one', () => {
    const rows = dayWiseRows(log, [], '2026-10-23');
    expect(rows.filter((r) => r.isLast).map((r) => r.d)).toEqual(['2026-10-23']);
  });

  it('flags nothing when the issue has no close date on the record', () => {
    expect(dayWiseRows(log, [], undefined).some((r) => r.isLast)).toBe(false);
  });

  it('groups hourly snapshots under their day, earliest first', () => {
    const hours = [
      { d: '2026-10-23', t: '15:00', total: 2.9 },
      { d: '2026-10-21', t: '11:00', total: 0.8 },
      { d: '2026-10-23', t: '11:00', total: 2.1 },
      { d: '2026-10-23', t: '13:00', total: 2.5 },
    ];
    const rows = dayWiseRows(log, hours, '2026-10-23');
    expect(rows[0].hours.map((h) => h.t)).toEqual(['11:00', '13:00', '15:00']);
    expect(rows[1].hours.map((h) => h.t)).toEqual(['11:00']);
    /* A day with no hourly entries gets an empty list, not undefined — the
       surface decides whether to offer a drill-down from its length. */
    expect(rows[2].hours).toEqual([]);
  });

  it('drops entries with no date rather than numbering them', () => {
    const rows = dayWiseRows([{ total: 1 }, { d: '2026-10-21', total: 2 }], [], undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].dayNo).toBe(1);
  });

  it('survives missing logs entirely — most of the catalogue has none', () => {
    expect(dayWiseRows(undefined, undefined, undefined)).toEqual([]);
    expect(dayWiseRows(null, null, '2026-10-23')).toEqual([]);
    expect(dayWiseRows([], [], undefined)).toEqual([]);
  });

  it('ignores hourly entries for a day the daily log does not carry', () => {
    const rows = dayWiseRows(log, [{ d: '2026-10-19', t: '10:00', total: 0.1 }], undefined);
    expect(rows.every((r) => r.hours.every((h) => h.d === r.d))).toBe(true);
    expect(rows.flatMap((r) => r.hours)).toEqual([]);
  });
});

describe('hasAppFigures', () => {
  it('is true when any entry carries a count or a multiple', () => {
    expect(hasAppFigures([{ d: '1', apps: { retail: { n: 105, x: 0.07 } } }], [])).toBe(true);
    /* A count with no multiple still counts — QIB has no application multiple
       and its bid count is real. */
    expect(hasAppFigures([{ d: '1', apps: { qib: { n: 2 } } }], [])).toBe(true);
  });

  it('looks in the hourly log too', () => {
    expect(hasAppFigures([{ d: '1' }], [{ d: '1', t: '11:00', apps: { total: { n: 9, x: 0.1 } } }])).toBe(true);
  });

  it('is false for a log written before application figures existed', () => {
    expect(hasAppFigures([{ d: '1', qib: 2, total: 1.5 }], [])).toBe(false);
    expect(hasAppFigures([{ d: '1', apps: {} }], [])).toBe(false);
    expect(hasAppFigures([{ d: '1', apps: null }], [])).toBe(false);
    expect(hasAppFigures([{ d: '1', apps: { retail: { n: null, x: null } } }], [])).toBe(false);
    expect(hasAppFigures(undefined, undefined)).toBe(false);
  });
});

describe('dayValue', () => {
  it('falls back to the combined NII for a legacy bHNI row', () => {
    /* Logged before the split, a row carries `nii` alone — reading `hni` and
       showing nothing would lose the only NII figure such a row has. */
    expect(dayValue({ d: '1', nii: 0.04 }, 'hni')).toBe(0.04);
  });

  it('prefers the split figure once it is there', () => {
    expect(dayValue({ d: '1', nii: 0.04, hni: 0.02 }, 'hni')).toBe(0.02);
  });

  it('does not apply the fallback to any other column', () => {
    expect(dayValue({ d: '1', nii: 0.04 }, 'hni2')).toBeUndefined();
    expect(dayValue({ d: '1', nii: 0.04 }, 'qib')).toBeUndefined();
  });

  it('keeps null distinct from absent — the poller logs an explicit null', () => {
    expect(dayValue({ d: '1', qib: null }, 'qib')).toBeNull();
  });
});

describe('DAY_WISE_COLUMNS', () => {
  it('is QIB, the two HNI bands, Retail, Total — in that order', () => {
    expect(DAY_WISE_COLUMNS.map((c) => c.key)).toEqual(['qib', 'hni', 'hni2', 'retail', 'total']);
  });

  it('marks only the two HNI bands as sub-rows of the NII quota', () => {
    expect(DAY_WISE_COLUMNS.filter((c) => c.sub).map((c) => c.key)).toEqual(['hni', 'hni2']);
  });
});
