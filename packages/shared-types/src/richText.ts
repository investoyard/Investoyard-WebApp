/**
 * Clean operator-entered rich HTML before it is injected into a page.
 *
 * MOVED HERE FROM apps/web/lib SO IT COULD BE TESTED. It is rendered with
 * `dangerouslySetInnerHTML` on PUBLIC pages — including, since phase 2, a
 * partner's Terms, Privacy and Disclaimer — which makes it a security boundary,
 * and `apps/web` has no test runner at all. Same reasoning that moved
 * `offeredFromIpo`, `parseAnchorRows` and `offerTotals` out of the files that
 * hid them: a function nothing can reach is a function nobody writes a test for.
 *
 * Inline styles are FILTERED, not stripped wholesale: the declarations the admin
 * editor itself produces (color, highlight background, text-align, font-size)
 * are kept; everything else — font-family, widths, margins, the junk that rides
 * along with pasted content — is dropped, so pasted content can never override
 * the site's design. Event handlers, legacy `<font>` markup and pasted column
 * sizing go too.
 */

const KEEP_STYLE = /^(color|background-color|text-align|font-size)\s*:/i;

function filterStyle(css: string): string {
  return css
    .split(';')
    .map((d) => d.trim())
    .filter((d) => KEEP_STYLE.test(d))
    .join('; ');
}

export function cleanRich(html?: string | null): string {
  if (!html) return '';
  return String(html)
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')      // event handlers
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_, css) => {
      const kept = filterStyle(css);
      return kept ? ` style="${kept}"` : '';
    })
    .replace(/\sstyle\s*=\s*'([^']*)'/gi, (_, css) => {
      const kept = filterStyle(css);
      return kept ? ` style="${kept}"` : '';
    })
    .replace(/\s(width|height|bgcolor|color|face|size|align)\s*=\s*"[^"]*"/gi, '') // legacy attrs
    .replace(/<\/?font[^>]*>/gi, '')                 // <font> tags
    .replace(/<colgroup[\s\S]*?<\/colgroup>/gi, '')  // pasted column sizing
    .replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, ''); // unwrap pasted hyperlinks (keep the text)
}

/* ────────────────────────────────────────────────────────────────────────
   The link-preserving mode
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Safe hrefs.
 *
 * AN ALLOW-LIST, NEVER A `javascript:` DENY-LIST. A deny-list loses to
 * `JaVaScRiPt:`, a leading space, an embedded tab or newline, `data:`,
 * `vbscript:` and the protocol-relative `//evil.test`. Anything that is not
 * plainly one of these four shapes has its link unwrapped, exactly as the strip
 * mode does — the text survives, the link does not.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))[^\s"'<>]*$/i;

/**
 * `&` is legitimate in a query string, but an ESCAPED QUOTE in a destination is
 * not: no real URL needs one, and refusing them removes a whole class of "could
 * this break out of the attribute" reasoning rather than answering it.
 */
const HREF_ENTITY = /&(quot|apos|#)/i;

const hrefOf = (tag: string): string => {
  const m = /\shref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
  return (m?.[2] ?? m?.[3] ?? '').trim();
};

/** Sentinels. NUL cannot appear in operator-entered HTML, and anything that
 *  looks like one in the input is stripped before the stash runs. */
const OPEN = '\u0000A';
const CLOSE = '\u0000/A\u0000';

/**
 * The same cleaning, but KEEPING hyperlinks.
 *
 * WHY A MODE RATHER THAN A SECOND FUNCTION: `cleanRich` strips `<a>` because
 * its callers render pasted merchant-banker prose, where a stray link is junk
 * riding along. A partner's Terms, Privacy and Disclaimer are the opposite
 * case — our own legal pages link to SEBI SCORES and the ODR portal, and
 * silently deleting a partner's link to their own grievance portal would be the
 * worse fault. One implementation, one option, so the two cannot drift.
 *
 * Anchors are STASHED, the ordinary clean runs over everything else, then they
 * are restored — so this mode can never fall behind the filtering the strip
 * mode does.
 *
 * A DROPPED OPENING TAG MUST DROP ITS CLOSING TAG, which the first version got
 * wrong: unwrapping `<a href="javascript:…">x</a>` left a bare `</a>` in the
 * output. That is why this keeps a stack and is not two independent `replace`
 * calls over opens and closes.
 *
 * `rel="noopener noreferrer"` is FORCED and never read from the source — a
 * `target="_blank"` without it hands the opened page a handle on ours through
 * `window.opener`. `target` is set only for off-site destinations.
 */
export function cleanRichKeepLinks(html?: string | null): string {
  if (!html) return '';

  /* A sentinel arriving in the INPUT must not be able to forge a link. */
  const src = String(html).replace(/\u0000/g, '');

  const opens: string[] = [];
  const stack: boolean[] = [];
  const stashed = src.replace(/<a\b[^>]*>|<\/a\s*>/gi, (tag) => {
    if (tag[1] === '/') {
      /* An unmatched </a> closes nothing and is dropped with it. */
      return stack.pop() ? CLOSE : '';
    }
    const href = hrefOf(tag);
    const ok = SAFE_HREF.test(href) && !HREF_ENTITY.test(href);
    stack.push(ok);
    if (!ok) return '';
    const offsite = /^https?:/i.test(href);
    opens.push(
      `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer"`
      + (offsite ? ' target="_blank"' : '')
      + '>',
    );
    return `${OPEN}${opens.length - 1}\u0000`;
  });

  return cleanRich(stashed)
    .replace(/\u0000A(\d+)\u0000/g, (_m, i) => opens[Number(i)] ?? '')
    .split(CLOSE).join('</a>');
}
