import { HomeView } from '@/components/views/HomeView';

/**
 * The home page. Runs the layout the operator chose on 2 September 2026 after
 * comparing it against the previous one — the explorer with a sticky rail,
 * 2-up cards and one filter line.
 *
 * The layout it replaced is kept at /homeold for reference, noindex so the two
 * cannot compete for the same queries.
 */
export default function HomePage() {
  return <HomeView lang="en" v2 />;
}
