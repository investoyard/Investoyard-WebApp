import { Albert_Sans, Source_Serif_4 } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './horizon.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';
import CalendarPage from './CalendarPage';
import LegalPage from './LegalPage';

/*
 * HORIZON — variant 4, rebuilt 2026-11-17 from the operator's reference
 * layouts: a light research desk. Table-first, serif headings (Source Serif 4,
 * used by no other design) over Albert Sans text, a white header with an
 * underlined menu, soft tinted heroes with drawn line art in the partner's
 * colour, and a compact type scale.
 */
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-hz-serif', display: 'swap' });
const body = Albert_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hz-body', display: 'swap' });

const horizon: VariantModule = {
  name: 'horizon',
  fontClassName: `${serif.variable} ${body.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
  CalendarPage,
  LegalPage,
};

export default horizon;
