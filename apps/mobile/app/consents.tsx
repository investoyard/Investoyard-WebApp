import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ConsentView } from '@investoyard/shared-types';
import { ui } from '../lib/theme';
import { useT } from '../components/i18n';
import { useAuth } from '../components/auth';
import { listConsents, withdrawConsent } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoginGate } from '../components/ui/LoginGate';
import { SkeletonCard } from '../components/ui/Skeleton';
import { ShieldIcon } from '../components/ui/icons';
import { fmtDate } from '../lib/format';

/** DPDP data-principal rights: view granted consents + withdraw (prospective). */
export default function ConsentsScreen() {
  const t = useT();
  const { token } = useAuth();
  const [items, setItems] = useState<ConsentView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (token) setItems(await listConsents(token));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  if (!token) return <LoginGate />;

  const onWithdraw = async (type: string) => {
    setBusy(type);
    await withdrawConsent(token, type);
    await load();
    setBusy(null);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
      }
    >
      <Text style={styles.note}>{t('consents.note')}</Text>

      {items === null ? (
        <View style={{ gap: 12, marginTop: 14 }}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldIcon size={26} color={ui.indigo} />}
          title={t('consents.empty')}
        />
      ) : (
        items.map((c) => (
          <Card style={{ marginTop: 12 }} key={c.id}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={2}>{t(`consent.type.${c.type}`)}</Text>
              <Chip label={c.active ? t('consents.active') : t('consents.withdrawn')} tone={c.active ? 'success' : 'neutral'} />
            </View>
            <Text style={styles.muted}>
              {t('consents.granted')}: {fmtDate(c.grantedAt.slice(0, 10))} · v{c.noticeVersion}{c.channel ? ` · ${c.channel}` : ''}
            </Text>
            {c.active ? (
              <Button
                small
                variant="danger"
                label={t('consents.withdraw')}
                busy={busy === c.type}
                onPress={() => onWithdraw(c.type)}
                style={{ alignSelf: 'flex-start', marginTop: 12 }}
              />
            ) : null}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  note: { color: ui.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: ui.title, flex: 1 },
  muted: { color: ui.muted, fontSize: 12.5, fontWeight: '600', marginTop: 7, fontVariant: ['tabular-nums'] },
});
