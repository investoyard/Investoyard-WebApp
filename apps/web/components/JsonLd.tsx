import { SITE_ORIGIN, absolute } from '@/lib/site';

/**
 * Structured data, emitted as a JSON-LD script tag.
 *
 * `<` is escaped so a stray angle bracket inside operator-entered copy can
 * never close the script element early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/** The operating entity — rendered once, in the root layout. */
export function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Investoyard',
        legalName: 'Safal Capital Services Private Limited',
        url: SITE_ORIGIN,
        logo: absolute('/investoyard-logo.svg'),
        description:
          'IPO information and application platform for India — Mainboard and SME issues, with applications for yourself and your family.',
        areaServed: 'IN',
      }}
    />
  );
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
