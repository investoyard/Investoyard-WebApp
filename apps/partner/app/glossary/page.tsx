import variant from '@variant';
import { GlossaryBody } from '@/core/content';

export const metadata = { title: 'IPO glossary', description: 'Plain definitions of the terms used in IPOs: price band, lot size, ASBA, anchor investors, basis of allotment and more.' };

export default function Page() {
  return <variant.InfoPage head={{ eyebrow: 'Help', title: 'IPO glossary', sub: 'The words used in IPO documents and on this site, defined plainly.' }}><GlossaryBody /></variant.InfoPage>;
}
