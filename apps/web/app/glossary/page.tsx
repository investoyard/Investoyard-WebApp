import { GLOSSARY } from '@investoyard/shared-types';

export const metadata = {
  title: 'IPO Glossary — Every Term in Plain Language | Investoyard',
  description: 'From ASBA to underwriting — every important Indian IPO term explained in plain language: pricing, application, allotment, grey market, SME issues, buybacks and OFS.',
};

// Content lives in packages/shared-types/src/glossary.ts — ONE source for web AND mobile.
const SECTIONS = GLOSSARY;

export default function GlossaryPage() {
  return (
    <div className="trust-page">
      <h1>IPO Glossary</h1>
      <p className="lead-p">Every important term, in plain language — from ASBA to the grey market.</p>

      <div className="gl-jump">
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="gl-chip">{s.title}</a>)}
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="gl-sec">
          <h2>{s.title}</h2>
          <dl className="gl-list">
            {s.terms.map(([term, def]) => (
              <div className="gl-item" key={term}>
                <dt>{term}</dt>
                <dd>{def}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="disclaimer" style={{ marginTop: 26 }}>
        Educational content only — not investment advice. Definitions simplify the rules; the offer documents and SEBI regulations are authoritative.
      </p>
    </div>
  );
}
