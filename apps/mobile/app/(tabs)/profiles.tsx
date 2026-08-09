import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ui } from '../../lib/theme';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles, maskPan } from '../../components/profiles';
import { initials } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoginGate } from '../../components/ui/LoginGate';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ShieldIcon, UsersIcon } from '../../components/ui/icons';

export default function ProfilesScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const { profiles, loading, refresh, removeProfile } = useProfiles();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    // context refresh has no promise — clear the spinner shortly after
    setTimeout(() => setRefreshing(false), 700);
  }, [refresh]);

  if (!token) return <LoginGate body="Sign in to add yourself and family members as IPO applicants." />;

  // Translated label when the i18n bundle knows the relation; else Capitalized name.
  const relLabel = (r: string) => {
    const k = `rel.${r}`;
    const v = t(k);
    return v === k ? r.charAt(0).toUpperCase() + r.slice(1) : v;
  };

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('Remove applicant', `Remove ${name}? If they already have applications they will be deactivated instead — history stays intact.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void removeProfile(id); } },
    ]);
  };

  const verifiedN = profiles.filter((p) => p.kycStatus === 'verified').length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
      }
    >
      <Text style={styles.h1}>{t('profiles.title')}</Text>
      <Text style={styles.count}>
        {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · {verifiedN} PAN-verified
      </Text>

      {/* self-PAN privacy note */}
      <View style={styles.note}>
        <ShieldIcon size={16} color={ui.indigo} strokeWidth={1.8} />
        <Text style={styles.noteTxt}>{t('profile.note')}</Text>
      </View>

      {loading && profiles.length === 0 ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={26} color={ui.indigo} />}
          title={t('profiles.empty')}
          cta={<Button label={`+ ${t('profiles.add')}`} onPress={() => router.push('/profiles/new')} />}
        />
      ) : (
        <>
          {profiles.map((p) => {
            const verified = p.kycStatus === 'verified';
            return (
              <Card style={{ marginTop: 12 }} key={p.id}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{initials(p.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {relLabel(p.relationship)} · {maskPan(p.pan)}
                    </Text>
                  </View>
                  {p.relationship !== 'self' ? (
                    <Pressable
                      onPress={() => confirmDelete(p.id, p.fullName)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6, transform: [{ scale: 0.97 }] }]}
                    >
                      <Text style={styles.removeTxt}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.badges}>
                  {verified
                    ? <Badge label="KYC verified" tone="ok" check />
                    : <Badge label="KYC pending" tone="wait" />}
                  <Badge label={`${p.depository} · ${p.dpId ? `${p.dpId}/` : ''}${p.clientId}`} tone="neutral" />
                  {p.upiId ? <Badge label="UPI" tone="ok" check /> : <Badge label={t('profiles.needUpi')} tone="wait" />}
                  {p.hasBank ? <Badge label="Bank" tone="ok" check /> : null}
                </View>
              </Card>
            );
          })}

          <Button
            label={`+ ${t('profiles.add')}`}
            onPress={() => router.push('/profiles/new')}
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: ui.title },
  count: { fontSize: 13, color: ui.muted, fontWeight: '600', marginTop: 3, fontVariant: ['tabular-nums'] },
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
    backgroundColor: ui.indigoTint, borderRadius: 14, padding: 12,
  },
  noteTxt: { flex: 1, fontSize: 12.5, color: ui.indigo, fontWeight: '600', lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: ui.indigoTint,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '800', color: ui.indigo },
  name: { fontSize: 15, fontWeight: '700', color: ui.title },
  meta: { fontSize: 12, color: ui.muted, fontWeight: '600', marginTop: 2 },
  remove: { paddingHorizontal: 10, paddingVertical: 8 },
  removeTxt: { fontSize: 13, fontWeight: '700', color: ui.red },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
});
