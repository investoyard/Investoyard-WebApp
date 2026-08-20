'use client';
import { useEffect, useState } from 'react';
import { getPosts, type PostView } from '@/lib/api';
import { postDate } from '@/components/PostBody';

/** News index — card grid of published posts; refreshes client-side like the catalog. */
export function NewsList({ posts: baked }: { posts: PostView[] }) {
  const [posts, setPosts] = useState<PostView[]>(baked);
  useEffect(() => { getPosts(24).then((live) => { if (live?.length) setPosts(live); }).catch(() => {}); }, []);

  return (
    <div className="trust-page" style={{ maxWidth: 'none' }}>
      <h1>News &amp; Updates</h1>
      <p className="lead-p">Short, factual coverage — subscription moves, allotment alerts and listing recaps.</p>

      {posts.length === 0 ? (
        <div className="panel" style={{ padding: 26, textAlign: 'center', marginTop: 20 }}>
          <p className="muted">Nothing published yet — coverage lands here as issues move.</p>
        </div>
      ) : (
        <div className="news-grid">
          {posts.map((p) => (
            <a className="news-card" key={p.slug} href={`/news/${p.slug}`}>
              {p.coverUrl
                ? <img className="news-cover" src={p.coverUrl} alt="" />
                : <div className="news-cover ph"><span>Investo<span style={{ color: 'var(--gold)' }}>yard</span></span></div>}
              <div className="news-body">
                {p.ipoSymbol && <span className="news-sym mono">{p.ipoSymbol}</span>}
                <h3 className="news-title">{p.title}</h3>
                {p.excerpt && <p className="news-ex">{p.excerpt}</p>}
                <div className="news-meta">{postDate(p.publishedAt)}{p.author ? ` · ${p.author}` : ''}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
