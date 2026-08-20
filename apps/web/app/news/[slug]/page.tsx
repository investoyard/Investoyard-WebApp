import type { Metadata } from 'next';
import { getPost, postSlugs } from '@/lib/api';
import { PostView } from '@/components/views/PostView';

// One static page per published post at build; posts published later are
// served by the /news/live client fallback (IIS rewrite), like IPO pages.
export async function generateStaticParams() {
  const slugs = await postSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  return {
    title: post ? `${post.title} | Investoyard` : 'News | Investoyard',
    description: post?.excerpt ?? undefined,
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) {
    return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>Post not found. <a className="linklike" href="/news">← All news</a></p>;
  }
  return <PostView post={post} />;
}
