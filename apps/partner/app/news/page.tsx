import variant from '@variant';
import { NewsListBody } from '@/core/content';
import { loadPosts } from '@/core/data.server';

export const metadata = { title: 'IPO news' };

export default async function Page() {
  return <variant.InfoPage head={{ eyebrow: 'News', title: 'IPO news', sub: 'Updates on upcoming and recent IPOs.' }}><NewsListBody posts={await loadPosts()} /></variant.InfoPage>;
}
