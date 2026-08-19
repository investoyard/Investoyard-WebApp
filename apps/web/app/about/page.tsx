export const metadata = {
  title: 'About Us | Investoyard',
  description: 'Investoyard — India’s IPO companion by Safal Capital Services Pvt. Ltd. Track every Mainboard & SME IPO and apply for yourself and your family, the easy way.',
};

/** Draft copy — operator will refine. Structure and claims kept factual. */
export default function AboutPage() {
  return (
    <div className="trust-page">
      <h1>About Investoyard</h1>
      <p className="lead-p">Investing in IPOs, has never been this easy.</p>

      <div className="prose">
        <p>
          <b>Investoyard</b> is India&apos;s IPO companion — one calm, data-clear place to track every Mainboard and
          SME public issue and to apply for yourself and your family. It is built and operated by
          <b> Safal Capital Services Private Limited</b>.
        </p>

        <h2>What we do</h2>
        <ul>
          <li><b>Track everything:</b> dates, price bands, lot sizes, live category-wise subscription, grey-market premium and listing performance for every issue — updated through the day.</li>
          <li><b>Apply the right way:</b> UPI-mandate (ASBA) applications routed over merchant-banker rails to NSE e-IPO and BSE iBBS. Funds are blocked in your own bank account, never debited before allotment.</li>
          <li><b>The whole family, compliantly:</b> apply for family members in one flow — each with their own PAN, demat and UPI, exactly as SEBI&apos;s post-2022 rules require.</li>
          <li><b>Bank-ready forms:</b> prefilled ASBA application forms for those who prefer applying at a branch — generated in seconds.</li>
          <li><b>Allotment to listing:</b> follow your applications from bid to allotment, refund and listing in one portfolio.</li>
        </ul>

        <h2>How we work</h2>
        <p>
          We distribute and inform — we do not advise. Investoyard carries no buy/sell recommendations and no ratings.
          Market data such as the grey-market premium is shown for information only and is always marked as unofficial.
          Every investment decision is yours.
        </p>
        <p>
          Your data is collected just-in-time — financial details are asked for only when you actually apply — with
          explicit, itemized consent, and personally identifiable information is stored encrypted.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or feedback? Reach us via the Help &amp; FAQ page, or raise a market complaint with
          {' '}<a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a>.
        </p>
      </div>
    </div>
  );
}
