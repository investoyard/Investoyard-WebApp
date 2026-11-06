import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Figtree, Manrope, Fraunces } from 'next/font/google';
import { ChromeWrapper } from '@/components/ChromeWrapper';
import { PwaRegister } from '@/components/PwaRegister';
import { OWN_HOSTS, SITE_ORIGIN, SITE_HOST } from '@/lib/site';
import { hostTemplateMap, flattenHostMap } from '@/lib/siteTemplates';
import { OrganizationJsonLd } from '@/components/JsonLd';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

/**
 * THE ALTERNATE FACES A WHITE-LABEL MAY CHOOSE, and why they are declared here
 * rather than named in the database.
 *
 * `next/font` resolves and SELF-HOSTS each family at build time — it rewrites
 * the files into the export and hands back a generated class. A family named at
 * runtime cannot be fetched that way, so a free-text font field would mean a
 * request to Google's CDN on the critical path of every partner page, a layout
 * shift the baked fonts do not have, and a typo that silently falls back to the
 * system stack. So the choice is a curated list, and `SITE_FONTS` in
 * shared-types is the list the admin selector and this file must agree on.
 *
 * Declaring them costs the CSS for four `@font-face` sets; the WOFF2 files
 * themselves are only fetched by a page that actually resolves to one, so our
 * own site downloads exactly what it did before.
 */
const figtree = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-figtree', weight: ['400', '500', '600', '700', '800'] });
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-manrope', weight: ['400', '500', '600', '700', '800'] });
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces', weight: ['600', '700'] });

/**
 * The share card every forward renders.
 *
 * A static asset rather than a generated `opengraph-image.tsx`: Next 14's
 * bundled @vercel/og cannot be imported on Windows (it resolves its own font
 * with `path.join` over a file:// URL, producing an invalid path), so
 * ImageResponse fails the export outright. The file is produced from the
 * design canvas instead — see apps/web/public/README-og.md.
 */
const OG_IMAGE = { url: '/og-default.png', width: 1200, height: 630, alt: 'Investoyard — India’s IPO companion' };

