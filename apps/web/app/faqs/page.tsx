import { FaqBrowser, type FaqGroup } from '@/components/FaqBrowser';

export const metadata = {
  title: 'Help & FAQs | Investoyard',
  description: 'Answers to common questions about applying to IPOs on Investoyard — UPI mandates, family applications, allotment, GMP and more.',
};

/**
 * Draft FAQ set — operator will refine wording over time.
 *
 * Grouped by the situation someone is actually in, not by topic in the
 * abstract. `t` is the plain-text copy of the answer used for search; keep it
 * in step with `a` whenever an answer changes.
 */
const GROUPS: FaqGroup[] = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      {
        q: 'What is Investoyard?',
        k: 'about company safal capital who are you platform',
        a: 'Investoyard is India’s IPO companion — track every Mainboard and SME IPO (dates, price band, live subscription, GMP, allotment, listing) and apply for yourself and your family from one place. It is operated by Safal Capital Services Private Limited.',
        t: 'Investoyard is India’s IPO companion — track every Mainboard and SME IPO (dates, price band, live subscription, GMP, allotment, listing) and apply for yourself and your family from one place. It is operated by Safal Capital Services Private Limited.',
      },
      {
        q: 'Is Investoyard free?',
        k: 'cost charges fees pricing brokerage commission',
        a: 'Yes — tracking and applying are currently free. If charges are ever introduced, they will be announced on the platform in advance.',
        t: 'Yes — tracking and applying are currently free. If charges are ever introduced, they will be announced on the platform in advance.',
      },
      {
        q: 'Which IPOs do you cover?',
        k: 'mainboard sme nse bse segment board coverage',
        a: 'Both segments — Mainboard issues and SME issues, on NSE and BSE. Every issue is tracked from the day its dates are published through to listing day.',
        t: 'Both segments — Mainboard issues and SME issues, on NSE and BSE. Every issue is tracked from the day its dates are published through to listing day.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & applicants',
    items: [
      {
        q: 'Do I need a demat account to apply?',
        k: 'demat dp id client id nsdl cdsl broker open account',
        a: 'Yes. Shares are credited to a demat account, so every applicant needs one of their own — with any broker or depository participant. You do not need to move it to us: keep the demat you already have and apply here.',
        t: 'Yes. Shares are credited to a demat account, so every applicant needs one of their own — with any broker or depository participant. You do not need to move it to us: keep the demat you already have and apply here.',
      },
      {
        q: 'Can I apply for my family?',
        k: 'family spouse wife husband children parents multiple applications hni',
        a: 'Yes — add each family member as an applicant and select several members in one apply flow. SEBI rules require every applicant to use their OWN PAN, demat account and UPI/bank account; each member approves their own UPI mandate. One PAN can hold one application per IPO (plus one in a reserved shareholder/employee quota where the issue offers it).',
        t: 'Yes — add each family member as an applicant and select several members in one apply flow. SEBI rules require every applicant to use their OWN PAN, demat account and UPI/bank account; each member approves their own UPI mandate. One PAN can hold one application per IPO (plus one in a reserved shareholder/employee quota where the issue offers it).',
      },
    ],
  },
  {
    id: 'applying',
    title: 'Applying',
    items: [
      {
        q: 'How do I apply to an IPO?',
        k: 'apply bid application steps how to mandate upi consent',
        a: 'Sign in with your mobile OTP, add the applicant’s details once (PAN, demat, UPI), open a live IPO and tap Apply. Pick a category (Retail / HNI / Shareholder where offered), choose the bid size, give consent, and approve the UPI mandate that arrives in your UPI app. Funds are only blocked — money leaves your account only if shares are allotted.',
        t: 'Sign in with your mobile OTP, add the applicant’s details once (PAN, demat, UPI), open a live IPO and tap Apply. Pick a category (Retail / HNI / Shareholder where offered), choose the bid size, give consent, and approve the UPI mandate that arrives in your UPI app. Funds are only blocked — money leaves your account only if shares are allotted.',
      },
      {
        q: 'What are Print Forms?',
        k: 'print form pdf asba bank branch offline paper syndicate',
        a: 'Prefilled ASBA application forms. Choose the applicants and bid size, and download bank-ready PDFs (normal or syndicate form as applicable) with all details filled in — print, sign, and submit at the bank before the issue closes.',
        t: 'Prefilled ASBA application forms. Choose the applicants and bid size, and download bank-ready PDFs (normal or syndicate form as applicable) with all details filled in — print, sign, and submit at the bank before the issue closes.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & UPI limits',
    items: [
      {
        q: 'What is the UPI limit? What if I want to invest more?',
        k: 'upi limit cap 5 lakh mandate maximum hni big bid',
        a: 'UPI mandates for IPOs are capped (currently ₹5,00,000). For larger HNI bids, use Print Forms — we generate a prefilled bank ASBA form that you sign and submit at your bank branch.',
        t: 'What is the UPI limit? UPI mandates for IPOs are capped (currently ₹5,00,000). For larger HNI bids, use Print Forms — we generate a prefilled bank ASBA form that you sign and submit at your bank branch.',
      },
      {
        q: 'When do blocked funds release if I don’t get shares?',
        k: 'refund unblock release money back blocked funds not allotted reversal',
        a: 'If shares are not allotted (or the issue is withdrawn), the ASBA block on your bank account is released automatically, typically within a day or two of the basis of allotment. The money never left your account — only the hold is removed.',
        t: 'If shares are not allotted (or the issue is withdrawn), the ASBA block on your bank account is released automatically, typically within a day or two of the basis of allotment. The money never left your account — only the hold is removed.',
      },
    ],
  },
  {
    id: 'allotment',
    title: 'Allotment & listing',
    items: [
      {
        q: 'How do I check my allotment?',
        k: 'allotment status allotted result registrar pan check',
        a: 'Open Portfolio after the allotment date — the status of every application updates automatically (allotted / not allotted, with share counts). You can also verify on the registrar’s website using your PAN or application number.',
        t: 'How do I check my allotment? Open Portfolio after the allotment date — the status of every application updates automatically (allotted / not allotted, with share counts). You can also verify on the registrar’s website using your PAN or application number.',
      },
    ],
  },
  {
    id: 'gmp',
    title: 'GMP',
    items: [
      {
        q: 'What is GMP? Should I rely on it?',
        k: 'gmp grey market premium kostak listing gain',
        a: 'Grey-market premium is the unofficial premium at which an IPO reportedly changes hands before listing. It is unregulated, unverifiable and often wrong — we show it purely as information (see our GMP accuracy tracker), never as advice. Do not make investment decisions based on GMP alone.',
        t: 'What is GMP? Grey-market premium is the unofficial premium at which an IPO reportedly changes hands before listing. It is unregulated, unverifiable and often wrong — we show it purely as information (see our GMP accuracy tracker), never as advice. Do not make investment decisions based on GMP alone.',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data & privacy',
    items: [
      {
        q: 'Is my data safe?',
        k: 'privacy security data dpdp consent encryption pan safe',
        a: 'Financial details are collected just-in-time (only when you apply) with explicit, itemized consent. PAN, bank and UPI identifiers are stored encrypted, and data is shared only with the market infrastructure needed to process your application (exchange / registrar / banker), as described in our Privacy Policy.',
        t: 'Is my data safe? Financial details are collected just-in-time (only when you apply) with explicit, itemized consent. PAN, bank and UPI identifiers are stored encrypted, and data is shared only with the market infrastructure needed to process your application (exchange / registrar / banker), as described in our Privacy Policy.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Support & complaints',
    items: [
      {
        q: 'I have a complaint. Where do I go?',
        k: 'complaint grievance support contact scores odr help escalate',
        a: (
          <>Reach us first via the Contact options in the footer. For market-related grievances you can also use{' '}
            <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a> or the{' '}
            <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">ODR portal</a>.</>
        ),
        t: 'I have a complaint. Where do I go? Reach us first via the Contact options in the footer. For market-related grievances you can also use SEBI SCORES or the ODR portal.',
      },
    ],
  },
];

export default function FaqsPage() {
  return (
    <div className="trust-page gl-page">
      <h1>Help &amp; FAQs</h1>
      <p className="lead-p">Quick answers about applying, allotment, GMP and your data. New to the jargon? Start with the <a className="linklike" href="/glossary">IPO Glossary</a>.</p>
      <FaqBrowser groups={GROUPS} />
    </div>
  );
}
