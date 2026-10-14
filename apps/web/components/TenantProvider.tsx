'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Tenant, DEFAULT_TENANT, resolveTenantByHost, resolveTenantBySlug, applyBranding, fetchTenants } from '@/lib/tenants';

const TenantContext = createContext<Tenant>(DEFAULT_TENANT);

/**
 * Whether the domain has been resolved yet, or we are still on the default.
 *
 * NOT a loading spinner — a GUARD FOR STATEMENTS THAT MUST NOT BE WRONG EVEN
 * BRIEFLY. The first render always uses the default tenant, so on a partner's
 * domain a footer line reading "Operated by Safal Capital Services Private
 * Limited" would be painted and then corrected a tick later. A brand colour
 * flashing is cosmetic; a legal operator flashing is the exact misstatement the
 * content store exists to prevent, so the lines that name an entity wait.
 *
 * It always becomes true: `fetchTenants` falls back to the built-in registry
 * when the API is unreachable, so nothing is hidden permanently.
 */
const ResolvedContext = createContext(false);

/** Read the active tenant (brand, flags) anywhere in the public site. */
export function useTenant(): Tenant {
  return useContext(TenantContext);
}

/** True once the host has actually been resolved. See `ResolvedContext`. */
export function useTenantResolved(): boolean {
  return useContext(ResolvedContext);
}

/**
 * Resolves the tenant on the client (static build) from the domain — or a
 * `?brand=<slug>` dev override — then paints the brand and provides it to the tree.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [resolved, setResolved] = useState(false);

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
      setResolved(true);
    })();
    return () => { active = false; };
  }, []);

  return (
    <TenantContext.Provider value={tenant}>
      <ResolvedContext.Provider value={resolved}>{children}</ResolvedContext.Provider>
    </TenantContext.Provider>
  );
}
