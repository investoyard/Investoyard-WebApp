'use client';
import { useEffect, useState } from 'react';
import { getPosts, type PostView } from '@/lib/api';
import { postDate } from '@/components/PostBody';

/** Homepage news strip — the three latest posts; hidden until something is published. */
export function HomeNews({ posts: baked }: { posts: PostView[] }) {
  const [posts, setPosts] = useState<PostView[]>(baked);
  useEffect(() => { getPosts(3).then((live) => { if (live) setPosts(live); }).catch(() => {}); }, []);
  if (posts.length === 0) return null;

  return (
    <>
      <div className="section-head" style={{ marginTop: 42 }}>
        <h2>News &amp; updates</h2>
        <a className="linklike" href="/news">All news →</a>
      </div>
      <div className="news-grid home">
        {posts.slice(0, 3).map((p) => (
          <a className="news-card" key={p.slug} href={`/news/${p.slug}`}>
            {p.coverUrl
              ? <img className="news-cover" src={p.coverUrl} alt="" />
              : <div className="news-cover ph"><span>Investo<span style={{ color: 'var(--gold)' }}>yard</span></span></div>}
            <div className="news-body">
              {p.ipoSymbol && <span className="news-sym mono">{p.ipoSymbol}</span>}
              <h3 className="news-title">{p.title}</h3>
              <div className="news-meta">{postDate(p.publishedAt)}</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
