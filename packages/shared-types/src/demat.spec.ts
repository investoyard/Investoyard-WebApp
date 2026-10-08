/**
 * Multiple demat accounts per profile.
 *
 * The risky case is not the list — it is `dematForApplication`, which decides
 * which demat a BID names to the exchange. Getting it wrong credits someone
 * else's account, so the fallbacks are pinned deliberately.
 */
import { dematAccountsFor, dematForApplication, dematLabel, type ExtraDemat } from './demat';

const DEFAULT = { depository: 'NSDL' as const, dpId: '12345678', clientId: '87654321' };
const ZERODHA: ExtraDemat = { id: 'z1', depository: 'CDSL', dpId: '12088700', clientId: '11223344', label: 'Zerodha' };
const HDFC: ExtraDemat = { id: 'h1', depository: 'NSDL', dpId: 'IN300476', clientId: '10203040', label: 'HDFC Sec' };

describe('the list puts the profile’s own demat first', () => {
  it('a profile with no extras still has one account', () => {
    const list = dematAccountsFor(DEFAULT, []);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBeNull();
    expect(list[0].isDefault).toBe(true);
  });

  it('extras follow the default, in order, and are not default', () => {
    const list = dematAccountsFor(DEFAULT, [ZERODHA, HDFC]);
    expect(list.map((d) => d.id)).toEqual([null, 'z1', 'h1']);
    expect(list.filter((d) => d.isDefault)).toHaveLength(1);
  });

  it('drops a RETIRED extra', () => {
    const list = dematAccountsFor(DEFAULT, [{ ...ZERODHA, active: false }, HDFC]);
    expect(list.map((d) => d.id)).toEqual([null, 'h1']);
  });

  it('drops an extra that duplicates the DEFAULT, however it is spaced or cased', () => {
    /* No cross-table constraint can express this — the unique index only covers
       the extras among themselves — so a legacy row could render the same
       account twice in a picker. */
    const dupe: ExtraDemat = { id: 'd1', depository: 'NSDL', dpId: ' 1234 5678 ', clientId: '87654321' };
    expect(dematAccountsFor(DEFAULT, [dupe]).map((d) => d.id)).toEqual([null]);
  });

  it('drops a duplicate BETWEEN two extras', () => {
    const twin: ExtraDemat = { id: 'z2', depository: 'CDSL', dpId: '12088700', clientId: '11223344' };
    expect(dematAccountsFor(DEFAULT, [ZERODHA, twin]).map((d) => d.id)).toEqual([null, 'z1']);
  });

  it('is empty only when there is NOTHING — no default and no extras', () => {
    expect(dematAccountsFor(null, [])).toEqual([]);
    expect(dematAccountsFor({ depository: 'NSDL', dpId: '', clientId: '' }, [])).toEqual([]);
  });

  /**
   * CDSL HAS NO DP ID. `profiles.service` stores `dpId: ''` for every CDSL
   * account deliberately — the 16-digit client id is the whole identifier — so
   * a presence test demanding both fields drops every CDSL demat there is.
   * It did, for an hour, and a CDSL profile then resolved to NO account at all.
   */
  it('keeps a CDSL DEFAULT, whose dpId is correctly blank', () => {
    const cdsl = { depository: 'CDSL' as const, dpId: '', clientId: '1208870011223344' };
    const list = dematAccountsFor(cdsl, []);
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
    expect(list[0].clientId).toBe('1208870011223344');
  });

  it('keeps a CDSL EXTRA alongside an NSDL default', () => {
    const extra: ExtraDemat = { id: 'z1', depository: 'CDSL', dpId: '', clientId: '1208870011223344', label: 'Zerodha' };
    expect(dematAccountsFor(DEFAULT, [extra]).map((d) => d.id)).toEqual([null, 'z1']);
  });

  it('a CDSL-only applicant can still place a bid', () => {
    const cdsl = { depository: 'CDSL' as const, dpId: '', clientId: '1208870011223344' };
    const d = dematForApplication(cdsl, [], null)!;
    expect(d).not.toBeNull();
    expect(d.clientId).toBe('1208870011223344');
  });

  it('still lists the extras when the profile’s own demat is blank', () => {
    /* The schema makes a profile's demat mandatory, so this is a legacy or
       half-written record. Its extras are real accounts and hiding them would
       stop the investor applying at all — which is a worse answer than listing
       an account with no default beside it. */
    const list = dematAccountsFor({ depository: 'NSDL', dpId: '', clientId: '' }, [ZERODHA]);
    expect(list.map((d) => d.id)).toEqual(['z1']);
    expect(list.some((d) => d.isDefault)).toBe(false);
  });

  it('…and a bid then names that account rather than refusing', () => {
    const d = dematForApplication({ depository: 'NSDL', dpId: '', clientId: '' }, [ZERODHA], null)!;
    expect(d.id).toBe('z1');
  });
});

describe('which demat a bid names — the part that must not guess', () => {
  it('NULL resolves to the default, which is what every pre-2026-10-08 bid means', () => {
    const d = dematForApplication(DEFAULT, [ZERODHA], null)!;
    expect(d.isDefault).toBe(true);
    expect(d.dpId).toBe('12345678');
  });

  it('undefined behaves the same as null — no backfill was needed', () => {
    expect(dematForApplication(DEFAULT, [ZERODHA], undefined)!.isDefault).toBe(true);
  });

  it('a chosen id resolves to that account', () => {
    const d = dematForApplication(DEFAULT, [ZERODHA, HDFC], 'h1')!;
    expect(d.dpId).toBe('IN300476');
    expect(d.depository).toBe('NSDL');
  });

  it('a chosen account that is RETIRED returns null rather than falling back', () => {
    /* Silently using the default would send the exchange a different demat from
       the one the investor picked — a wrong credit, not a wrong screen. The
       caller has to decide, loudly. */
    expect(dematForApplication(DEFAULT, [{ ...ZERODHA, active: false }], 'z1')).toBeNull();
  });

  it('a chosen account belonging to nobody returns null', () => {
    expect(dematForApplication(DEFAULT, [ZERODHA], 'not-a-real-id')).toBeNull();
  });

  it('returns null when the profile has no demat at all', () => {
    expect(dematForApplication(null, [], null)).toBeNull();
  });
});

describe('dematLabel', () => {
  it('names the account when the investor gave it one', () => {
    expect(dematLabel(dematAccountsFor(DEFAULT, [ZERODHA])[1])).toBe('Zerodha — CDSL 12088700 / 11223344');
  });

  it('falls back to the identifiers alone', () => {
    expect(dematLabel(dematAccountsFor(DEFAULT, [])[0])).toBe('NSDL 12345678 / 87654321');
  });

  it('omits the separator for CDSL, which has no DP ID', () => {
    const cdsl = { depository: 'CDSL' as const, dpId: '', clientId: '1208870011223344' };
    expect(dematLabel(dematAccountsFor(cdsl, [])[0])).toBe('CDSL 1208870011223344');
  });
});
