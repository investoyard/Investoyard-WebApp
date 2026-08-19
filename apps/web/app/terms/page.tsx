export const metadata = {
  title: 'Terms & Conditions | Investoyard',
  description: 'The terms governing your use of Investoyard — the IPO information and application platform by Safal Capital Services Pvt. Ltd.',
};

/** Draft — the operator's existing terms page holds placeholder text, so these
 *  are written fresh for review by the operator and counsel before go-live. */
export default function TermsPage() {
  return (
    <div className="trust-page">
      <h1>Terms &amp; Conditions</h1>
      <div className="prose">
        <p>
          These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of the Investoyard website and mobile application
          (together, the &quot;Platform&quot;), operated by <b>Safal Capital Services Private Limited</b> (&quot;we&quot;, &quot;us&quot;).
          By registering on or using the Platform you accept these Terms and our Privacy Policy.
        </p>

        <h2>1. What the Platform is</h2>
        <p>
          Investoyard is an <b>IPO information and application-facilitation platform</b>. It aggregates public-issue
          information (dates, price bands, subscription, listing data and unofficial grey-market indications) and
          facilitates IPO applications through established market infrastructure — UPI-mandate (ASBA) applications
          routed over merchant-banker rails to the stock exchanges, and prefilled bank ASBA forms. We are a
          distributor of public issues; we are <b>not</b> a stockbroker, investment adviser, research analyst or
          portfolio manager.
        </p>

        <h2>2. No investment advice</h2>
        <p>
          Nothing on the Platform is investment advice or a recommendation to subscribe to, buy or sell any security.
          Data — including grey-market premium — is provided for information only. Investment in securities is subject
          to market risk; take decisions independently or with a SEBI-registered adviser.
        </p>

        <h2>3. Eligibility &amp; your account</h2>
        <ul>
          <li>You must be 18 or older, resident in India, and hold a valid PAN, demat account and bank account.</li>
          <li>Information you provide must be accurate, current and your own; keep your login and OTPs confidential.</li>
          <li>We may suspend or terminate accounts used unlawfully or in breach of these Terms.</li>
        </ul>

        <h2>4. Applications &amp; the self-PAN rule</h2>
        <ul>
          <li>Every IPO application — including for family members — must use <b>that applicant&apos;s own PAN, demat account and bank/UPI</b>. Third-party payments are not permitted under SEBI&apos;s framework.</li>
          <li>Funds are blocked in the applicant&apos;s own account under ASBA and are debited only on allotment; blocks release automatically if shares are not allotted.</li>
          <li>Application windows, allotment, refunds and listing are controlled by the issuer, registrar and exchanges — not by us. Cut-off times on the Platform may be earlier than exchange deadlines.</li>
          <li>You are responsible for the accuracy of every application you submit or print, including bid quantities and amounts.</li>
        </ul>

        <h2>5. Data on the Platform</h2>
        <p>
          Issue data is compiled from exchanges, registrars, issuer documents and other public sources on a best-effort
          basis and can be delayed, incomplete or wrong. Grey-market premium is unofficial, unregulated market chatter.
          Verify critical facts against the issuer&apos;s offer documents before acting.
        </p>

        <h2>6. Charges</h2>
        <p>
          Platform features are currently offered free of charge. We may introduce or change charges prospectively with
          notice on the Platform.
        </p>

        <h2>7. Intellectual property</h2>
        <p>
          The Platform, its design, software and content (excluding issuer documents and exchange data) are our
          property or licensed to us. You may not copy, scrape, resell or create derivative works from the Platform
          without written permission.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we are not liable for indirect or consequential losses, market
          losses, non-allotment, delays or failures caused by exchanges, banks, UPI systems, registrars, network
          outages or events beyond our reasonable control. Our aggregate liability for any claim is limited to the
          charges (if any) you paid us for the service concerned.
        </p>

        <h2>9. Governing law &amp; disputes</h2>
        <p>
          These Terms are governed by the laws of India. Courts at the registered office of Safal Capital Services
          Private Limited shall have exclusive jurisdiction, subject to any mandatory investor-protection forums.
          Market complaints may also be raised on <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a> or
          the <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">ODR portal</a>.
        </p>

        <h2>10. Changes to these Terms</h2>
        <p>
          We may amend these Terms from time to time; the current version is always available on this page and
          continued use after changes constitutes acceptance.
        </p>
      </div>
    </div>
  );
}
