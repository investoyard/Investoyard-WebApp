'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="UPI Mandates — Pending" icon="rupee" sub="Pending UPI mandate approvals awaiting the applicant."
    points={['Pending mandate approvals', 'Applicant, amount and expiry window', 'Reminder nudges']} />;
}
