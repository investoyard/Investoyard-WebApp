import { IBM_Plex_Mono, Newsreader } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './ledger.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';

/*
 * LEDGER — variant 5. Minimal, monochrome, one column.
 * Newsreader for reading, IBM Plex Mono for every figure.
 */
const serif = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-lg-serif', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-lg-mono', display: 'swap' });

const ledger: VariantModule = {
  name: 'ledger',
  fontClassName: `${serif.variable} ${mono.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
};

export default ledger;
