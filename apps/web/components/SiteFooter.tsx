'use client';
import { WhatsAppFooterLink } from '@/components/WhatsAppCta';
import { useTenant, useTenantResolved } from '@/components/TenantProvider';
import { tenantDisplayName, tenantLegalEntity, tenantIdentity, tenantContact } from '@/lib/tenants';

/**
 * The site footer — and the first place a white-label stopped being ours.
 *
 * WHAT IT USED TO DO. Every line was hard-coded: the Investoyard wordmark, our
 * tagline, a link to OUR partner funnel, a link to OUR admin console, and a
 * copyright naming us — all served verbatim on a partner's own domain to their
 * own clients. It is now rendered from the tenant the domain resolves to.
 *
 * TWO THINGS IT WILL NOT DO, both deliberate:
 *
 *  - It never substitutes our legal entity for a partner's. `tenantLegalEntity`
 *    returns undefined until the partner supplies one, and the "Operated by"
 *    line is then simply absent. A page that says nothing about who runs it is
 *    an obvious gap someone fixes; one that names the wrong company is a
 *    misstatement nobody notices. The admin Content panel reports it as
 *    blocking.
 *  - It never presents a TRADE name as the operator. The copyright line may use
 *    the brand (it is a claim over the content), the "Operated by" line may not.
 */
export function SiteFooter() {
  const tenant = useTenant();
  /* The first render is always the default tenant — see ResolvedContext. The
     lines that NAME AN ENTITY wait for the host to resolve rather than painting
     ours and correcting a tick later. The nav copy above does not: a brand
     flashing is cosmetic, a legal operator flashing is a misstatement. */
  const resolved = useTenantResolved();
  const own = !!tenant.isDefault;
  const name = tenantDisplayName(tenant);
  const entity = tenantLegalEntity(tenant);
  const id = tenantIdentity(tenant);
  const contact = tenantContact(tenant);

  /* The split-colour wordmark is OUR mark and only reads as one on our name.
     A partner gets their logo if they have uploaded one, else plain text. */
  const wordmark = own ? (
    <>Investo<span style={{ color: 'var(--gold)' }}>yard</span></>
  ) : (
    name
  );

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          {/* A FOOTER MARK THE PARTNER SUPPLIED WINS, AND IS RENDERED UNTOUCHED.
              Falling back to `.footer-logo` forces their ordinary logo white,
              which always reads on the indigo gradient but flattens the brand
              colour — fine as a default nobody has to think about, wrong to
              impose on a partner who has gone and made a reversed version.
              So the filter is the FALLBACK and the upload is the override,
              never the other way round. */}
          {(tenant.footerLogo || tenant.logo) && !own ? (
            <img
              className={tenant.footerLogo ? undefined : 'footer-logo'}
              src={tenant.footerLogo || tenant.logo}
              alt={name}
              style={tenant.footerLogo ? { height: 30, maxWidth: 170, objectFit: 'contain' } : undefined}
            />
          ) : (
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: '#fff', letterSpacing: '-0.02em' }}>
              {wordmark}
            </div>
          )}
          <p style={{ marginTop: 12, maxWidth: 260, fontSize: 14, lineHeight: 1.6 }}>
            {own ? 'Investing in IPOs, has never been this easy. ' : null}
            Track and apply to every Mainboard &amp; SME IPO in India.
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
          <a href="/about">About</a>
          <a href="/contact">Contact us</a>
          <a href="/faqs">Help &amp; FAQ</a>
          <a href="/glossary">IPO Glossary</a>
          <a href="/performance">IPO Performance</a>
          {/* Our partner funnel and our operator console are OURS. On a
              partner's domain the first advertises our programme to their
              clients, and the second puts a link to the Investoyard admin
              login on their brand. */}
          {own ? <a href="/partner">Become a Partner</a> : null}
          <WhatsAppFooterLink />
          {own ? <a href="/admin">Admin panel</a> : null}
        </div>

        <div className="legal">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
            <a href="/privacy-policy" style={{ display: 'inline-block' }}>Privacy Policy</a>
            <a href="/terms" style={{ display: 'inline-block' }}>Terms &amp; Conditions</a>
            <a href="/disclaimer" style={{ display: 'inline-block' }}>Disclaimer</a>
            <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>SEBI SCORES (complaints)</a>
            <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>ODR Portal</a>
            <a href="https://www.sebi.gov.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>SEBI</a>
          </div>
          <p>
            {name} is an IPO information and application platform. We distribute and inform — we do
            not provide investment advice or buy/sell recommendations. Every application uses the
            applicant&apos;s own PAN, demat and bank/UPI. Grey-market premium (GMP) is unofficial,
            unregulated and not investment advice. Investments in securities are subject to market risks;
            read all offer documents carefully before investing.
          </p>

          {/* The operating entity and the grievance officer are what a visitor
              needs to know who is accountable — and what a SEBI-registered
              intermediary must display. Each line appears only once the value
              behind it exists. */}
          {resolved && (entity || id.sebiRegistration || contact.grievanceName) ? (
            <p style={{ marginTop: 10 }}>
              {entity ? <>Operated by <b style={{ fontWeight: 600 }}>{entity}</b>. </> : null}
              {id.sebiRegistration ? <>SEBI registration {id.sebiRegistration}. </> : null}
              {contact.grievanceName ? (
                <>
                  Grievance officer: {contact.grievanceName}
                  {contact.grievanceEmail ? (
                    <> · <a href={`mailto:${contact.grievanceEmail}`} style={{ display: 'inline' }}>{contact.grievanceEmail}</a></>
                  ) : null}
                  {contact.grievancePhone ? <> · {contact.grievancePhone}</> : null}
                  .
                </>
              ) : null}
            </p>
          ) : null}

          <p style={{ marginTop: 10 }}>© {new Date().getFullYear()} {name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
