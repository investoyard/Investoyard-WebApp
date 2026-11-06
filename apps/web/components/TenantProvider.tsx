'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Tenant, DEFAULT_TENANT, resolveTenantByHost, resolveTenantBySlug, applyBranding, applyPresentation, fetchTenants, tenantSite } from '@/lib/tenants';

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
 * The resolved layout, font and hero copy for the active tenant.
 *
 * Here rather than at each call site so every block that renders a piece of the
 * chosen layout reads ONE answer — the utility bar, the RM card and the app band
 * each gate on a different field of it, and three components resolving the row
 * themselves is three places for "is this block on" to drift. It also means a
 * caller cannot forget to pass the display name, which is what decides whether
 * the derived headline names the partner's trade name or the all-caps string
 * somebody typed at registration.
 */
export function useSite() {
  return tenantSite(useTenant());
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
    /*
     * `?preview=1` RESOLVES THE BRAND WITHOUT PERSISTING IT, and that is not a
     * nicety — the admin panel's live preview is a SAME-ORIGIN IFRAME, and
     * sessionStorage is shared across a tab's same-origin frames. Without this,
     * previewing a partner would write `iy_brand` into the OPERATOR's own tab,
     * and the next consumer page they opened would silently wear that
     * partner's brand. The preview still gets the brand for this render; it
     * just leaves no trace.
     */
    const ephemeral = params.get('preview') === '1';
    if (brandParam && !ephemeral) {
      try { sessionStorage.setItem('iy_brand', brandParam); } catch { /* ignore */ }
    }
    let slug: string | null = brandParam;
    if (!slug) { try { slug = sessionStorage.getItem('iy_brand'); } catch { slug = null; } }

    (async () => {
      const list = await fetchTenants(); // DB-driven registry (falls back to built-in)
      const resolved = resolveTenantBySlug(slug, list) ?? resolveTenantByHost(window.location.host, list);
      if (!active) return;
      applyBranding(resolved);
      applyPresentation(resolved);
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
