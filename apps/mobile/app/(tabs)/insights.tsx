/**
 * Insights tab — the discovery hub (keeps Home cards-first):
 *   1. Allotment checker — registrar-truth PAN lookup for ANY applicant
 *   2. Explore tiles → GMP · Subscription · Performance · News · Glossary · Calendar
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, animateNext, microLabel, ui } from '../../lib/theme';
import { type IpoFull } from '../../lib/ipoCalc';
import { checkAllotment, getIpos, type AllotmentCheck } from '../../lib/api';
import { tapLight, tapSelect } from '../../lib/haptics';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { SectionTitle } from '../../components/ui/SectionTitle';
import {
  BarsIcon, BookIcon, CalendarIcon, NewsIcon, SearchIcon, TrendUpIcon, type IconProps,
} from '../../components/ui/icons';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const localDay = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function InsightsScreen() {
  const router = useRouter();
  const [ipos, setIpos] = useState<IpoFull[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // allotment checker state
  const [ipoId, setIpoId] = useState<string | null>(null);
  const [pan, setPan] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AllotmentCheck | null>(null);

  const load = useCallback(async () => { setIpos(await getIpos()); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // IPOs worth checking: allotment date set and not in the far future, newest first
  const today = localDay();
  const checkable = ipos
    .filter((i) => (i as any).id && i.allotmentDate && (i.status === 'closed' || i.status === 'listed' || i.allotmentDate <= today))
    .sort((a, b) => (b.allotmentDate ?? '').localeCompare(a.allotmentDate ?? ''))
    .slice(0, 10);
  const selected = checkable.find((i) => (i as any).id === ipoId) ?? checkable[0] ?? null;

  const check = async () => {
    const id = selected ? String((selected as any).id) : null;
    if (!id) return;
    if (!PAN_RE.test(pan)) { setErr('Enter the full 10-character PAN, e.g. ABCDE1234F.'); return; }
    tapSelect();
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await checkAllotment(id, pan);
      animateNext();
      setResult(r);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Allotment checker ── */}
      <SectionTitle label="Check allotment" meta="any PAN · registrar data" />
      <Card>
        {checkable.length === 0 ? (
          <Text style={styles.mutedTxt}>No IPO is in its allotment window right now — check back after the next issue closes.</Text>
        ) : (
          <>
            <Text style={styles.inK}>IPO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
              {checkable.map((i) => {
                const on = (selected as any)?.id === (i as any).id;
                return (
                  <Pressable
                    key={(i as any).id}
                    onPress={() => { tapLight(); setIpoId(String((i as any).id)); setResult(null); setErr(null); }}
                    style={[styles.ipoChip, on && styles.ipoChipOn]}
                  >
                    <Text style={[styles.ipoChipTxt, on && styles.ipoChipTxtOn]}>{i.symbol}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[styles.inK, { marginTop: 10 }]}>PAN</Text>
            <TextInput
              style={styles.panInput}
              value={pan}
              onChangeText={(v) => { setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)); setErr(null); }}
              placeholder="ABCDE1234F"
              placeholderTextColor={ui.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              onSubmitEditing={check}
            />
            {err ? <Text style={styles.errTxt}>{err}</Text> : null}
            <Button
              label={busy ? 'Checking…' : `Check ${selected?.symbol ?? ''} allotment`}
              onPress={check}
              disabled={busy || pan.length !== 10}
              style={{ marginTop: 12 }}
            />

            {result ? (
              <View style={styles.resWrap}>
                {!result.found ? (
                  <Text style={styles.mutedTxt}>
                    No application found for this PAN in {result.ipo.symbol}
                    {!result.allotmentOut ? ' yet — registrar data arrives on allotment day.' : '.'}
                  </Text>
                ) : (
                  result.results.map((r, i) => (
                    <View key={i} style={[styles.resRow, i > 0 && { borderTopWidth: 1, borderTopColor: ui.divider }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resName} numberOfLines={1}>{r.applicant}</Text>
                        <Text style={styles.resMeta}>
                          {r.category}{r.applicantType !== 'individual' ? ` · ${r.applicantType}` : ''} · {r.lots} lot{r.lots === 1 ? '' : 's'} applied
                        </Text>
                      </View>
                      {r.status === 'allotted' ? (
                        <Chip label={`Allotted${r.allottedShares ? ` · ${r.allottedShares} sh` : ''}`} tone="gold" />
                      ) : r.status === 'not_allotted' ? (
                        <Chip label="Not allotted" tone="neutral" />
                      ) : (
                        <Chip label={r.status === 'processing' ? 'Processing' : 'Awaiting basis'} tone="warn" />
                      )}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
        )}
      </Card>

      {/* ── Explore ── */}
      <SectionTitle label="Explore" style={{ marginTop: 22 }} />
      <View style={styles.grid}>
        <Tile label="GMP Trends" sub="grey market · daily" Icon={TrendUpIcon} onPress={() => router.push('/gmp')} />
        <Tile label="Subscription" sub="live demand" Icon={BarsIcon} onPress={() => router.push('/subscription')} />
        <Tile label="Performance" sub="listing gains" Icon={SearchIcon} onPress={() => router.push('/performance')} />
        <Tile label="News & Updates" sub="IPO coverage" Icon={NewsIcon} onPress={() => router.push('/news')} />
        <Tile label="IPO Glossary" sub="every term, simply" Icon={BookIcon} onPress={() => router.push('/glossary')} />
        <Tile label="IPO Calendar" sub="all key dates" Icon={CalendarIcon} onPress={() => router.push('/calendar')} />
      </View>

      <Text style={styles.foot}>GMP is unofficial and unregulated — shown as information, never investment advice.</Text>
    </ScrollView>
  );
}

function Tile({ label, sub, Icon, onPress }: {
  label: string; sub: string; Icon: (p: IconProps) => React.ReactElement; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.tileIcon}><Icon size={19} color={ui.indigo} strokeWidth={1.8} /></View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  inK: { ...microLabel, fontSize: 10.5 },
  ipoChip: { paddingHorizontal: 13, height: 32, borderRadius: 999, justifyContent: 'center', backgroundColor: ui.canvas },
  ipoChipOn: { backgroundColor: ui.indigo },
  ipoChipTxt: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  ipoChipTxtOn: { color: '#ffffff' },
  panInput: {
    marginTop: 6, borderWidth: 1, borderColor: ui.divider, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, letterSpacing: 2,
    fontFamily: fonts.bold, fontWeight: '700', color: ui.title, backgroundColor: ui.canvas,
  },
  errTxt: { marginTop: 8, fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.red },
  mutedTxt: { fontSize: 13.5, fontFamily: fonts.regular, color: ui.muted, lineHeight: 20 },
  resWrap: { marginTop: 14, borderTopWidth: 1, borderTopColor: ui.divider, paddingTop: 4 },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  resName: { fontSize: 14.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  resMeta: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%', flexGrow: 1, backgroundColor: ui.card, borderRadius: 18, padding: 14,
  },
  tileIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: ui.indigoTint,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  tileLabel: { fontSize: 14, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.2 },
  tileSub: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2 },
  foot: { marginTop: 16, fontSize: 10.5, fontFamily: fonts.regular, color: ui.muted, textAlign: 'center' },
});
