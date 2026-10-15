'use client';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { InstallPrompt } from '@/components/InstallPrompt';
import { TenantProvider } from '@/components/TenantProvider';
import { TenantSchema } from '@/components/TenantSchema';
import { TenantHead } from '@/components/TenantHead';

/** Public site gets the header/footer + tenant branding; /admin is the operator shell. */
export function ChromeWrapper({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  if (path.startsWith('/admin')) return <>{children}</>;
  return (
    <TenantProvider>
      {/* Corrects the root layout's Organization JSON-LD for the domain this
          page is actually served from. Inside the provider because that is
          what resolves the tenant; renders nothing. */}
      <TenantSchema />
      {/* Corrects the browser TAB — title and favicon — for the same reason
          and in the same place: the tab was the last part of the page still
          carrying our brand on a partner's domain. */}
      <TenantHead />
      <Suspense fallback={<div className="header" />}><SiteHeader /></Suspense>
      <main className="container">{children}</main>
      <SiteFooter />
      <InstallPrompt />
    </TenantProvider>
  );
}
