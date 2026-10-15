import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { ChromeWrapper } from '@/components/ChromeWrapper';
import { PwaRegister } from '@/components/PwaRegister';
import { OWN_HOSTS, SITE_ORIGIN } from '@/lib/site';
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
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Investoyard',
    locale: 'en_IN',
    url: '/',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        {/*
          * HIDE OUR-CHANNEL-ONLY CONTENT BEFORE THE BROWSER PAINTS.
          *
          * The site is a static export: one set of HTML answers every host, so
          * our Terms, Privacy and Disclaimer are in the markup that a partner's
          * domain also serves. React cannot help here — it only knows the host
          * after hydration, which is already too late to stop a visitor reading
          * a contract naming the wrong company.
          *
          * This runs during parse, needs no network, and compares the hostname
          * against OWN_HOSTS — the canonical host for this build plus the ones
          * still redirecting to it. Not ours → the content is
          * hidden before it is ever shown, and `TrustPage` then replaces it
          * with the partner's own page.
          *
          * Deliberately NOT a tenant lookup: knowing "this is not our domain"
          * is enough to stop the flash, and it is the only thing knowable
          * without a request.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var h=location.hostname;`
              + `if(${JSON.stringify(OWN_HOSTS)}.indexOf(h)>-1)return;`
              + `document.documentElement.setAttribute('data-foreign-host','');`
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
