import { Bricolage_Grotesque, Onest } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './bento.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';

/*
 * BENTO — variant 2. Friendly, app-like, tile-built.
 * Bricolage Grotesque for display, Onest for text: neither is used by Sterling,
 * apps/web, or any earlier partner theme.
 */
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-bento-display', display: 'swap' });
const body = Onest({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-bento-body', display: 'swap' });

const bento: VariantModule = {
  name: 'bento',
  fontClassName: `${display.variable} ${body.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
};

export default bento;
