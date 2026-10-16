/**
 * Fixtures are REAL stored values, read from the catalogue on 16 Oct 2026:
 * HEROMOTORS 78043401–78093400 and ACEVECTOR 78957711–79107710 are two of the
 * 40 configured series, and both are single legacy rows carrying `active: true`
 * and no `kind` — which is the compatibility case these tests exist to pin.
 */
import {
  asbaDocOrder, intendedAsbaDoc, seriesKindForDoc, normSeriesKind,
  activeSeriesMember, pickSeriesRow, resolveSeriesRange, seriesIssues,
  seriesFallbackNote, seriesRowFilled, ASBA_SERIES_KINDS, ASBA_SERIES_FALLBACK,
  type PdfSeriesRow,
} from './asbaForm';

const LEGACY: PdfSeriesRow[] = [
  { member: 'Axis Capital', from: '78043401', to: '78093400', active: true },
];

const THREE: PdfSeriesRow[] = [
  { member: 'Axis Capital', kind: 'resident', from: '78043401', to: '78093400' },
  { member: 'Axis Capital', kind: 'syndicate', from: '78093401', to: '78103400' },
  { member: 'Axis Capital', kind: 'shareholder', from: '78103401', to: '78105400' },
];

const TWO_MEMBERS: PdfSeriesRow[] = [
  ...THREE,
  { member: 'Nuvama', kind: 'resident', from: '81200001', to: '81300000' },
  { member: 'Nuvama', kind: 'syndicate', from: '81300001', to: '81320000' },
];

describe('which blank prints', () => {
  const mb = (amount: number, applicantType?: string) =>
    asbaDocOrder({ board: 'mainboard', amount, applicantType });

  it('mainboard up to and including 5 lakh is the Resident form', () => {
    expect(intendedAsbaDoc({ board: 'mainboard', amount: 14_896 })).toBe('asba_form_resident');
    expect(intendedAsbaDoc({ board: 'mainboard', amount: 499_999 })).toBe('asba_form_resident');
  });

  // The boundary itself, confirmed by the operator: "up to 5 lakh print
  // Physical Resident form, greater than and above 5 lakh print [Syndicate]".
  it('EXACTLY 5,00,000 is still Resident; one rupee more is Syndicate', () => {
    expect(intendedAsbaDoc({ board: 'mainboard', amount: 500_000 })).toBe('asba_form_resident');
    expect(intendedAsbaDoc({ board: 'mainboard', amount: 500_001 })).toBe('asba_form_syndicate');
  });

  it('SME prints the single form at ANY amount — there is no 5 lakh split on SME', () => {
    for (const amt of [14_896, 268_800, 500_001, 1_200_000]) {
      expect(intendedAsbaDoc({ board: 'sme', amount: amt })).toBe('asba_form_single');
    }
  });

  it('an NCD issue takes the single form even when the board says mainboard', () => {
    expect(intendedAsbaDoc({ board: 'mainboard', isNcd: true, amount: 900_000 })).toBe('asba_form_single');
  });

  it('a shareholder applicant tries the shareholder blank first', () => {
    expect(mb(14_896, 'shareholder')[0]).toBe('asba_form_shareholder');
  });

  it('...and falls through to the ordinary amount-based pick when it was never uploaded', () => {
    // This is the long-standing behaviour: the shareholder branch only wins if
    // the blank exists, so the ladder must still reach the amount-based form.
    expect(mb(14_896, 'shareholder')[1]).toBe('asba_form_resident');
    expect(mb(900_000, 'shareholder')[1]).toBe('asba_form_syndicate');
  });

  it('every ladder ends up covering all four blanks, with no repeats', () => {
    for (const order of [mb(1), mb(900_000), mb(1, 'shareholder'), asbaDocOrder({ board: 'sme', amount: 1 })]) {
      expect(new Set(order).size).toBe(order.length);
      expect(order.length).toBe(4);
    }
  });

  it('the last resort is a FIXED order, so identical inputs cannot pick different forms', () => {
    expect(mb(14_896)).toEqual(mb(14_896));
    expect(mb(14_896)).toEqual([
      'asba_form_resident', 'asba_form_single', 'asba_form_syndicate', 'asba_form_shareholder',
    ]);
  });
});

