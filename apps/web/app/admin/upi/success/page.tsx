'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="UPI Mandates — Success" icon="rupee" sub="Approved mandates with blocked funds."
    points={['Approved mandates with funds blocked', 'Applicant, amount and bank / UPI id', 'Ready for allotment settlement']} />;
}
