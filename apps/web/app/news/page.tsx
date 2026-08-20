import { getPosts } from '@/lib/api';
import { NewsList } from '@/components/NewsList';

export const metadata = {
  title: 'IPO News & Updates | Investoyard',
  description: 'Short, factual IPO coverage — subscription updates, allotment-out alerts, listing recaps and market notes for Mainboard & SME issues.',
};

export default async function NewsPage() {
  const posts = await getPosts(24);
  return <NewsList posts={posts} />;
}
