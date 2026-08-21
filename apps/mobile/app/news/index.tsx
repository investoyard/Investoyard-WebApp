/**
 * News & Updates — admin-written IPO coverage. The admin Banners carousel sits
 * at the TOP of this screen (sir's decision: Home stays cards-first; banners
 * live with news). Auto-rotates every 5s, swipeable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../../lib/theme';
import { getBanners, getPosts, type BannerView, type PostView } from '../../lib/api';
import { tapLight } from '../../lib/haptics';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';

const W = Dimensions.get('window').width;
const BANNER_W = W - 32;

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Banners({ banners }: { banners: BannerView[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const idx = useRef(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      idx.current = (idx.current + 1) % banners.length;
      scrollRef.current?.scrollTo({ x: idx.current * (BANNER_W + 10), animated: true });
    }, 5000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (banners.length === 0) return null;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled={false}
      snapToInterval={BANNER_W + 10}
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
      style={{ marginBottom: 16 }}
      onMomentumScrollEnd={(e) => { idx.current = Math.round(e.nativeEvent.contentOffset.x / (BANNER_W + 10)); }}
    >
      {banners.map((b) => (
        <Pressable
          key={b.id}
          disabled={!b.linkUrl}
          onPress={() => { tapLight(); if (b.linkUrl) Linking.openURL(b.linkUrl).catch(() => {}); }}
          style={styles.banner}
        >
          {b.imageUrl ? (
            <Image source={{ uri: b.imageUrl }} style={styles.bannerImg} resizeMode="cover" />
          ) : (
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle} numberOfLines={2}>{b.title}</Text>
              {b.subtitle ? <Text style={styles.bannerSub} numberOfLines={2}>{b.subtitle}</Text> : null}
              {b.ctaLabel ? <Text style={styles.bannerCta}>{b.ctaLabel} ›</Text> : null}
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function NewsScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [banners, setBanners] = useState<BannerView[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([getPosts(30), getBanners()]);
    setPosts(p); setBanners(b);
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
    >
      <Banners banners={banners} />
      {posts === null ? (
        <View style={{ paddingHorizontal: 16 }}><SkeletonCard lines={3} /><SkeletonCard lines={3} /></View>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" body="IPO coverage — open alerts, allotment notes, listing recaps — lands here." />
      ) : (
        posts.map((p) => (
          <Card key={p.slug} style={styles.post} onPress={() => router.push(`/news/${p.slug}`)}>
            {p.coverUrl ? <Image source={{ uri: p.coverUrl }} style={styles.cover} resizeMode="cover" /> : null}
            <View style={styles.postBody}>
              <Text style={styles.postMeta} numberOfLines={1}>
                {[p.ipoSymbol, fmtDate(p.publishedAt), p.author].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.postTitle} numberOfLines={2}>{p.title}</Text>
              {p.excerpt ? <Text style={styles.postExcerpt} numberOfLines={2}>{p.excerpt}</Text> : null}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  banner: { width: BANNER_W, height: 130, borderRadius: 18, overflow: 'hidden', backgroundColor: ui.indigo },
  bannerImg: { width: '100%', height: '100%' },
  bannerText: { flex: 1, padding: 16, justifyContent: 'center' },
  bannerTitle: { fontSize: 17, fontFamily: fonts.extrabold, fontWeight: '800', color: '#ffffff', letterSpacing: -0.3 },
  bannerSub: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  bannerCta: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: '#FFCB32', marginTop: 8 },
  post: { marginHorizontal: 16, marginBottom: 12, padding: 0, overflow: 'hidden' },
  cover: { width: '100%', height: 150, backgroundColor: ui.slateTint },
  postBody: { padding: 14 },
  postMeta: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, letterSpacing: 0.2 },
  postTitle: { fontSize: 15.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.2, marginTop: 5, lineHeight: 21 },
  postExcerpt: { fontSize: 13, fontFamily: fonts.regular, color: ui.slate, marginTop: 5, lineHeight: 19 },
});
