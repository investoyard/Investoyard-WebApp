import { ContactView } from '@/components/ContactView';

/**
 * The baked metadata is OURS and generic, because the static export cannot know
 * the host: a partner's domain serves this same HTML and `ContactView` corrects
 * the title on the client once the domain has resolved. Same split as
 * /subscription/v2, and the reason the canonical/og work is its own phase.
 */
export const metadata = {
  title: 'Contact Us | Investoyard',
  description:
    'Reach us about an IPO application, allotment or refund — customer support, our grievance redressal officer, and how to escalate to SEBI SCORES.',
};

export default function ContactPage() {
  return <ContactView />;
}
