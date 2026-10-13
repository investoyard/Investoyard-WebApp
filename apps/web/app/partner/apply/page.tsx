import { PartnerApply } from '@/components/PartnerApply';

export const metadata = {
  title: 'Become a Partner | Investoyard',
  description:
    'Apply to distribute Mainboard and SME IPOs with Investoyard — partner, white-label or branch. Short application, reviewed by our team.',
};

export default function PartnerApplyPage() {
  return (
    <div className="container fade-up" style={{ paddingTop: 8 }}>
      <h1 style={{ marginBottom: 6 }}>Become a Partner</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: '62ch', fontSize: 15.5 }}>
        Distribute every Mainboard and SME IPO on our rails — UPI and bank ASBA, family applications, print forms and
        allotment tracking. Tell us about your business and our team will get back to you.
      </p>
      <PartnerApply />
    </div>
  );
}
