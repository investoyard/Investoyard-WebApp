import { Instrument_Sans } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './sterling.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';
import CalendarPage from './CalendarPage';
import LegalPage from './LegalPage';

/*
 * STERLING — variant 1. Quiet, institutional, precise.
 * Instrument Sans throughout (apps/web uses Inter and Plus Jakarta Sans).
 */
const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sterling', display: 'swap' });

const sterling: VariantModule = {
  name: 'sterling',
  fontClassName: sans.variable,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
  CalendarPage,
  LegalPage,
};

export default sterling;
