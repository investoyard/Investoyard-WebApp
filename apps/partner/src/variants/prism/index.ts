import { Figtree, Outfit } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './prism.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';

/*
 * PRISM — variant 5 (was Ledger). A bright IPO dashboard built from the
 * operator's own layouts. Outfit for headings, Figtree for everything else.
 */
const display = Outfit({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-pr-display', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-pr-body', display: 'swap' });

const prism: VariantModule = {
  name: 'prism',
  fontClassName: `${display.variable} ${body.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
};

export default prism;
