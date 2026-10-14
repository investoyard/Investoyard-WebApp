'use client';
import { useEffect } from 'react';
import { ORG_JSONLD_ID, ORGANIZATION_BASE } from '@/components/JsonLd';
import { useTenant } from '@/components/TenantProvider';
import { tenantDisplayName, tenantLegalEntity, tenantIdentity, tenantContact } from '@/lib/tenants';

/**
 * Correct the Organization structured data for the domain the page is served
 * from.
 *
 * WHY THIS IS A CLIENT COMPONENT AND NOT A PROP. The site is a static export:
 * one set of HTML answers every host, so the server render cannot know whether
 * it is being served from our domain or a partner's. Until now that meant a
 * broker's white-label published, in machine-readable form on every page, that
 * the operator was Safal Capital Services Private Limited with our logo.
 *
 * IT REWRITES THE EXISTING TAG, it does not add one. A second Organization block
 * would leave a crawler to choose between two answers, and the wrong one is
 * still on the page. On our own host the resolved tenant IS the default, the
 * computed payload is byte-identical to what the server rendered, and the effect
 * returns without touching the DOM — so our SEO is unchanged and keeps its
 * server render.
 *
 * It is weaker than a server-rendered tag; Google renders JS and reads the
 * post-render DOM, but a partner wanting first-class organic SEO on their own
 * domain needs SSR, which is its own piece of work. The trade is worth taking
 * because the alternative on a partner host is not "weaker", it is "wrong".
 *
 * The canonical and og:url are the same class of problem and are NOT fixed here
 * — they are baked by `metadataBase` and need the same pass.
 */
export function TenantSchema() {
  const tenant = useTenant();

  useEffect(() => {
    const el = document.getElementById(ORG_JSONLD_ID);
    if (!el) return;

    /* The default channel is already what the server rendered. Leaving it
       untouched is not just an optimisation — it is what keeps our own pages
       on their server-rendered tag. */
    if (tenant.isDefault) return;

    const name = tenantDisplayName(tenant);
    const entity = tenantLegalEntity(tenant);
    const id = tenantIdentity(tenant);
    const c = tenantContact(tenant);

    const data: Record<string, unknown> = {
      ...ORGANIZATION_BASE,
      name,
      /* Each of these is DELETED rather than left at our value when the partner
         has not supplied one. An absent legalName is a gap; our legalName on
         their domain is a false statement about who is accountable. Same for
         the logo and the url, which otherwise point at us. */
      legalName: entity,
      url: tenant.customDomain ? `https://${tenant.customDomain}` : undefined,
      logo: tenant.logo || undefined,
      description: `IPO information and application platform — Mainboard and SME issues, operated by ${entity ?? name}.`,
    };
    if (c.supportEmail || c.supportPhone) {
      data.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        ...(c.supportEmail ? { email: c.supportEmail } : {}),
        ...(c.supportPhone ? { telephone: c.supportPhone } : {}),
        areaServed: 'IN',
      };
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

    /* Same escape as the server renderer: a stray `<` inside an
       operator-entered legal name must not close the script element. */
    el.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  }, [tenant]);

  return null;
}
