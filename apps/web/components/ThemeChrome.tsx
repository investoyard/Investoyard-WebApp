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
function ThemeBrand({ name, initial, dark }: { name: string; initial: string; dark?: boolean }) {
  const tenant = useTenant();
  if (tenant.isDefault) {
    /* our indigo-and-gold wordmark loses its indigo half on a near-black bar */
    const src = dark ? '/investoyard-logo-light.svg' : '/investoyard-logo.svg';
    return <img src={src} alt="Investoyard" height={28} style={{ display: 'block' }} />;
  }
  /* on a dark bar a partner's own footer mark is the one drawn for this
     ground; an ordinary logo falls back and is forced white, exactly as in
     the footer, because it is the same question in a different place */
  const src = dark ? (tenant.footerLogo || tenant.logo) : tenant.logo;
  if (src) {
    const fallback = dark && !tenant.footerLogo;
    return <img className={`thm-logo${fallback ? ' is-fallback' : ''}`} src={src} alt={name} />;
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

/*
 * THE NAV EACH THEME CARRIES, AND IT IS NOT THE SAME LIST.
 *
 * A header's link set is part of its architecture, not a constant it happens
 * to render: Onyx's section tabs are a trading platform's, so they take the
 * full set; Cobalt's pill bar has room for three before it stops reading as a
 * pill; Meridian centres four, which is what a centred nav balances at.
 */
const NAV_FULL: { href: string; label: string }[] = [
  { href: '/ipos/open/', label: 'Open IPOs' },
  { href: '/subscription/', label: 'Subscription' },
  { href: '/allotment/', label: 'Allotment' },
  { href: '/performance/', label: 'Performance' },
  { href: '/calendar/', label: 'Calendar' },
  { href: '/gmp/', label: 'Exp. Premium' },
];
const NAV_CORE = NAV_FULL.slice(0, 4);
const NAV_SHORT = NAV_FULL.slice(0, 3);

function navLinks(items: typeof NAV_FULL, pathname: string, cls?: string) {
  return items.map((n) => (
    <Link
      key={n.href}
      href={n.href}
      className={[cls, pathname.startsWith(n.href) ? 'is-on' : ''].filter(Boolean).join(' ') || undefined}
    >{n.label}</Link>
  ));
}

/**
 * The utility strip — the way back to the broker's own platform.
 *
 * Renders only when the partner turned it on AND gave it somewhere to point.
 * `resolveSite` makes that one decision so this cannot hold a second opinion
 * about it, and an empty strip above the header reads as a broken page.
 */
function UtilityStrip({ name }: { name: string }) {
  const site = useSite();
  if (!site.utility) return null;
  return (
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
  );
}

/*
 * THREE HEADERS, THREE ARCHITECTURES — and this is the change the operator
 * asked for in those words: "need separate theme with totally different
 * layout, but u make all theme same header".
 *
 * They were right, and it was measurable: this file had ZERO theme branches
 * in it, and of the four themes Meridian and Onyx touched the header's layout
 * zero times while Cobalt touched it four. Three of the four headers were the
 * same bar in different paint. What follows are three different objects:
 *
 *   MERIDIAN  two rows, the SLIM one on top. A utility line carrying the
 *             secondary action, then a tall calm bar with the nav CENTRED
 *             between the mark and one primary action. An institution's site.
 *
 *   ONYX      two rows, the DENSE one underneath — the inversion is the
 *             point. A compact identity row, then section tabs the width of
 *             the page in small caps with a live accent on the open one. A
 *             trading platform's chrome.
 *
 *   COBALT    one FLOATING bar, inset from the edges, rounded and shadowed,
 *             with the nav as a pill group. Not a full-bleed band at all,
 *             which is the fintech convention and the thing that makes it
 *             read as an app rather than a site.
 *
 * ALL THREE ARE IN THE DOM AND CSS SHOWS ONE, the same reason the chrome and
 * our own header both are: a static export answers every host with one set of
 * HTML, so the choice cannot be made at build time. Each is ~1 KB against a
 * 10 MB document.
 */

/** MERIDIAN — a utility line over a tall bar with the nav centred. */
function MeridianHeader({ name, initial, pathname }: { name: string; initial: string; pathname: string }) {
  const site = useSite();
  return (
    <div className="thm-chrome thm-mer" data-chrome="header" data-theme-chrome="meridian">
      <UtilityStrip name={name} />
      {/* The secondary action lives UP HERE rather than beside the primary
          one. That is the architectural difference from the other two: the
          main bar is left to carry identity, navigation and one thing to do. */}
      <div className="mer-top">
        <div className="mer-top-in">
          <span className="mer-top-note">Mainboard and SME issues · live subscription · allotment</span>
          <Link className="mer-top-link" href="/login">{SIGN_IN_LABEL}</Link>
        </div>
      </div>
      <header className="thm-head mer-head">
        <div className="thm-head-in mer-head-in">
          <Link className="thm-brand" href="/" aria-label={`${name} home`}>
            <ThemeBrand name={name} initial={initial} />
          </Link>
          <nav className="thm-nav mer-nav" aria-label="Main">
            {navLinks(NAV_CORE, pathname)}
          </nav>
          <div className="thm-head-act">
            <Link className="btn btn-primary btn-sm" href="/signup">{site.navCta}</Link>
          </div>
        </div>
      </header>
    </div>
  );
}

/** ONYX — a compact identity row over full-width section tabs. */
function OnyxHeader({ name, initial, pathname }: { name: string; initial: string; pathname: string }) {
  const site = useSite();
  return (
    <div className="thm-chrome thm-onx" data-chrome="header" data-theme-chrome="onyx">
      <UtilityStrip name={name} />
      <header className="thm-head onx-head">
        <div className="thm-head-in onx-head-in">
          <Link className="thm-brand" href="/" aria-label={`${name} home`}>
            <ThemeBrand name={name} initial={initial} dark />
          </Link>
          <span className="onx-rule" aria-hidden />
          {/* The desk's own words for what this screen is. A terminal names
              its context in the chrome rather than in a hero it does not have. */}
          <span className="onx-ctx">IPO DESK</span>
          <div className="thm-head-act onx-act">
            <Link className="btn btn-ghost btn-sm" href="/login">{SIGN_IN_LABEL}</Link>
            <Link className="btn btn-primary btn-sm" href="/signup">{site.navCta}</Link>
          </div>
        </div>
      </header>
      {/* THE SECOND ROW IS THE NAV, which is the inversion of Meridian's and
          the thing that makes this read as a platform: section tabs across
          the full measure, underlined on the open one. */}
      <nav className="onx-tabs" aria-label="Main">
        <div className="onx-tabs-in">
          {navLinks(NAV_FULL, pathname, 'onx-tab')}
        </div>
      </nav>
    </div>
  );
}

/** COBALT — one floating pill bar, inset from the edges. */
function CobaltHeader({ name, initial, pathname }: { name: string; initial: string; pathname: string }) {
  const site = useSite();
  return (
    <div className="thm-chrome thm-cob" data-chrome="header" data-theme-chrome="cobalt">
      <UtilityStrip name={name} />
      <header className="thm-head cob-head">
        <div className="cob-bar">
          <Link className="thm-brand" href="/" aria-label={`${name} home`}>
            <ThemeBrand name={name} initial={initial} />
          </Link>
          <nav className="cob-nav" aria-label="Main">
            {navLinks(NAV_SHORT, pathname, 'cob-pill')}
          </nav>
          <div className="thm-head-act cob-act">
            <Link className="cob-ghost" href="/login">{SIGN_IN_LABEL}</Link>
            <Link className="btn btn-primary btn-sm cob-cta" href="/signup">{site.navCta}</Link>
          </div>
        </div>
      </header>
    </div>
  );
}

export function ThemeHeader() {
  const tenant = useTenant();
  const pathname = usePathname() || '/';
  const name = tenantDisplayName(tenant);
  const initial = (name.trim()[0] ?? 'I').toUpperCase();
  const p = { name, initial, pathname };
  return (
    <>
      <MeridianHeader {...p} />
      <OnyxHeader {...p} />
      <CobaltHeader {...p} />
    </>
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
