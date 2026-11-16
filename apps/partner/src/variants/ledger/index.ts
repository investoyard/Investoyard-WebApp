import { Newsreader, Public_Sans } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './ledger.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';

/*
 * LEDGER — variant 5. A research desk's report: a side navigation, a dated
 * IPO calendar, Newsreader for headings over Public Sans for everything else.
 */
const serif = Newsreader({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-lg-serif', display: 'swap' });
const sans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-lg-sans', display: 'swap' });

const ledger: VariantModule = {
  name: 'ledger',
  fontClassName: `${serif.variable} ${sans.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
};

export default ledger;