describe('which series the printed form draws from', () => {
  it('maps each blank onto its range', () => {
    expect(seriesKindForDoc('asba_form_resident')).toBe('resident');
    expect(seriesKindForDoc('asba_form_syndicate')).toBe('syndicate');
    expect(seriesKindForDoc('asba_form_shareholder')).toBe('shareholder');
  });

  it('SME single draws from the DEFAULT range, not a fourth series', () => {
    expect(seriesKindForDoc('asba_form_single')).toBe(ASBA_SERIES_FALLBACK);
    expect(ASBA_SERIES_KINDS).not.toContain('single' as never);
  });

  it('is keyed on the form that ACTUALLY printed, not the one we wanted', () => {
    // Shareholder quota, no shareholder blank uploaded → the ladder prints a
    // Resident form, so the number must come from the Resident range.
    const printed = 'asba_form_resident';
    expect(seriesKindForDoc(printed)).toBe('resident');
  });

  it('an unknown or missing doc type takes the default rather than throwing', () => {
    expect(seriesKindForDoc(null)).toBe(ASBA_SERIES_FALLBACK);
    expect(seriesKindForDoc(undefined)).toBe(ASBA_SERIES_FALLBACK);
  });
});

describe('normSeriesKind', () => {
  it('accepts the bare kind, the doc-type spelling, and odd casing', () => {
    expect(normSeriesKind('syndicate')).toBe('syndicate');
    expect(normSeriesKind('asba_form_syndicate')).toBe('syndicate');
    expect(normSeriesKind('  Shareholder ')).toBe('shareholder');
  });
  it('maps single onto the default, the same way seriesKindForDoc does', () => {
    expect(normSeriesKind('single')).toBe(ASBA_SERIES_FALLBACK);
  });
  it('returns null for a legacy row with no kind', () => {
    expect(normSeriesKind(undefined)).toBeNull();
    expect(normSeriesKind('')).toBeNull();
  });
});

describe('which partner is live', () => {
  it('the explicit switch wins', () => {
    expect(activeSeriesMember(TWO_MEMBERS, 'Nuvama')).toBe('Nuvama');
  });

  it('matching ignores case and padding, and the value comes back trimmed', () => {
    expect(activeSeriesMember(TWO_MEMBERS, '  nuvama ')).toBe('nuvama');
    expect(pickSeriesRow(TWO_MEMBERS, '  nuvama ', 'resident')?.from).toBe('81200001');
  });

  it('a switch naming a partner with no series is ignored', () => {
    expect(activeSeriesMember(TWO_MEMBERS, 'JM Financial')).toBe('Axis Capital');
  });

  it('falls back to the legacy per-row active flag', () => {
    expect(activeSeriesMember(LEGACY, undefined)).toBe('Axis Capital');
    expect(activeSeriesMember([{ member: 'A', from: '1' }, { member: 'B', from: '9', active: true }]))
      .toBe('B');
  });

  it('then to the first filled row', () => {
    expect(activeSeriesMember([{ member: 'A', from: '1' }, { member: 'B', from: '9' }])).toBe('A');
  });

  it('is null when nothing is configured, or every slot is empty', () => {
    expect(activeSeriesMember([])).toBeNull();
    expect(activeSeriesMember(undefined)).toBeNull();
    expect(activeSeriesMember([{ member: 'A', kind: 'resident', from: '' }])).toBeNull();
  });
});

