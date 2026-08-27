import { HomeView } from '@/components/views/HomeView';

/**
 * Home layout under review — the live home at `/` is untouched.
 *
 * noindex on purpose: two near-identical home pages in the index would compete
 * with each other for the same queries. Delete this route once the operator
 * picks a layout.
 */
export const metadata = {
  title: 'Home (layout 2) | Investoyard',
  robots: { index: false, follow: false },
};

export default function HomeTwoPage() {
  return <HomeView lang="en" v2 />;
}
