import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata = {
  title: 'Partner with Investoyard | IPO distribution for brokers and advisors',
  description:
    'Distribute Mainboard and SME IPOs to your clients on Investoyard rails — UPI and bank ASBA, family applications, print forms, allotment tracking and a white-label option.',
};

const WHAT = [
  { icon: 'bolt', t: 'Every IPO, one rail', d: 'Mainboard and SME, from the day the RHP lands to listing day — the same exchange rails our own desk uses.' },
  { icon: 'users', t: 'Family applications', d: 'Apply for a client and their family in one pass, with per-member overrides and a single consent.' },
  { icon: 'file-pdf', t: 'Print forms', d: 'Fillable ASBA forms in your own PDF series for clients who still sign on paper.' },
  { icon: 'check', t: 'Allotment tracking', d: 'Registrar files matched to your applications automatically — status and rejection reason, per client.' },
  { icon: 'layers', t: 'White-label', d: 'Your brand, your domain, your team logins. Clients never see ours.' },
  { icon: 'key', t: 'Partner API', d: 'Already have a front end? Post final application data to our print API and keep your own flow.' },
] as const;

const STEPS = [
  { n: 1, t: 'Apply', d: 'A short form — your business, contact and any registrations you hold. Two minutes.' },
  { n: 2, t: 'We review', d: 'Our team checks the details and comes back to you by email, usually within a couple of working days.' },
  { n: 3, t: 'Set your password', d: 'On approval you get a one-time link to choose a password and sign in.' },
  { n: 4, t: 'Go live', d: 'We complete empanelment paperwork with you, then your clients can start applying.' },
];

export default function PartnerLandingPage() {
  return (
    <div className="container fade-up" style={{ paddingTop: 8 }}>
      <section className="pk-hero">
        <div>
          <span className="ic-status upcoming">Partner Programme</span>
          <h1 style={{ margin: '12px 0 8px', maxWidth: '18ch' }}>Bring IPOs to your clients, without building any of it.</h1>
          <p className="muted" style={{ marginTop: 0, maxWidth: '58ch', fontSize: 15.5 }}>
            Investoyard runs the IPO stack — exchange rails, bidding, print forms, allotment and reporting. You bring
            the relationships. Apply as a partner, take a white-label of the whole platform, or plug in over our API.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 18 }}>
            <Link className="btn" href="/partner/apply">Apply to partner <Icon name="arrow-right" size={15} /></Link>
            <a className="btn btn-ghost" href="/faqs">Read the FAQs</a>
          </div>
        </div>
      </section>

      <div className="section-title">What you get</div>
      <div className="pk-grid">
        {WHAT.map((x) => (
          <div key={x.t} className="pk-card">
            <span className="pk-ic"><Icon name={x.icon} size={17} /></span>
            <b>{x.t}</b>
            <p className="muted">{x.d}</p>
          </div>
        ))}
      </div>

      <div className="section-title">How it works</div>
      <ol className="pk-steps">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="pk-n">{s.n}</span>
            <div><b>{s.t}</b><p className="muted">{s.d}</p></div>
          </li>
        ))}
      </ol>

      <div className="panel" style={{ padding: 24, marginTop: 26, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px' }}>
          <b style={{ fontSize: 16 }}>Ready when you are.</b>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Applying costs nothing and commits you to nothing. We will tell you honestly whether the fit works.
          </p>
        </div>
        <Link className="btn" href="/partner/apply">Start your application <Icon name="arrow-right" size={15} /></Link>
      </div>

      <p className="hint" style={{ marginTop: 20, maxWidth: '70ch' }}>
        Investoyard is operated by Safal Capital Services Private Limited. We distribute public issues and share
        information about them; we do not give investment advice or recommend any issue. Partner terms, including any
        commercial arrangement, are agreed in writing after approval.
      </p>
    </div>
  );
}
