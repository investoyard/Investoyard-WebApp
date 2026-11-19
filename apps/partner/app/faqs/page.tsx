import variant from '@variant';
import { FaqBody } from '@/core/content';

export const metadata = { title: 'IPO FAQs', description: 'Answers to common questions about IPOs: categories, applying through ASBA and UPI, allotment, refunds and listing.' };

export default function Page() {
  return <variant.InfoPage head={{ eyebrow: 'Help', title: 'Frequently asked questions', sub: 'How IPOs work — applying, allotment, refunds and listing — in plain words.' }}><FaqBody /></variant.InfoPage>;
}
