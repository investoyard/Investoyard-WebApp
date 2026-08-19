export const metadata = {
  title: 'Disclaimer | Investoyard',
  description: 'Important disclaimers about the information published on Investoyard — including grey-market premium data.',
};

/** Draft — written fresh (the operator's existing disclaimer page holds
 *  placeholder text); for operator/counsel review before go-live. */
export default function DisclaimerPage() {
  return (
    <div className="trust-page">
      <h1>Disclaimer</h1>
      <div className="prose">
        <h2>No investment advice</h2>
        <p>
          Investoyard (operated by Safal Capital Services Private Limited) publishes information about public issues to
          help investors stay informed. Nothing on this platform — pages, notifications, messages or documents — is
          investment advice, research, or a recommendation to subscribe to, buy or sell any security. We are not a
          SEBI-registered investment adviser or research analyst. Please make investment decisions independently or
          with a registered adviser.
        </p>

        <h2>Grey-market premium (GMP)</h2>
        <p>
          GMP, kostak and similar figures describe <b>unofficial, unregulated</b> grey-market activity. They are not
          published by any exchange or regulator, cannot be verified, can change sharply without notice, and often
          differ materially from actual listing prices. We display GMP purely as information; trading in the grey
          market is not endorsed, facilitated or encouraged by us. Any &quot;estimated listing price&quot; derived from GMP is
          arithmetic, not a prediction.
        </p>

        <h2>Data accuracy</h2>
        <p>
          Issue details, subscription figures, allotment and listing data are compiled from stock exchanges,
          registrars, issuer offer documents and other public sources on a best-effort basis. Figures may be delayed,
          revised or erroneous. The issuer&apos;s offer documents (DRHP/RHP) and exchange notices are the only
          authoritative sources — always verify before acting.
        </p>

        <h2>Market risk</h2>
        <p>
          Investments in securities markets are subject to market risks. Past listing performance and oversubscription
          are not indicators of future results. Applying in an IPO can result in non-allotment, and listed shares can
          trade below the issue price.
        </p>

        <h2>Third-party links &amp; services</h2>
        <p>
          The platform may link to exchanges, registrars, banks, and other third parties. We do not control and are
          not responsible for their content, availability or policies.
        </p>

        <h2>Complaints</h2>
        <p>
          For market-related grievances you may use <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a> or
          the <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">Online Dispute Resolution portal</a>.
        </p>
      </div>
    </div>
  );
}
