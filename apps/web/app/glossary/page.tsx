import { GlossaryBrowser } from '@/components/GlossaryBrowser';

export const metadata = {
  title: 'IPO Glossary — Every Term in Plain Language | Investoyard',
  description: 'From ASBA to underwriting — every important Indian IPO term explained in plain language: pricing, application, allotment, grey market, SME issues, buybacks and OFS.',
};

// Content lives in packages/shared-types/src/glossary.ts — ONE source for web AND mobile.
// The page stays a server component for its metadata; the browsing surface
// (search, sticky filter, scroll-spy) is the client component below.
export default function GlossaryPage() {
  return (
    <div className="trust-page gl-page">
      <h1>IPO Glossary</h1>
      <p className="lead-p">Every important term, in plain language — from ASBA to the grey market.</p>

      <GlossaryBrowser />

      <p className="disclaimer" style={{ marginTop: 26 }}>
        Educational content only — not investment advice. Definitions simplify the rules; the offer documents and SEBI regulations are authoritative.
      </p>
    </div>
  );
}