export const metadata: Metadata = {
  // Absolute base for every relative url Next resolves: the `canonical` and
  // `languages` values the detail routes return, plus og:image / twitter:image.
  // Without it those canonicals never resolve to a real origin.
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Investoyard — IPO information & application platform, India',
  description:
    'Track every Mainboard and SME IPO in India — dates, price band, live subscription, GMP and allotment. Apply for yourself and your family with your own PAN, demat and UPI.',
  applicationName: 'Investoyard',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.ico', shortcut: '/favicon.ico', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Investoyard', statusBarStyle: 'default' },
  /*
   * SELF-REFERENCING, NOT THE HOME PAGE. This read `'/'` until 2026-10-15,
   * and because metadata INHERITS, 37 of the 41 public routes emitted
   * `<link rel="canonical" href="https://…/">` — every hub, every listing and
   * all four trust pages telling Google they were duplicates of the home page
   * and should not be indexed on their own. Only four routes overrode it.
   *
   * `'./'` is resolved by Next against the ROUTE, so each page canonicalises
   * to itself and the four explicit overrides still win. Verified on the built
   * export rather than assumed — a relative canonical that silently resolved
   * to the origin would reproduce the identical bug while looking fixed.
   */
  alternates: { canonical: './' },
  /*
   * THE SAME FAULT THE CANONICAL NOTE ABOVE DESCRIBES, LEFT IN THE BLOCK TWO
   * LINES BELOW IT.
   *
   * `canonical` was corrected from `'/'` to `'./'` on 2026-10-15; `openGraph.url`
   * sat directly underneath and kept the `'/'`. Metadata inherits, and only
   * `/partner-api` overrides openGraph — so measured on the built export, ALL
   * 40 other routes emitted `og:url = https://investoyard.com/`. Share an IPO
   * page on WhatsApp and the preview linked to the home page.
   *
   * `'./'` is resolved by Next against the ROUTE, exactly as the canonical is,
   * so each page now points at itself. Verified on the export rather than
   * assumed, for the reason that note gives: a relative value that silently
   * resolved to the origin would reproduce the bug while looking fixed.
   *
   * THE TITLE AND DESCRIPTION ARE A SEPARATE, STILL-OPEN BUG AND MUST NOT BE
   * "FIXED" BY DELETING THEM HERE. They are inherited exactly as the url was,
   * so every page's share preview carries the home page's headline — the Jio
   * IPO page reads "Investoyard — India's IPO companion" while its own
   * `<title>` is correct. The tempting one-line fix is to omit them and let
   * Next derive them from the page's own `title`, AND NEXT DOES NOT DO THAT:
   * `generate/opengraph.js` emits `openGraph.title?.absolute` with no fallback
   * to `metadata.title`, so omitting them would leave 40 routes with NO
   * og:title at all, which is worse than a generic one. (twitter DOES fall
   * back — `postProcessMetadata` fills it from openGraph then from
   * `metadata.title` — which is why only the og side is stuck.)
   *
   * The real fix is to set openGraph per route, which is ~14 files or one
   * shared metadata helper, and is its own change.
   */
  openGraph: {
    type: 'website',
    siteName: 'Investoyard',
    locale: 'en_IN',
    url: './',
    title: 'Investoyard — India’s IPO companion',
    description: 'Track every Mainboard and SME IPO — and apply for your whole family in one flow.',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Investoyard — India’s IPO companion',
    description: 'Track every Mainboard and SME IPO — and apply for your whole family in one flow.',
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: '#3c2e7e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* Which layout each partner host gets, read from the tenant registry at BUILD
     time. An unreachable API gives {} — every partner renders our own layout and
     `TenantProvider` corrects it after hydration. See `siteTemplates.ts`. */
  const hostMap = flattenHostMap(await hostTemplateMap());

  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${figtree.variable} ${manrope.variable} ${fraunces.variable}`}>
      <body>
        {/*
          * EVERYTHING THAT MUST BE RIGHT BEFORE THE BROWSER PAINTS, in one pass.
          *
          * The site is a static export: one set of HTML answers every host, so
          * the server render cannot know whose domain it is on. React cannot
          * help — it only knows the host after hydration, which is already too
          * late for a contract naming the wrong company, and too late for a
          * crawler reading the pre-render snapshot.
          *
          * This runs during parse, needs no network, and does two things on a
          * host that is not ours — both of them ATTRIBUTES ON `<html>`, which
          * is the whole of why it is safe here. See below.
          *
          *   1. HIDES OUR-CHANNEL-ONLY CONTENT — our Terms, Privacy and
          *      Disclaimer are in the markup a partner's domain also serves.
          *      `TrustPage` then substitutes the partner's own page.
          *
          *   2. SETS THE LAYOUT — `data-template` and `data-font` from the
          *      baked host map, so a partner's first paint is already their
          *      layout rather than ours rearranging a tick later.
          *
          * WHAT THIS DELIBERATELY DOES **NOT** DO IS TOUCH THE HEAD, and that
          * limit was measured rather than assumed. The canonical, og:url and
          * hreflang are baked with OUR origin and have to be repointed on a
          * partner host — but rewriting them HERE gives the page TWO of each:
          * React re-inserts its own server-rendered copy at hydration, so a
          * foreign host measured canonical=2, og=2, hreflang=6 against 1/1/3 on
          * ours. A second canonical leaves a crawler choosing between two
          * answers and the wrong one is still on the page, which is exactly the
          * failure the rewrite exists to avoid.
          *
          * The split that works: `<html>` attributes are React's to render only
          * if React rendered them, and it never rendered these — which is why
          * `data-foreign-host` has been safe here for weeks. Head tags React
          * DID render must be mutated after hydration, which is what
          * `TenantCanonical` does, in the same place and by the same mechanism
          * as `TenantSchema`. Nothing is lost by the later timing: these tags
          * are never painted, and a crawler that runs JS reads the settled DOM.
          *
          * On OUR hosts it returns at the first line, so our own server render
          * is untouched and our SEO is unchanged. `?template=` is read before
          * that return, as the dev override for reviewing a partner layout on
          * our own host — the same affordance `?brand=` already provides.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{`
              + `var d=document.documentElement,q=location.search,m;`
              /* dev override: works on any host, including ours, which is the point */
              + `if(q&&(m=q.match(/[?&]template=([a-z]+)/)))d.setAttribute('data-template',m[1]);`
              + `if(q&&(m=q.match(/[?&]font=([a-z]+)/)))d.setAttribute('data-font',m[1]);`
              + `var h=location.hostname;`
              + `if(${JSON.stringify(OWN_HOSTS)}.indexOf(h)>-1)return;`
              + `d.setAttribute('data-foreign-host','');`
              + `var p=(${JSON.stringify(hostMap)})[h];`
              + `if(p){p=p.split('|');`
              + `if(!d.hasAttribute('data-template'))d.setAttribute('data-template',p[0]);`
              + `if(!d.hasAttribute('data-font'))d.setAttribute('data-font',p[1]);}`
              + `}catch(e){}})()`,
          }}
        />
        <OrganizationJsonLd />
        <ChromeWrapper>{children}</ChromeWrapper>
        <PwaRegister />
      </body>
    </html>
  );
}
