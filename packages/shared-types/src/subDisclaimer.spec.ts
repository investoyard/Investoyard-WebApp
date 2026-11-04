import {
  SUBSCRIPTION_DISCLAIMER,
  SUBSCRIPTION_DISCLAIMER_HEADING,
  SUBSCRIPTION_DISCLAIMER_VERSION,
} from './subDisclaimer';

/* JEST, not vitest — this package has no vitest dependency, and a spec that
   imports it passes under `npx vitest` while FAILING `npm run build`. */

/**
 * THESE TESTS GUARD WORDING, NOT BEHAVIOUR, and that is the point: the text is
 * locked by the operator and the only way it should ever change is a
 * deliberate re-sign-off. A test that fails on an accidental copy edit is
 * exactly what a locked notice wants.
 */
describe('SUBSCRIPTION_DISCLAIMER', () => {
  it('names both exchanges it sources from', () => {
    expect(SUBSCRIPTION_DISCLAIMER).toContain('National Stock Exchange (NSE)');
    expect(SUBSCRIPTION_DISCLAIMER).toContain('Bombay Stock Exchange (BSE)');
  });

  it('says the figures change in real time and points at the source', () => {
    expect(SUBSCRIPTION_DISCLAIMER).toContain('subject to change on real time basis');
    expect(SUBSCRIPTION_DISCLAIMER).toContain('you can visit their respective website');
  });

  it('carries the AS IS / AS AVAILABLE limitation', () => {
    expect(SUBSCRIPTION_DISCLAIMER).toContain('“AS IS”');
    expect(SUBSCRIPTION_DISCLAIMER).toContain('“AS AVAILABLE”');
    expect(SUBSCRIPTION_DISCLAIMER).toContain('without warranty, express or implied');
  });

  it('disclaims accuracy, adequacy and completeness', () => {
    expect(SUBSCRIPTION_DISCLAIMER).toContain('accuracy, adequacy or completeness');
  });

  /* The operative sentence: whatever else is trimmed, this is the one a reader
     has to see before acting on a live figure. */
  it('puts the decision on the recipient and tells them to take advice', () => {
    expect(SUBSCRIPTION_DISCLAIMER).toContain('The recipient alone shall be fully responsible');
    expect(SUBSCRIPTION_DISCLAIMER).toContain('seek appropriate professional advice');
  });

  it('uses curly quotes as characters, not HTML entities', () => {
    expect(SUBSCRIPTION_DISCLAIMER).not.toContain('&ldquo;');
    expect(SUBSCRIPTION_DISCLAIMER).not.toContain('&rdquo;');
  });

  it('is one paragraph of plain text, so each surface renders it in its own idiom', () => {
    expect(SUBSCRIPTION_DISCLAIMER).not.toContain('<');
    expect(SUBSCRIPTION_DISCLAIMER).not.toContain('\n');
  });

  /* THE EXACT LENGTH, not a floor. "Locked" should mean any edit fails a test
     and forces the re-sign-off the docblock asks for — a `>` threshold would
     wave through a rewrite of the same size, which is the edit most likely to
     be made by accident. (A floor of 1400 was the first guard here and it was
     a guessed number: the text is 1259.) */
  it('is byte-for-byte the locked length, so ANY edit fails here', () => {
    expect(SUBSCRIPTION_DISCLAIMER.length).toBe(1259);
  });

  it('carries the heading and a dated version, so a stored consent can name it', () => {
    expect(SUBSCRIPTION_DISCLAIMER_HEADING).toBe('Disclaimer');
    expect(SUBSCRIPTION_DISCLAIMER_VERSION).toBe('sub-disclaimer-2026-09-18');
  });
});
