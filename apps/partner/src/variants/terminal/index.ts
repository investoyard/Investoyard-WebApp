import { Hanken_Grotesk } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './terminal.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';
import CalendarPage from './CalendarPage';
import LegalPage from './LegalPage';
import InfoPage from './InfoPage';

/*
 * TERMINAL — variant 3. A broker's trading platform: dark navy, precise,
 * list-and-detail. One sans (Hanken Grotesk) with tabular figures; the
 * monospace of the first version is gone — it read as a developer tool.
 */
const sans = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-term-sans', display: 'swap' });

const terminal: VariantModule = {
  name: 'terminal',
  fontClassName: sans.variable,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
  CalendarPage,
  LegalPage,
  InfoPage,
  ui: { tableWrap: 't-table-wrap', table: 't-table' },
};

export default terminal;
