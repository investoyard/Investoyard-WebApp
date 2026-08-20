'use client';
import { useEffect, useState } from 'react';
import { getPost, type PostView as Post } from '@/lib/api';
import { PostView } from '@/components/views/PostView';

/**
 * Client-side post fallback. IIS rewrites /news/<SLUG>/ here when no pre-built
 * static page exists (posts published after the last web build).
 */
export default function PostLiveFallback() {
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<'loading' | 'notfound' | 'ok'>('loading');

  useEffect(() => {
    const m = window.location.pathname.match(/\/news\/([^/]+)/i);
    const slug = m ? decodeURIComponent(m[1]) : '';
    if (!slug || slug.toLowerCase() === 'live') { setState('notfound'); return; }
    getPost(slug)
      .then((p) => { if (p) { setPost(p); setState('ok'); } else setState('notfound'); })
      .catch(() => setState('notfound'));
  }, []);

  if (state === 'loading') return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>Loading…</p>;
  if (state === 'notfound' || !post) return <p className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>Post not found. <a className="linklike" href="/news">← All news</a></p>;
  return <PostView post={post} />;
}
