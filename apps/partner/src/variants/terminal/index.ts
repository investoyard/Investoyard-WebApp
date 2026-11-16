import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import type { VariantModule } from '@/core/variant';
import './terminal.css';
import Shell from './Shell';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SubscriptionPage from './SubscriptionPage';
import AllotmentPage from './AllotmentPage';
import ArchivePage from './ArchivePage';

/*
 * TERMINAL — variant 3. Dark, dense, trading-first.
 * Hanken Grotesk for text, JetBrains Mono for every figure.
 */
const sans = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-term-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-term-mono', display: 'swap' });

const terminal: VariantModule = {
  name: 'terminal',
  fontClassName: `${sans.variable} ${mono.variable}`,
  Shell,
  HomePage,
  DetailPage,
  SubscriptionPage,
  AllotmentPage,
  ArchivePage,
};

export default terminal;
