/**
 * THE SUBSCRIPTION DISCLAIMER — wording LOCKED BY THE OPERATOR on 2026-09-18.
 * Do not change it without an explicit re-sign-off: this is the text a reader
 * sees before acting on live figures.
 *
 * It lives here rather than in `apps/web/components/SubscriptionDisclaimer.tsx`
 * because MOBILE renders the same pages and had no disclaimer at all. The web
 * component's own docblock already gave the reason — "same text on both pages
 * so we render it from one place; a copy edit lands on both surfaces at once" —
 * and that reason applies across surfaces exactly as it applies across routes.
 *
 * A legal notice is the LAST thing that should exist in two copies: one edited
 * and one not is worse than one that is merely out of date, because nothing on
 * either screen says which is which.
 *
 * Plain text, not markup, so each surface renders it in its own idiom — a
 * `<p>` on web, a `<Text>` on mobile. The curly quotes are the characters
 * themselves; web previously spelled them as HTML entities, which render
 * identically.
 */
export const SUBSCRIPTION_DISCLAIMER_HEADING = 'Disclaimer';

export const SUBSCRIPTION_DISCLAIMER_VERSION = 'sub-disclaimer-2026-09-18';

export const SUBSCRIPTION_DISCLAIMER =
  'The above-mentioned information / data are sourced from the websites of '
  + 'National Stock Exchange (NSE) and Bombay Stock Exchange (BSE) and are subject '
  + 'to change on real time basis. For updated information / data you can visit '
  + 'their respective website. The information / data provided herein above are '
  + 'for information purpose only and provided “AS IS” and “AS '
  + 'AVAILABLE” basis and without warranty, express or implied. We do not '
  + 'guarantee or warrant the accuracy, adequacy or completeness of the '
  + 'information received through the said websites. “We” hold not '
  + 'responsibility of any kind as regard to any discrepancies, errors, '
  + 'omissions, losses or damages. “We” including its affiliates and '
  + 'any of its officers, directors, personnel and employees, shall not liable '
  + 'for any loss, damage of any nature, including but not limited to direct, '
  + 'indirect, punitive, special, exemplary, consequential, as also any loss of '
  + 'profit in any way arising from the use of information / data received '
  + 'through the said websites. The recipient alone shall be fully responsible / '
  + 'are liable for any decision taken on the basis of such information / data. '
  + 'All recipients should before acting upon the said information make their own '
  + 'investigation, seek appropriate professional advice.';