describe('which range', () => {
  it('uses the range for its own type when entered', () => {
    expect(pickSeriesRow(THREE, 'Axis Capital', 'syndicate')?.from).toBe('78093401');
    expect(pickSeriesRow(THREE, 'Axis Capital', 'shareholder')?.from).toBe('78103401');
  });

  it('falls back to RESIDENT for a type that was not entered', () => {
    const two = THREE.slice(0, 1); // resident only
    expect(pickSeriesRow(two, 'Axis Capital', 'syndicate')?.from).toBe('78043401');
    expect(pickSeriesRow(two, 'Axis Capital', 'shareholder')?.from).toBe('78043401');
  });

  it('an EMPTY slot is not a range — it falls through to resident', () => {
    const half: PdfSeriesRow[] = [
      { member: 'Axis Capital', kind: 'resident', from: '78043401', to: '78093400' },
      { member: 'Axis Capital', kind: 'syndicate', from: '', to: '' },
    ];
    expect(pickSeriesRow(half, 'Axis Capital', 'syndicate')?.from).toBe('78043401');
  });

  it('with no resident either, any range this partner has is used', () => {
    const only: PdfSeriesRow[] = [{ member: 'Axis Capital', kind: 'syndicate', from: '78093401', to: '78103400' }];
    expect(pickSeriesRow(only, 'Axis Capital', 'shareholder')?.from).toBe('78093401');
  });

  it('never borrows another partner\'s range', () => {
    // Nuvama has no shareholder range, so it takes NUVAMA's default — never
    // Axis Capital's shareholder one, which is the whole point of this test.
    expect(pickSeriesRow(TWO_MEMBERS, 'Nuvama', 'shareholder')?.from).toBe('81300001');
    expect(pickSeriesRow(TWO_MEMBERS, 'Nuvama', 'shareholder')?.member).toBe('Nuvama');
  });

  it('returns null when the partner has nothing', () => {
    expect(pickSeriesRow(THREE, 'JM Financial', 'resident')).toBeNull();
    expect(pickSeriesRow(THREE, null, 'resident')).toBeNull();
  });
});

describe('the DEFAULT range (sir, 16 Oct 2026: Syndicate, was Resident)', () => {
  it('is Syndicate', () => {
    expect(ASBA_SERIES_FALLBACK).toBe('syndicate');
  });

  it('leads the display order, because the first row is the one that serves the rest', () => {
    expect(ASBA_SERIES_KINDS[0]).toBe(ASBA_SERIES_FALLBACK);
    expect(ASBA_SERIES_KINDS).toEqual(['syndicate', 'resident', 'shareholder']);
  });

  it('does NOT swallow a type that has its own range — Resident still wins for a Resident form', () => {
    // The whole risk of moving the default: a ≤5L bid must keep using the
    // Resident range when one is entered, not the Syndicate one.
    expect(pickSeriesRow(THREE, 'Axis Capital', 'resident')?.from).toBe('78043401');
    expect(resolveSeriesRange({ pdfSeries: THREE }, 'asba_form_resident').row?.from).toBe('78043401');
  });

  it('is what every un-entered type falls to', () => {
    const only: PdfSeriesRow[] = [{ member: 'Axis Capital', kind: 'syndicate', from: '900', to: '999' }];
    for (const k of ASBA_SERIES_KINDS) expect(pickSeriesRow(only, 'Axis Capital', k)?.from).toBe('900');
  });
});

describe('a legacy IPO behaves exactly as it does today', () => {
  // All 40 configured IPOs are a single row with no `kind`. Whatever form
  // prints, the number must keep coming from that one range.
  it.each([
    ['asba_form_resident'], ['asba_form_syndicate'], ['asba_form_single'], ['asba_form_shareholder'],
  ] as const)('%s still draws from the one legacy range', (doc) => {
    const got = resolveSeriesRange({ pdfSeries: LEGACY }, doc);
    expect(got.row?.from).toBe('78043401');
    expect(got.member).toBe('Axis Capital');
  });

  it('needs no pdfSeriesMember to resolve', () => {
    expect(resolveSeriesRange({ pdfSeries: LEGACY }).row?.from).toBe('78043401');
  });

  it('an IPO with no series at all resolves to nothing, not to a crash', () => {
    expect(resolveSeriesRange({}, 'asba_form_resident').row).toBeNull();
    expect(resolveSeriesRange(null, 'asba_form_resident').row).toBeNull();
    expect(resolveSeriesRange(undefined).member).toBeNull();
  });
});

