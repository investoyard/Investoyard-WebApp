import variant from '@variant';
import { ContactBody } from '@/core/content-client';

export const metadata = { title: 'Contact us' };

export default function Page() {
  return <variant.InfoPage head={{ eyebrow: 'Help', title: 'Contact us', sub: 'Support, the grievance officer, and where to escalate a complaint.' }}><ContactBody /></variant.InfoPage>;
}
