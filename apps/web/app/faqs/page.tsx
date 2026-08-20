export const metadata = {
  title: 'Help & FAQs | Investoyard',
  description: 'Answers to common questions about applying to IPOs on Investoyard — UPI mandates, family applications, allotment, GMP and more.',
};

/** Draft FAQ set — operator will refine wording over time. */
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is Investoyard?',
    a: 'Investoyard is India’s IPO companion — track every Mainboard and SME IPO (dates, price band, live subscription, GMP, allotment, listing) and apply for yourself and your family from one place. It is operated by Safal Capital Services Private Limited.',
  },
  {
    q: 'Is Investoyard free?',
    a: 'Yes — tracking and applying are currently free. If charges are ever introduced, they will be announced on the platform in advance.',
  },
  {
    q: 'How do I apply to an IPO?',
    a: 'Sign in with your mobile OTP, add the applicant’s details once (PAN, demat, UPI), open a live IPO and tap Apply. Pick a category (Retail / HNI / Shareholder where offered), choose the bid size, give consent, and approve the UPI mandate that arrives in your UPI app. Funds are only blocked — money leaves your account only if shares are allotted.',
  },
  {
    q: 'Can I apply for my family?',
    a: 'Yes — add each family member as an applicant and select several members in one apply flow. SEBI rules require every applicant to use their OWN PAN, demat account and UPI/bank account; each member approves their own UPI mandate. One PAN can hold one application per IPO (plus one in a reserved shareholder/employee quota where the issue offers it).',
  },
  {
    q: 'What is the UPI limit? What if I want to invest more?',
    a: 'UPI mandates for IPOs are capped (currently ₹5,00,000). For larger HNI bids, use Print Forms — we generate a prefilled bank ASBA form that you sign and submit at your bank branch.',
  },
  {
    q: 'What are Print Forms?',
    a: 'Prefilled ASBA application forms. Choose the applicants and bid size, and download bank-ready PDFs (normal or syndicate form as applicable) with all details filled in — print, sign, and submit at the bank before the issue closes.',
  },
  {
    q: 'What is GMP? Should I rely on it?',
    a: 'Grey-market premium is the unofficial premium at which an IPO reportedly changes hands before listing. It is unregulated, unverifiable and often wrong — we show it purely as information (see our GMP accuracy tracker), never as advice. Do not make investment decisions based on GMP alone.',
  },
  {
    q: 'How do I check my allotment?',
    a: 'Open Portfolio after the allotment date — the status of every application updates automatically (allotted / not allotted, with share counts). You can also verify on the registrar’s website using your PAN or application number.',
  },
  {
    q: 'When do blocked funds release if I don’t get shares?',
    a: 'If shares are not allotted (or the issue is withdrawn), the ASBA block on your bank account is released automatically, typically within a day or two of the basis of allotment. The money never left your account — only the hold is removed.',
  },
  {
    q: 'Is my data safe?',
    a: 'Financial details are collected just-in-time (only when you apply) with explicit, itemized consent. PAN, bank and UPI identifiers are stored encrypted, and data is shared only with the market infrastructure needed to process your application (exchange / registrar / banker), as described in our Privacy Policy.',
  },
  {
    q: 'I have a complaint. Where do I go?',
    a: (
      <>Reach us first via the Contact options in the footer. For market-related grievances you can also use{' '}
        <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a> or the{' '}
        <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">ODR portal</a>.</>
    ),
  },
];

export default function FaqsPage() {
  return (
    <div className="trust-page">
      <h1>Help &amp; FAQs</h1>
      <p className="lead-p">Quick answers about applying, allotment, GMP and your data. New to the jargon? Start with the <a className="linklike" href="/glossary">IPO Glossary</a>.</p>
      <div className="faq-acc" style={{ marginTop: 18 }}>
        {FAQS.map((f, i) => (
          <details key={f.q} open={i === 0}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
