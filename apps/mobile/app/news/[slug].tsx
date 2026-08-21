/** News article reader — native rendering of the admin's rich-text body. */
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, ui } from '../../lib/theme';
import { getPost, type PostView } from '../../lib/api';
import { HtmlBody } from '../../components/HtmlBody';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/ui/Skeleton';

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function NewsPostScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [post, setPost] = useState<PostView | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (slug) setPost(await getPost(String(slug)));
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (post === undefined) {
    return (
      <View style={[styles.screen, { padding: 16, gap: 12 }]}>
        <Skeleton w="90%" h={22} />
        <Skeleton w="55%" h={12} />
        <SkeletonCard lines={4} />
      </View>
    );
  }
  if (post === null) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <EmptyState title="Post not found" body="It may have been unpublished." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {post.coverUrl ? <Image source={{ uri: post.coverUrl }} style={styles.cover} resizeMode="cover" /> : null}
      <View style={{ padding: 16 }}>
        <Text style={styles.meta}>
          {[post.ipoSymbol, fmtDate(post.publishedAt), post.author].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.title}>{post.title}</Text>
        {post.ipoSymbol ? (
          <Pressable onPress={() => router.push(`/ipo/${post.ipoSymbol}`)} style={({ pressed }) => [styles.ipoLink, pressed && { opacity: 0.7 }]}>
            <Text style={styles.ipoLinkTxt}>View {post.ipoSymbol} IPO ›</Text>
          </Pressable>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <HtmlBody html={post.body ?? ''} />
        </View>
        {post.tags.length > 0 ? (
          <View style={styles.tags}>
            {post.tags.map((t) => <Text key={t} style={styles.tag}>#{t}</Text>)}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  cover: { width: '100%', height: 200, backgroundColor: ui.slateTint },
  meta: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, letterSpacing: 0.2 },
  title: { fontSize: 21, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.4, lineHeight: 28, marginTop: 6 },
  ipoLink: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: ui.indigoTint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ipoLinkTxt: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  tag: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
});