describe('resolveSeriesRange, end to end', () => {
  const extra = { pdfSeries: TWO_MEMBERS, pdfSeriesMember: 'Nuvama' };

  it('a >5L mainboard bid under Nuvama takes Nuvama\'s syndicate range', () => {
    const doc = intendedAsbaDoc({ board: 'mainboard', amount: 900_000 });
    const got = resolveSeriesRange(extra, doc);
    expect([got.member, got.kind, got.row?.from]).toEqual(['Nuvama', 'syndicate', '81300001']);
  });

  it('a shareholder bid under Nuvama falls to Nuvama\'s DEFAULT range, not Axis\'s shareholder one', () => {
    const got = resolveSeriesRange(extra, 'asba_form_shareholder');
    expect([got.member, got.kind, got.row?.from]).toEqual(['Nuvama', 'shareholder', '81300001']);
  });

  it('swapping the partner swaps all three ranges together', () => {
    const axis = resolveSeriesRange({ ...extra, pdfSeriesMember: 'Axis Capital' }, 'asba_form_shareholder');
    expect(axis.row?.from).toBe('78103401');
  });

  it('an SME issue under Nuvama draws from the DEFAULT range', () => {
    const doc = intendedAsbaDoc({ board: 'sme', amount: 268_800 });
    expect(resolveSeriesRange(extra, doc).row?.from).toBe('81300001');
  });
});

describe('validation', () => {
  it('passes a clean three-series partner', () => {
    expect(seriesIssues(THREE)).toEqual([]);
  });

  it('passes every one of the 40 legacy single rows, open-ended or not', () => {
    expect(seriesIssues(LEGACY)).toEqual([]);
    expect(seriesIssues([{ member: 'A', from: '100' }])).toEqual([]);
  });

  it('blocks an open-ended range once there is more than one', () => {
    const rows: PdfSeriesRow[] = [
      { member: 'A', kind: 'resident', from: '100', to: '' },
      { member: 'A', kind: 'syndicate', from: '500', to: '600' },
    ];
    const codes = seriesIssues(rows).map((i) => i.code);
    expect(codes).toContain('S-OPEN');
    expect(seriesIssues(rows).every((i) => i.severity === 'blocking')).toBe(true);
  });

  it('blocks overlapping ranges — two form types cannot share numbers', () => {
    const rows: PdfSeriesRow[] = [
      { member: 'A', kind: 'resident', from: '100', to: '200' },
      { member: 'A', kind: 'syndicate', from: '150', to: '300' },
    ];
    expect(seriesIssues(rows).map((i) => i.code)).toContain('S-OVERLAP');
  });

  it('catches an overlap ACROSS partners too — swapping must not reuse numbers', () => {
    const rows: PdfSeriesRow[] = [
      { member: 'Axis Capital', kind: 'resident', from: '100', to: '200' },
      { member: 'Nuvama', kind: 'resident', from: '180', to: '400' },
    ];
    expect(seriesIssues(rows).map((i) => i.code)).toContain('S-OVERLAP');
  });

  it('adjacent ranges do NOT overlap', () => {
    const rows: PdfSeriesRow[] = [
      { member: 'A', kind: 'resident', from: '100', to: '200' },
      { member: 'A', kind: 'syndicate', from: '201', to: '300' },
    ];
    expect(seriesIssues(rows)).toEqual([]);
  });

  it('blocks a reversed range', () => {
    expect(seriesIssues([{ member: 'A', kind: 'resident', from: '900', to: '100' }]).map((i) => i.code))
      .toContain('S-ORDER');
  });

  it('ignores empty slots entirely', () => {
    const rows: PdfSeriesRow[] = [
      { member: 'A', kind: 'resident', from: '100', to: '200' },
      { member: 'A', kind: 'syndicate', from: '', to: '' },
      { member: 'A', kind: 'shareholder', from: '', to: '' },
    ];
    expect(seriesIssues(rows)).toEqual([]);
  });
});

describe('the hint under an empty slot', () => {
  it('says nothing when the type has its own range', () => {
    expect(seriesFallbackNote(THREE, 'Axis Capital', 'syndicate')).toBeNull();
  });
  it('names the range a missing type will borrow', () => {
    const only = THREE.slice(0, 1);
    expect(seriesFallbackNote(only, 'Axis Capital', 'shareholder'))
      .toBe('Will use Physical Resident Form range (78043401–78093400).');
  });
  it('warns when nothing is entered at all', () => {
    expect(seriesFallbackNote([], null, 'resident')).toBe('No series entered — forms will print without a number.');
  });
});

describe('seriesRowFilled', () => {
  it('is From alone — a range with no To is still usable on its own', () => {
    expect(seriesRowFilled({ from: '100' })).toBe(true);
    expect(seriesRowFilled({ from: '', to: '200' })).toBe(false);
    expect(seriesRowFilled({})).toBe(false);
    expect(seriesRowFilled(null)).toBe(false);
  });
});
