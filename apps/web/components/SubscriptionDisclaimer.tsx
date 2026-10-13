/**
 * SubscriptionDisclaimer — legal boilerplate rendered at the bottom of
 * /subscription and /subscription/v2. Same text on both pages so we render
 * it from one place; a copy edit lands on both surfaces at once.
 *
 * Wording locked by the operator on 2026-09-18. Do not change without
 * an explicit re-sign-off — this is the disclaimer users read before
 * acting on live figures.
 */
export function SubscriptionDisclaimer() {
  return (
    <section className="sub-disclaimer" aria-labelledby="sub-disclaimer-h">
      <h4 id="sub-disclaimer-h">Disclaimer</h4>
      <p>
        The above-mentioned information / data are sourced from the websites of
        National Stock Exchange (NSE) and Bombay Stock Exchange (BSE) and are subject
        to change on real time basis. For updated information / data you can visit
        their respective website. The information / data provided herein above are
        for information purpose only and provided &ldquo;AS IS&rdquo; and &ldquo;AS
        AVAILABLE&rdquo; basis and without warranty, express or implied. We do not
        guarantee or warrant the accuracy, adequacy or completeness of the
        information received through the said websites. &ldquo;We&rdquo; hold not
        responsibility of any kind as regard to any discrepancies, errors,
        omissions, losses or damages. &ldquo;We&rdquo; including its affiliates and
        any of its officers, directors, personnel and employees, shall not liable
        for any loss, damage of any nature, including but not limited to direct,
        indirect, punitive, special, exemplary, consequential, as also any loss of
        profit in any way arising from the use of information / data received
        through the said websites. The recipient alone shall be fully responsible /
        are liable for any decision taken on the basis of such information / data.
        All recipients should before acting upon the said information make their own
        investigation, seek appropriate professional advice.
      </p>
    </section>
  );
}
