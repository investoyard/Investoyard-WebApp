'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="UPI Mandates — Failed" icon="rupee" sub="Declined or errored mandates."
    points={['Declined / errored mandates with reason', 'Retry or switch bank / UPI id', 'Applicant follow-up']} />;
}
