import { HomeView } from '@/components/views/HomeView';

/**
 * The previous home layout, kept for reference after the operator chose the
 * explorer layout for `/` on 2 September 2026.
 *
 * noindex on purpose: two near-identical home pages in the index compete with
 * each other for the same queries. Delete this route once nobody needs to look
 * back at it — and delete the `v2` flags on IpoCard, IpoCompareTable and
 * HomeView at the same time, since this route is their last caller.
 */
export const metadata = {
  title: 'Home (previous layout) | Investoyard',
  robots: { index: false, follow: false },
};

export default function HomeOldPage() {
  return <HomeView lang="en" />;
}
