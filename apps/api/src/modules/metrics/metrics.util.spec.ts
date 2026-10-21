import {
  TRACKED_PATHS, normalisePath, normaliseSymbol, isBot,
  istHourStart, istDateKey, visitorKey,
} from './metrics.util';

describe('normalisePath', () => {
  it('accepts the two pages the operator asked for', () => {
    expect(normalisePath('/subscription')).toBe('/subscription');
    expect(normalisePath('/subscription/v2')).toBe('/subscription/v2');
  });

  it('folds the shapes the static export actually serves', () => {
    // IIS serves `/subscription/` and the single-issue page carries ?symbol=.
    // These are one page and must not become two rows.
    expect(normalisePath('/subscription/')).toBe('/subscription');
    expect(normalisePath('/subscription/v2/')).toBe('/subscription/v2');
    expect(normalisePath('/subscription/v2/?symbol=JPL')).toBe('/subscription/v2');
    expect(normalisePath('/SUBSCRIPTION')).toBe('/subscription');
    expect(normalisePath('  /subscription  ')).toBe('/subscription');
  });

  it('IS A WHITELIST — the endpoint is public and unauthenticated', () => {
    // Anything else would let a stranger write unbounded distinct rows.
    for (const p of ['/', '/ipos/jpl', '/admin', '../etc/passwd', 'subscription',
                     '/subscription/v3', '/subscriptions', '', null, undefined, 42, {}]) {
      expect(normalisePath(p as any)).toBeNull();
    }
  });

  it('every tracked path normalises to itself', () => {
    for (const p of TRACKED_PATHS) expect(normalisePath(p)).toBe(p);
  });
});

describe('normaliseSymbol', () => {
  it('keeps a real symbol', () => {
    expect(normaliseSymbol('JPL')).toBe('JPL');
    expect(normaliseSymbol('jpl')).toBe('JPL');
    expect(normaliseSymbol(' HDFIRE ')).toBe('HDFIRE');
  });

  it('RETURNS EMPTY STRING, NEVER NULL', () => {
    // Postgres treats NULLs as distinct in a unique index, so a nullable
    // column here would make every beacon insert a new row instead of
    // incrementing one.
    expect(normaliseSymbol(null)).toBe('');
    expect(normaliseSymbol(undefined)).toBe('');
    expect(normaliseSymbol('')).toBe('');
    expect(normaliseSymbol('!!!')).toBe('');
  });

  it('strips anything that is not an exchange symbol, and caps the length', () => {
    expect(normaliseSymbol('JPL<script>')).toBe('JPLSCRIPT');
    expect(normaliseSymbol('A'.repeat(200))).toHaveLength(20);
  });
});

describe('isBot', () => {
  it('flags the crawlers the IIS log actually shows', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Mozilla/5.0 ... HeadlessChrome/120',
    ]) expect(isBot(ua)).toBe(true);
  });

  it('A MISSING USER AGENT IS A SCRIPT, not a reader', () => {
    expect(isBot('')).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot('   ')).toBe(true);
  });

  it('leaves real browsers alone', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    ]) expect(isBot(ua)).toBe(false);
  });
});

describe('IST bucketing', () => {
  it('puts a view in its IST hour, not its UTC one', () => {
    // 18:45 UTC is 00:15 IST the NEXT day — the bucket must be 00:00 IST,
    // which is 18:30 UTC. Getting this wrong files a late-evening visit
    // under the wrong date, which is the whole point of bucketing in IST.
    const h = istHourStart(new Date('2026-10-21T18:45:00Z'));
    expect(h.toISOString()).toBe('2026-10-21T18:30:00.000Z');
    expect(istDateKey(new Date('2026-10-21T18:45:00Z'))).toBe('2026-10-22');
  });

  it('a mid-afternoon IST view buckets to that hour', () => {
    // 09:12 UTC = 14:42 IST -> the 14:00 IST hour = 08:30 UTC.
    expect(istHourStart(new Date('2026-10-21T09:12:34Z')).toISOString())
      .toBe('2026-10-21T08:30:00.000Z');
  });

  it('is stable across a whole hour and moves exactly once', () => {
    const a = istHourStart(new Date('2026-10-21T08:30:00Z'));
    const b = istHourStart(new Date('2026-10-21T09:29:59Z'));
    const c = istHourStart(new Date('2026-10-21T09:30:00Z'));
    expect(a.getTime()).toBe(b.getTime());
    expect(c.getTime() - a.getTime()).toBe(3_600_000);
  });

  it('the IST date rolls at 18:30 UTC, not at midnight UTC', () => {
    expect(istDateKey(new Date('2026-10-21T18:29:59Z'))).toBe('2026-10-21');
    expect(istDateKey(new Date('2026-10-21T18:30:00Z'))).toBe('2026-10-22');
  });
});

describe('visitorKey', () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0';

  it('is stable for the same person on the same day', () => {
    expect(visitorKey('salt-a', '1.2.3.4', UA)).toBe(visitorKey('salt-a', '1.2.3.4', UA));
  });

  it('separates two people', () => {
    expect(visitorKey('salt-a', '1.2.3.4', UA)).not.toBe(visitorKey('salt-a', '1.2.3.5', UA));
    expect(visitorKey('salt-a', '1.2.3.4', UA)).not.toBe(visitorKey('salt-a', '1.2.3.4', UA + ' Edg/131'));
  });

  it('CANNOT BE FOLLOWED ACROSS DAYS, which is the point of rotating the salt', () => {
    expect(visitorKey('salt-a', '1.2.3.4', UA)).not.toBe(visitorKey('salt-b', '1.2.3.4', UA));
  });

  it('stores no IP and no user agent — only a digest', () => {
    const k = visitorKey('salt-a', '203.0.113.9', UA);
    expect(k).toHaveLength(32);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain('203');
    expect(k).not.toContain('Chrome');
  });

  it('handles a missing IP or UA rather than throwing', () => {
    expect(visitorKey('salt-a', null, undefined)).toMatch(/^[0-9a-f]{32}$/);
  });
});
