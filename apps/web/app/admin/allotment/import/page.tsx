'use client';
import { ComingSoon } from '@/components/admin/ComingSoon';
export default function Page() {
  return <ComingSoon title="Import Allotment" icon="receipt" sub="Upload the registrar allotment file; matched by PAN across channels."
    points={['Upload registrar allotment file', 'Match by PAN across every channel', 'Automatic refunds + applicant notifications']} />;
}
