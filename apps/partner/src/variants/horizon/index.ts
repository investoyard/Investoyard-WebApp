import { Albert_Sans, Schibsted_Grotesk } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './horizon.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';
import CalendarPage from './CalendarPage';

/*
 * HORIZON — variant 4. Brand-led, big type, editorial rhythm.
 * Schibsted Grotesk for display, Albert Sans for text.
 */
const display = Schibsted_Grotesk({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-hz-display', display: 'swap' });
const body = Albert_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-hz-body', display: 'swap' });

const horizon: VariantModule = {
  name: 'horizon',
  fontClassName: `${display.variable} ${body.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
  CalendarPage,
};

export default horizon;
