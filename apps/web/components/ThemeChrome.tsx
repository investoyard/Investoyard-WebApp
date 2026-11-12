'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIGN_IN_LABEL } from '@investoyard/shared-types';
import { useSite, useTenant } from '@/components/TenantProvider';
import { tenantDisplayName, tenantIdentity, tenantContact } from '@/lib/tenants';
import { Icon } from '@/components/Icon';

/**
 * A THEME'S OWN HEADER AND FOOTER — the part that makes every one of the 43
 * pages the theme's rather than ours.
 *
 * WHY THESE ARE SEPARATE COMPONENTS AND NOT OUR HEADER WITH A CLASS ON IT. A
 * theme is a complete website design: Meridian's header is a 1240px bar with a
 * square brand mark, 14.5px nav and two actions, over a dark utility strip; our
 * `SiteHeader` is a different object with a different structure, a brand
 * banner, a search field and a live-subscription pill. Branching one component
 * into two designs would leave neither readable, and the next theme would make
 * it three.
 *
 * BOTH ARE IN THE DOM ON EVERY PAGE AND CSS SHOWS ONE. A static export answers
 * every host with one set of HTML, so the choice cannot be made at build time;
 * the pre-paint script sets `data-template` during parse, so the right chrome
 * is painted first rather than swapped after hydration. The cost is our
 * header's markup riding along on a partner's page, which is a few hundred
 * bytes against a 10 MB document.
 *
 * THE IDENTITY LINES WAIT FOR THE HOST TO RESOLVE, the same rule the footer has
 * followed since the white-label work: the static export's first paint is
 * always the default tenant, so a legal operator painted and then corrected is
 * the exact misstatement the content store exists to prevent. A brand colour
 * flashing is cosmetic; "Operated by Safal Capital Services Private Limited" on
 * a broker's page is not.
 */

/* The nav a theme's header carries. Short, because a broker's client arrives to
   do one of these things — the full set lives in our own header, which is a
   different design with room for it. */
const NAV: { href: string; label: string }[] = [
  { href: '/ipos/open/', label: 'Open IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/performance/', label: 'Performance' },
];

/**
 * The brand lockup a theme's chrome shows.
 *
 * IT EXISTS BECAUSE THE THEME CHROME WAS THROWING THE PARTNER'S LOGO AWAY.
 * Our own `SiteHeader` has always rendered `tenant.logo`; this one rendered an
 * initial in a coloured square, so a partner who had uploaded their wordmark
 * got it on our default layout and a box with one letter in it on every theme
 * — picking a theme LOST them their own mark. Finwave has had a logo on file
 * the whole time.
 *
 * PRECEDENCE MIRRORS THE DEFAULT HEADER so the two cannot disagree about which
 * image is the brand: our own site takes our wordmark, a partner takes theirs,
 * and only a tenant with no logo at all falls back to the mark-and-name
 * lockup the themes were drawn with.
 */
function ThemeBrand({ name, initial }: { name: string; initial: string }) {
  const tenant = useTenant();
  if (tenant.isDefault) {
    return <img src="/investoyard-logo.svg" alt="Investoyard" height={28} style={{ display: 'block' }} />;
  }
  if (tenant.logo) {
    return <img className="thm-logo" src={tenant.logo} alt={name} />;
  }
  return (
    <>
      <span className="thm-mark" aria-hidden>{initial}</span>
      <span className="thm-brand-nm">{name}</span>
    </>
  );
}

/**
 * The same lockup on the footer, where the ground is the theme's own.
 *
 * `footerLogo` IS PREFERRED AND IS NOT FILTERED; the ordinary logo is, because
 * a brand mark drawn for a white page is close to invisible on the #14162A
 * footer most themes use. The filter is on `.is-fallback` and A THEME WITH A
 * LIGHT FOOTER TURNS IT OFF — Cobalt's footer is white, and forcing a logo
 * white there would hide it completely, which is the failure the ten rgba
 * literals in `.thm-foot` already taught us to check for.
 */
function ThemeFootBrand({ name, initial }: { name: string; initial: string }) {
  const tenant = useTenant();
  if (tenant.isDefault) {
    return (
      <>
        <span className="thm-foot-mark" aria-hidden>{initial}</span>
        <span className="thm-foot-nm">{name}</span>
      </>
    );
  }
  const src = tenant.footerLogo || tenant.logo;
  if (src) {
    return <img className={`thm-foot-logo${tenant.footerLogo ? '' : ' is-fallback'}`} src={src} alt={name} />;
  }
  return (
    <>
      <span className="thm-foot-mark" aria-hidden>{initial}</span>
      <span className="thm-foot-nm">{name}</span>
    </>
  );
}

