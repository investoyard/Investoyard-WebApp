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
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const registry = partnerRegistry(await loadTenants());
  return (
    <html lang="en" className={variant.fontClassName} data-variant={variant.name} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prepaintScript(registry) }} />
      </head>
      <body>
        <TenantProvider>
          <variant.Shell>{children}</variant.Shell>
        </TenantProvider>
      </body>
    </html>
  );
}
