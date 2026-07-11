import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../../components/i18n';
import { useProfiles, maskPan } from '../../components/profiles';

export default function ProfilesScreen() {
  const t = useT();
  const router = useRouter();
  const { profiles } = useProfiles();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('profiles.title')}</Text>
      <Text style={styles.note}>{t('profile.note')}</Text>

      {profiles.length === 0 ? (
        <Text style={styles.empty}>{t('profiles.empty')}</Text>
      ) : (
        profiles.map((p) => (
          <View style={styles.card} key={p.id}>
            <View style={styles.row}>
              <Text style={styles.name}>{t(`rel.${p.relationship}`)} · {p.fullName}</Text>
              <Text style={[styles.chip, p.upiId ? styles.ok : styles.warn]}>
                {p.upiId ? t('profiles.ready') : t('profiles.needUpi')}
              </Text>
            </View>
            <Text style={styles.muted}>{maskPan(p.pan)} · {p.depository} {p.dpId}/{p.clientId}</Text>
          </View>
        ))
      )}

      <Pressable style={styles.btn} onPress={() => router.push('/profiles/new')}>
        <Text style={styles.btnText}>+ {t('profiles.add')}</Text>
      </Pressable>

      <Pressable style={styles.link} onPress={() => router.push('/notifications')}>
        <Text style={styles.linkText}>{t('notif.link')} →</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.push('/consents')}>
        <Text style={styles.linkText}>{t('consents.link')} →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  empty: { color: colors.textMuted, fontSize: 15, marginTop: 24, textAlign: 'center' },
  card: { backgroundColor: colors.surface, marginTop: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1, paddingRight: 10 },
  muted: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 980, overflow: 'hidden' },
  ok: { color: colors.state.success, backgroundColor: '#eaf5ee' },
  warn: { color: colors.state.warn, backgroundColor: '#fdf3e3' },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
  link: { alignItems: 'center', marginTop: 18, padding: 8 },
  linkText: { color: colors.brand.primary, fontWeight: '600', fontSize: 14 },
});
