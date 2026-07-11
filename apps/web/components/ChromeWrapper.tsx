'use client';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { InstallPrompt } from '@/components/InstallPrompt';
import { TenantProvider } from '@/components/TenantProvider';

/** Public site gets the header/footer + tenant branding; /admin is the operator shell. */
export function ChromeWrapper({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  if (path.startsWith('/admin')) return <>{children}</>;
  return (
    <TenantProvider>
      <Suspense fallback={<div className="header" />}><SiteHeader /></Suspense>
      <main className="container">{children}</main>
      <SiteFooter />
      <InstallPrompt />
    </TenantProvider>
  );
}
