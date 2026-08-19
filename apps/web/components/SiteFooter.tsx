import { WhatsAppFooterLink } from '@/components/WhatsAppCta';

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: '#fff', letterSpacing: '-0.02em' }}>
            Investo<span style={{ color: 'var(--gold)' }}>yard</span>
          </div>
          <p style={{ marginTop: 12, maxWidth: 260, fontSize: 14, lineHeight: 1.6 }}>
            Investing in IPOs, has never been this easy. Track and apply to every Mainboard &amp; SME IPO in India.
          </p>
          <div style={{ marginTop: 16, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>
            Rails: NSE e-IPO · BSE iBBS
          </div>
        </div>

        <div>
          <h4>IPOs</h4>
          <a href="/">Open now</a>
          <a href="/">Upcoming</a>
          <a href="/">Recently listed</a>
          <a href="/portfolio">My portfolio</a>
        </div>

        <div>
          <h4>Account</h4>
          <a href="/login">Sign in</a>
          <a href="/account">Profiles &amp; family</a>
          <a href="/portfolio">Applications</a>
        </div>

        <div>
          <h4>Company</h4>
          <a href="#">About</a>
          <a href="#">Help &amp; FAQ</a>
          <a href="#">Contact</a>
          <WhatsAppFooterLink />
          <a href="/admin">Admin panel</a>
        </div>

        <div className="legal">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
            <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>SEBI SCORES (complaints)</a>
            <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>ODR Portal</a>
            <a href="#" style={{ display: 'inline-block' }}>Investor Charter</a>
            <a href="https://www.sebi.gov.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>SEBI</a>
          </div>
          <p>
            Investoyard is an IPO information and application platform. We distribute and inform — we do
            not provide investment advice or buy/sell recommendations. Every application uses the
            applicant&apos;s own PAN, demat and bank/UPI. Grey-market premium (GMP) is unofficial,
            unregulated and not investment advice. Investments in securities are subject to market risks;
            read all offer documents carefully before investing.
          </p>
          <p style={{ marginTop: 10 }}>© 2026 Investoyard. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
