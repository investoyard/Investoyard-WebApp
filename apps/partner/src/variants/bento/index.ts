import { Be_Vietnam_Pro, Onest } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './bento.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';
import CalendarPage from './CalendarPage';
import LegalPage from './LegalPage';

/*
 * BENTO — variant 2, rebuilt 2026-11-17 from Sir's reference layouts: a crisp
 * IPO dashboard. Bold sans headings (Be Vietnam Pro) over Onest text — no
 * other design or apps/web uses either — a filled-pill menu, stat tiles,
 * charts (day-wise bars, financials, a demand donut) and soft, filled
 * illustrations in the partner's colour. Kept clearly apart from Horizon,
 * which is serif, line-drawn and table-first.
 */
const head = Be_Vietnam_Pro({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-bn-head', display: 'swap' });
const body = Onest({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-bn-body', display: 'swap' });

const bento: VariantModule = {
  name: 'bento',
  fontClassName: `${head.variable} ${body.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
  CalendarPage,
  LegalPage,
};

export default bento;
