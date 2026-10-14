import { cleanRich, cleanRichKeepLinks } from './richText';

/**
 * This module is rendered with `dangerouslySetInnerHTML` on public pages, so
 * these are not style tests — the link cases below are the security boundary.
 */

describe('cleanRich — the existing behaviour, pinned before anything moved', () => {
  it('strips event handlers in either quote style', () => {
    expect(cleanRich('<p onclick="steal()">hi</p>')).toBe('<p>hi</p>');
    expect(cleanRich("<p onmouseover='steal()'>hi</p>")).toBe('<p>hi</p>');
  });

  it('keeps the four declarations the editor itself produces', () => {
    expect(cleanRich('<p style="color: #f00; text-align: center">x</p>'))
      .toBe('<p style="color: #f00; text-align: center">x</p>');
  });

  it('drops the junk that rides along with pasted content', () => {
    expect(cleanRich('<p style="font-family: Calibri; margin: 0; color: red">x</p>'))
      .toBe('<p style="color: red">x</p>');
  });

  it('removes the style attribute entirely when nothing survives', () => {
    expect(cleanRich('<p style="font-family: Calibri">x</p>')).toBe('<p>x</p>');
  });

  it('removes legacy font markup and pasted column sizing', () => {
    expect(cleanRich('<font face="Arial">x</font>')).toBe('x');
    expect(cleanRich('<table><colgroup><col width="90"></colgroup><tr></tr></table>'))
      .toBe('<table><tr></tr></table>');
  });

  it('UNWRAPS hyperlinks, keeping the text — the behaviour its callers want', () => {
    expect(cleanRich('see <a href="https://x.test">SEBI</a> now')).toBe('see SEBI now');
  });

  it('handles null, undefined and empty', () => {
    expect(cleanRich(null)).toBe('');
    expect(cleanRich(undefined)).toBe('');
    expect(cleanRich('')).toBe('');
  });
});

describe('cleanRichKeepLinks — a partner legal page keeps its links', () => {
  /* Our own Terms and Disclaimer link to SEBI SCORES and the ODR portal.
     Silently deleting a partner's link to their own grievance portal would be
     a worse fault than keeping it, which is why this mode exists. */
  it('keeps an https link and hardens it', () => {
    expect(cleanRichKeepLinks('<a href="https://scores.sebi.gov.in">SCORES</a>'))
      .toBe('<a href="https://scores.sebi.gov.in" rel="noopener noreferrer" target="_blank">SCORES</a>');
  });

  it('keeps mailto and tel without forcing a new tab', () => {
    expect(cleanRichKeepLinks('<a href="mailto:grievance@partner.com">write</a>'))
      .toBe('<a href="mailto:grievance@partner.com" rel="noopener noreferrer">write</a>');
    expect(cleanRichKeepLinks('<a href="tel:+912212345678">call</a>'))
      .toBe('<a href="tel:+912212345678" rel="noopener noreferrer">call</a>');
  });

  it('keeps a site-relative link and does not open it in a new tab', () => {
    expect(cleanRichKeepLinks('<a href="/contact">contact us</a>'))
      .toBe('<a href="/contact" rel="noopener noreferrer">contact us</a>');
  });

  /* ── the security boundary ─────────────────────────────────────────────
     An ALLOW-LIST, never a `javascript:` deny-list: a deny-list loses to
     every spelling below and several more. Each of these must UNWRAP. */
  it.each([
    ['plain javascript:', '<a href="javascript:alert(1)">x</a>'],
    ['mixed case', '<a href="JaVaScRiPt:alert(1)">x</a>'],
    ['leading whitespace', '<a href="  javascript:alert(1)">x</a>'],
    ['embedded tab', '<a href="java\tscript:alert(1)">x</a>'],
    ['embedded newline', '<a href="java\nscript:alert(1)">x</a>'],
    /* A realistic data url: one carrying a raw `<` could never survive HTML
       parsing in the first place, so a fixture with one tests nothing. */
    ['data url', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
    ['protocol-relative', '<a href="//evil.test">x</a>'],
    ['no href at all', '<a>x</a>'],
    ['empty href', '<a href="">x</a>'],
  ])('unwraps a %s link rather than rendering it', (_label, html) => {
    const out = cleanRichKeepLinks(html);
    expect(out).toBe('x');
    expect(out).not.toMatch(/<a/i);
  });

  it('strips an event handler from a link it otherwise keeps', () => {
    const out = cleanRichKeepLinks('<a href="https://x.test" onclick="steal()">x</a>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toMatch(/href="https:\/\/x\.test"/);
  });

  /* A `target="_blank"` without `rel=noopener` hands the opened page a handle
     on ours via window.opener. It is forced, never taken from the input. */
  it('forces its own rel and ignores one supplied in the source', () => {
    const out = cleanRichKeepLinks('<a href="https://x.test" rel="opener" target="_self">x</a>');
    expect(out).toBe('<a href="https://x.test" rel="noopener noreferrer" target="_blank">x</a>');
  });

  it('escapes a quote in the href so it cannot break out of the attribute', () => {
    const out = cleanRichKeepLinks('<a href="https://x.test/&quot;onmouseover=alert(1)">x</a>');
    expect(out).not.toMatch(/onmouseover=/);
  });

  it('still applies every cleanRich rule around the links', () => {
    const out = cleanRichKeepLinks(
      '<p style="font-family: Calibri; color: red" onclick="x()">a <a href="https://x.test">b</a></p>',
    );
    expect(out).toBe('<p style="color: red">a <a href="https://x.test" rel="noopener noreferrer" target="_blank">b</a></p>');
  });

  it('handles several links, keeping the safe ones only', () => {
    const out = cleanRichKeepLinks(
      '<a href="https://a.test">A</a> <a href="javascript:x">B</a> <a href="/c">C</a>',
    );
    expect(out).toMatch(/href="https:\/\/a\.test"/);
    expect(out).toMatch(/href="\/c"/);
    expect(out).not.toMatch(/javascript/i);
    expect((out.match(/<a /g) ?? []).length).toBe(2);
  });

  it('handles null, undefined and empty', () => {
    expect(cleanRichKeepLinks(null)).toBe('');
    expect(cleanRichKeepLinks(undefined)).toBe('');
    expect(cleanRichKeepLinks('')).toBe('');
  });

  /* The sentinel it uses internally must not be smuggled in from the input. */
  it('does not let a stray sentinel in the source forge a link', () => {
    const out = cleanRichKeepLinks('plain \u0000A0\u0000 text \u0000/A\u0000');
    expect(out).not.toMatch(/<a/i);
  });
});

describe('cleanRichKeepLinks — inputs that cannot parse as HTML anyway', () => {
  /* An href containing a raw `<` truncates the tag at the browser's parser as
     well as at ours. The residue is TEXT, which is harmless — what matters is
     that no anchor and no executable markup survives. */
  it('produces no anchor from an href carrying a raw angle bracket', () => {
    const out = cleanRichKeepLinks('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toMatch(/<a/i);
    expect(out).not.toMatch(/<script/i);
  });

  it('drops an unmatched closing tag rather than emitting a bare </a>', () => {
    expect(cleanRichKeepLinks('plain text</a>')).toBe('plain text');
  });
});
