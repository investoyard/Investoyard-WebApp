import { SITE_ORIGIN, absolute } from '@/lib/site';

/**
 * Structured data, emitted as a JSON-LD script tag.
 *
 * `<` is escaped so a stray angle bracket inside operator-entered copy can
 * never close the script element early.
 */
export function JsonLd({ data, id }: { data: Record<string, unknown>; id?: string }) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/**
 * The id the Organization tag carries, so the client can find and rewrite it on
 * a white-label host. See `TenantSchema`.
 */
export const ORG_JSONLD_ID = 'org-jsonld';

/** The default channel's Organization — our values, and the shape to patch. */
export const ORGANIZATION_BASE: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Investoyard',
  legalName: 'Safal Capital Services Private Limited',
  url: SITE_ORIGIN,
  logo: absolute('/investoyard-logo.svg'),
  description:
    'IPO information and application platform for India — Mainboard and SME issues, with applications for yourself and your family.',
  areaServed: 'IN',
};

/**
 * The operating entity — rendered once, in the root layout.
 *
 * THIS IS THE STATIC, OUR-DOMAIN COPY, and it stays SERVER-rendered on purpose:
 * it is correct for our own host, it is the structured data our SEO depends on,
 * and server-rendered beats client-injected for that. But the static export
 * cannot know the request host, so a white-label domain was being served this
 * very tag — declaring OUR legal name and OUR logo as the operator of a broker's
 * site, on every page of it.
 *
 * `TenantSchema` closes that by REWRITING this tag in place once the domain has
 * resolved. Rewriting rather than adding a second tag, so a crawler never sees
 * two Organizations; and rewriting rather than moving the whole thing
 * client-side, so our own pages keep their server render — on our host the
 * rewrite resolves to the default tenant and does nothing at all.
 */
export function OrganizationJsonLd() {
  return <JsonLd id={ORG_JSONLD_ID} data={ORGANIZATION_BASE} />;
}

/** A question/answer pair for `FaqPageJsonLd`. Answers must be PLAIN TEXT. */
export type FaqEntry = { q: string; t: string };

export function FaqPageJsonLd({ entries }: { entries: FaqEntry[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: entries.map(({ q, t }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: t },
        })),
      }}
    />
  );
}

/**
 * The public allotment checker. Declared as a free tool rather than as part of
 * the Organization, because it answers ANY pan — including applications made
 * somewhere else — and that is what the search intent is.
 */
export function AllotmentCheckerJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'IPO Allotment Status Checker',
        url: absolute('/allotment/'),
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern browser',
        description:
          'Check IPO allotment status for any PAN, for Mainboard and SME issues, using the registrar’s own allotment file. No account required.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        publisher: { '@type': 'Organization', name: 'Investoyard' },
      }}
    />
  );
}
