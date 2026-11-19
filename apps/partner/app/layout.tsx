import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import variant from '@variant';
import { loadTenants } from '@/core/data.server';
import { partnerRegistry, prepaintScript } from '@/core/tenant.server';
import { TenantProvider } from '@/core/tenant';

/*
 * No metadataBase and no canonical on purpose: one export serves every
 * partner on this variant, so any host baked in here would tell search
 * engines a partner's pages belong to somebody else.
 */
export const metadata: Metadata = {
  title: { default: 'IPOs', template: '%s' },
  description: 'Mainboard and SME IPOs: dates, price bands, live subscription and allotment status.',
  /* A preview build sits under our own domain with a placeholder broker on it; it must never be indexed. */
  ...(process.env.PARTNER_PREVIEW ? { robots: { index: false, follow: false } } : {}),
};

/*
 * A DOMAIN THAT MATCHES NO PARTNER sees only this notice. The pre-paint script
 * sets data-unconfigured during parse, so the site is never painted first and
 * then hidden. Neutral on purpose: no brand, no name — we cannot know whose
 * domain this is. The notice is [hidden] until then, so it costs nothing on a
 * configured site.
 */
const UNCONFIGURED_CSS =
  'html[data-unconfigured] body>:not(#pw-unconf){display:none!important}' +
  'html[data-unconfigured] #pw-unconf{display:flex!important;min-height:100vh;align-items:center;justify-content:center;padding:24px;' +
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1f2430;text-align:center}' +
  '#pw-unconf b{display:block;font-size:22px;font-weight:600}#pw-unconf span{display:block;margin-top:10px;color:#5a6170;font-size:15px}' +
  /* THE WORDS LIVE HERE, NOT IN THE MARKUP. The notice is in every page's HTML,
     and as text it would sit in the source of every real partner page for a
     search engine to read. As generated content it exists only when shown. */
  '#pw-unconf b::before{content:"This website is not set up yet"}#pw-unconf span::before{content:"Please check back later."}';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const registry = partnerRegistry(await loadTenants());
  return (
    <html lang="en" className={variant.fontClassName} data-variant={variant.name} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prepaintScript(registry, !!process.env.PARTNER_PREVIEW) }} />
        <style dangerouslySetInnerHTML={{ __html: UNCONFIGURED_CSS }} />
      </head>
      <body>
        <div id="pw-unconf" role="status" hidden>
          <div><b /><span /></div>
        </div>
        <TenantProvider>
          <variant.Shell>{children}</variant.Shell>
        </TenantProvider>
      </body>
    </html>
  );
}
