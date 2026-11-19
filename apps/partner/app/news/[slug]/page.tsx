import type { Metadata } from 'next';
import variant from '@variant';
import { NewsArticleBody } from '@/core/content';
import { loadPost, loadPosts } from '@/core/data.server';

export const dynamicParams = false;

/* A static export needs at least one page here; with no posts yet, one placeholder that says the article is not available. */
export async function generateStaticParams() {
  const slugs = (await loadPosts()).map((p) => p.slug);
  return (slugs.length ? slugs : ['no-article']).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await loadPost(params.slug);
  return { title: p ? p.title : 'IPO news', description: p?.excerpt || undefined };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const p = await loadPost(params.slug);
  return <variant.InfoPage head={{ eyebrow: 'News', title: p ? p.title : 'Article not available', sub: p?.excerpt || 'IPO news' }}><NewsArticleBody post={p} /></variant.InfoPage>;
}
