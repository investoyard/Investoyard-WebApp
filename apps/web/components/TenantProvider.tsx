'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Tenant, DEFAULT_TENANT, resolveTenantByHost, resolveTenantBySlug, applyBranding, fetchTenants } from '@/lib/tenants';

const TenantContext = createContext<Tenant>(DEFAULT_TENANT);

/** Read the active tenant (brand, flags) anywhere in the public site. */
export function useTenant(): Tenant {
  return useContext(TenantContext);
}

/**
 * Resolves the tenant on the client (static build) from the domain — or a
 * `?brand=<slug>` dev override — then paints the brand and provides it to the tree.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const brandParam = params.get('brand');
    if (brandParam) {
      try { sessionStorage.setItem('iy_brand', brandParam); } catch { /* ignore */ }
    }
    let slug: string | null = brandParam;
    if (!slug) { try { slug = sessionStorage.getItem('iy_brand'); } catch { slug = null; } }

    (async () => {
      const list = await fetchTenants(); // DB-driven registry (falls back to built-in)
      const resolved = resolveTenantBySlug(slug, list) ?? resolveTenantByHost(window.location.host, list);
      if (!active) return;
      applyBranding(resolved);
      setTenant(resolved);
    })();
    return () => { active = false; };
  }, []);

  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}