export function ThemeHeader() {
  const site = useSite();
  const tenant = useTenant();
  const pathname = usePathname() || '/';
  const name = tenantDisplayName(tenant);
  const initial = (name.trim()[0] ?? 'I').toUpperCase();

  return (
    <div className="thm-chrome" data-chrome="header">
      {/* The utility strip: the way back to the broker's own platform. Renders
          only when the partner turned it on AND gave it somewhere to point —
          `resolveSite` makes that one decision so this cannot hold a second
          opinion about it, and an empty strip above the header reads as a
          broken page. */}
      {site.utility ? (
        <div className="tpl-util">
          <div className="tpl-util-in">
            {site.utility.mainSiteUrl ? (
              <a className="tpl-util-link" href={site.utility.mainSiteUrl}>
                <Icon name="chevron-left" size={13} aria-hidden />
                Back to {name}
              </a>
            ) : null}
            <span className="tpl-util-sp" />
            {site.utility.supportUrl ? (
              <a className="tpl-util-link" href={site.utility.supportUrl}>Support</a>
            ) : null}
          </div>
        </div>
      ) : null}

      <header className="thm-head">
        <div className="thm-head-in">
          <Link className="thm-brand" href="/" aria-label={`${name} home`}>
            <ThemeBrand name={name} initial={initial} />
          </Link>

          <nav className="thm-nav" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={pathname.startsWith(n.href) ? 'is-on' : ''}
              >{n.label}</Link>
            ))}
          </nav>

          <div className="thm-head-act">
            {/* the label is shared with the test that keeps it distinct from navCta */}
            <Link className="btn btn-ghost btn-sm" href="/login">{SIGN_IN_LABEL}</Link>
            <Link className="btn btn-primary btn-sm" href="/signup">{site.navCta}</Link>
          </div>
        </div>
      </header>
    </div>
  );
}

export function ThemeFooter() {
  const tenant = useTenant();
  const id = tenantIdentity(tenant);
  const c = tenantContact(tenant);
  const name = tenantDisplayName(tenant);
  const initial = (name.trim()[0] ?? 'I').toUpperCase();
  const year = new Date().getFullYear();

  return (
    <footer className="thm-foot" data-chrome="footer">
      <div className="thm-foot-in">
        <div className="thm-foot-cols">
          <div className="thm-foot-col thm-foot-brand">
            <ThemeFootBrand name={name} initial={initial} />
            {/* `legalEntity` returns undefined rather than falling back to a
                brand name, and this prints NOTHING when it does. A page that
                says nothing about who runs it is a gap somebody fixes; one
                naming the wrong company is a misstatement nobody notices. */}
            {id.legalName ? <p className="thm-foot-legal">Operated by {id.legalName}</p> : null}
            {id.sebiRegistration ? <p className="thm-foot-legal">SEBI {id.sebiRegistration}</p> : null}
          </div>

          <div className="thm-foot-col">
            <h4>IPOs</h4>
            <Link href="/ipos/open/">Open</Link>
            <Link href="/ipos/upcoming/">Upcoming</Link>
            <Link href="/ipos/listed/">Listed</Link>
            <Link href="/ipos/archive/">All issues</Link>
          </div>

          <div className="thm-foot-col">
            <h4>Tools</h4>
            <Link href="/subscription/">Live subscription</Link>
            <Link href="/allotment/">Allotment</Link>
            <Link href="/performance/">Listing performance</Link>
            <Link href="/calendar/">Calendar</Link>
          </div>

          <div className="thm-foot-col">
            <h4>Company</h4>
            <Link href="/about/">About</Link>
            <Link href="/contact/">Contact</Link>
            <Link href="/faqs/">FAQs</Link>
            <Link href="/glossary/">Glossary</Link>
          </div>

          <div className="thm-foot-col">
            <h4>Legal</h4>
            <Link href="/terms/">Terms</Link>
            <Link href="/privacy-policy/">Privacy</Link>
            <Link href="/disclaimer/">Disclaimer</Link>
            <Link href="/attributions/">Attributions</Link>
          </div>
        </div>

        {/* The grievance officer is not decoration: a SEBI-registered
            intermediary must publish one, and ours standing here would send a
            partner's clients' complaints to us. Printed only when supplied —
            `contentGaps` is what chases it. */}
        {(c.grievanceName || c.grievanceEmail || c.supportEmail) ? (
          <div className="thm-foot-grv">
            {c.grievanceName ? <span>Grievance officer: {c.grievanceName}</span> : null}
            {c.grievanceEmail ? <a href={`mailto:${c.grievanceEmail}`}>{c.grievanceEmail}</a> : null}
            {c.supportEmail ? <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> : null}
          </div>
        ) : null}

        <div className="thm-foot-base">
          <span suppressHydrationWarning>
            © {year} {id.legalName ?? name}
          </span>
          <span className="thm-foot-dis">
            Investing in securities carries market risk. Read all offer documents carefully.
          </span>
        </div>
      </div>
    </footer>
  );
}
