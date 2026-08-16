/**
 * Print Forms flow (bank ASBA) — mobile twin of the web /print/<symbol> page:
 * family multi-select (minors & no-UPI welcome — ASBA needs no mandate) →
 * quantity via preset tiles / Custom (by ₹ Cr / by lots) + optional shareholder
 * category → per-member overrides with form badges (Normal ≤₹5L / Syndicate
 * >₹5L / Shareholder) → single itemized consent → one `pdf` application per
 * member → share/download each prefilled form or all merged into one PDF.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { makeBidEngine } from '@investoyard/shared-types';
import { fonts, shadowCard, ui } from '../../lib/theme';
import type { IpoFull } from '../../lib/ipoCalc';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles, type ProfileRecord } from '../../components/profiles';
import { getIpo, createApplication, getConsentNotices, fetchAsbaFormsBase64 } from '../../lib/api';
import { inr } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoginGate } from '../../components/ui/LoginGate';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CheckIcon, FilePdfIcon, PencilIcon, RefreshIcon, UsersIcon, XIcon } from '../../components/ui/icons';
import { SuccessMoment } from '../../components/ui/Celebration';
import { PrintQuantityPicker, printCatLabel, printCategory, printFormBadge, type PrintChoice } from '../../components/BidControls';

export default function PrintScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { profiles } = useProfiles();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoFull | null | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [master, setMaster] = useState<PrintChoice | null>(null);
  const [overrides, setOverrides] = useState<Record<string, PrintChoice>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined);
  const [placed, setPlaced] = useState<{ id: string; name: string; choice: PrintChoice }[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState<string | null>(null);

  useEffect(() => { if (symbol) getIpo(String(symbol)).then((v) => setIpo(v ?? null)); }, [symbol]);
  useEffect(() => { getConsentNotices().then((ns) => setNoticeVersion(ns.find((n) => n.type === 'data_sharing_rail')?.version)); }, []);

  const engine = useMemo(
    () => (ipo ? makeBidEngine({ lotSize: ipo.lotSize, priceBandMax: ipo.priceBandMax ?? ipo.priceBandMin }) : null),
    [ipo],
  );
  useEffect(() => {
    if (engine && !master && engine.presets.minRetail) setMaster({ q: engine.presets.minRetail, sha: false });
  }, [engine, master]);

  if (!token) return <LoginGate />;
  if (!ipo) {
    return (
      <View style={[styles.screen, { padding: 16, gap: 12 }]}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
      </View>
    );
  }

  // Operator "Start Printing" gate.
  const printOpen = (ipo.extra as any)?.startPrint === true;
  if ((ipo.status === 'open' || ipo.status === 'upcoming') && !printOpen) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <EmptyState
          icon={<FilePdfIcon size={26} color={ui.indigo} />}
          title="Form printing hasn't started yet"
          body={`Prefilled ASBA forms for ${ipo.name} will be available shortly — check back soon.`}
          cta={<Button label="View IPO details" variant="ghost" onPress={() => router.push(`/ipo/${ipo.symbol}`)} />}
        />
      </View>
    );
  }
  if (profiles.length === 0) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <EmptyState
          icon={<UsersIcon size={26} color={ui.indigo} />}
          title={`Print Forms · ${ipo.name}`}
          body={t('apply.noApplicant')}
          cta={<Button label={`+ ${t('profiles.add')}`} onPress={() => router.push('/profiles/new')} />}
        />
      </View>
    );
  }

  const isMainboard = ipo.type === 'mainboard';
  const allowShareholder = (ipo.reservations ?? []).includes('shareholder');
  const selected = profiles.filter((p) => selectedIds.includes(p.id));
  const choiceFor = (p: ProfileRecord): PrintChoice | null => overrides[p.id] ?? master;
  const total = selected.reduce((s, p) => s + (choiceFor(p)?.q.amount ?? 0), 0);
  const toggleApplicant = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onPlace = async () => {
    if (!selected.length || !master || placing) return;
    setPlacing(true); setPlaceErr(null);
    try {
      const out: { id: string; name: string; choice: PrintChoice }[] = [];
      for (const p of selected) {
        const c = choiceFor(p)!;
        const retailish = c.sha || c.q.category === 'retail';
        const app = await createApplication(token!, {
          investorProfileId: p.id,
          ipoId: ipo.id,
          category: printCategory(c),
          applicantType: c.sha ? 'shareholder' : 'individual',
          lots: c.q.lots,
          atCutoff: retailish,                                           // cut-off is Retail-only
          ...(retailish ? {} : { bidPrice: ipo.priceBandMax ?? ipo.priceBandMin }),
          applyMethod: 'pdf',
          dataSharingConsent: consent,
          consentNoticeVersion: noticeVersion,
        } as any);
        out.push({ id: String(app.id), name: p.fullName, choice: c });
      }
      setPlaced(out);
    } catch (e: any) {
      setPlaceErr(String(e?.message ?? e));
    } finally {
      setPlacing(false);
    }
  };

  /** Fetch the prefilled PDF(s), save to cache, open the share sheet (print/save). */
  const shareForms = async (ids: string[], label: string) => {
    setFormBusy(label); setPlaceErr(null);
    try {
      const b64 = await fetchAsbaFormsBase64(token!, ids);
      if (!b64) { setPlaceErr('Could not prepare the form — try again.'); return; }
      const file = `${FileSystem.cacheDirectory}${ipo.symbol}_${label.replace(/[^\w]/g, '_')}.pdf`;
      await FileSystem.writeAsStringAsync(file, b64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(file, { mimeType: 'application/pdf', dialogTitle: 'Print / save ASBA form' });
    } catch (e: any) {
      setPlaceErr(String(e?.message ?? e));
    } finally {
      setFormBusy(null);
    }
  };

  /* ── done ── */
  if (placed) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={styles.placedBox}>
            <SuccessMoment
              title={`${placed.length} ${placed.length === 1 ? 'form' : 'forms'} ready to print`}
              body="Print each form, sign it, and submit it at the applicant's bank branch before close."
            />
          </View>
          <Card style={{ marginTop: 14 }}>
            {placed.map((a, i) => {
              const badge = printFormBadge(a.choice, isMainboard);
              return (
                <View key={a.id} style={[styles.doneRow, i > 0 && { borderTopWidth: 1, borderTopColor: ui.divider }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.doneName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.doneSub}>
                      {a.choice.q.lots} {a.choice.q.lots === 1 ? 'lot' : 'lots'} · {inr(a.choice.q.amount)} · {printCatLabel(a.choice)}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeTxt, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  <Pressable
                    disabled={formBusy != null}
                    onPress={() => shareForms([a.id], a.name.split(' ')[0])}
                    style={({ pressed }) => [styles.dlBtn, (pressed || formBusy === a.name.split(' ')[0]) && { opacity: 0.8 }]}
                  >
                    <FilePdfIcon size={16} color={ui.red} strokeWidth={1.9} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
          <Button
            label={formBusy === 'all' ? 'Preparing…' : 'Download all forms (one PDF)'}
            variant="danger"
            disabled={formBusy != null}
            onPress={() => shareForms(placed.map((a) => a.id), 'all')}
            style={{ marginTop: 14 }}
          />
          {placeErr ? <Text style={styles.err}>{placeErr}</Text> : null}
          <Text style={styles.note}>Each application uses that person&apos;s own PAN, demat and bank account — funds are blocked in the applicant&apos;s own account (ASBA).</Text>
        </ScrollView>
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button label={t('apps.title')} variant="ghost" onPress={() => router.push('/applications')} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>{ipo.name}</Text>
        <Text style={styles.note0}>Prefilled bank ASBA forms — print, sign & submit at each applicant&apos;s bank.</Text>

        {/* ── applicants (minors & no-UPI allowed — no mandate needed) ── */}
        <SectionTitle
          label={t('apply.applicant')}
          meta={selected.length ? `${selected.length} selected` : undefined}
          style={{ marginTop: 22 }}
        />
        <Card>
          <View style={styles.applicants}>
            {profiles.map((p) => {
              const on = selectedIds.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggleApplicant(p.id)}
                  style={({ pressed }) => [styles.appChip, on && styles.appChipOn, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
                >
                  {on ? <CheckIcon size={13} color="#ffffff" strokeWidth={2.6} /> : null}
                  <Text style={[styles.appTxt, on && styles.appTxtOn]} numberOfLines={1}>
                    {t(`rel.${p.relationship}`)} · {p.fullName}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => router.push('/profiles/new')}
              style={({ pressed }) => [styles.appChip, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.appTxt}>+ {t('profiles.add')}</Text>
            </Pressable>
          </View>
        </Card>

        {/* ── how much per applicant ── */}
        {selected.length > 0 && engine && master ? (
          <>
            <SectionTitle label="How much per applicant?" style={{ marginTop: 22 }} />
            <Card>
              <Text style={styles.pickerHint}>
                Sets every selected member; fine-tune anyone below. Prices use the band ceiling ({inr(engine.price)}/share).
              </Text>
              <PrintQuantityPicker
                engine={engine} choice={master} allowShareholder={allowShareholder}
                onChange={(c) => { setMaster(c); setOverrides({}); setEditing(null); }}
              />

              {/* per-member overrides + form badges */}
              <View style={{ marginTop: 14 }}>
                {selected.map((p) => {
                  const c = choiceFor(p)!;
                  const overridden = !!overrides[p.id];
                  const badge = printFormBadge(c, isMainboard);
                  return (
                    <View key={p.id}>
                      <View style={styles.memberRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {p.fullName}{overridden ? <Text style={styles.own}>  custom</Text> : null}
                          </Text>
                          <Text style={styles.memberSub}>
                            {c.q.lots} {c.q.lots === 1 ? 'lot' : 'lots'} · {c.q.shares.toLocaleString('en-IN')} sh · {inr(c.q.amount)} · {printCatLabel(c)}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeTxt, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                        <Pressable
                          onPress={() => setEditing(editing === p.id ? null : p.id)}
                          style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                        >
                          {editing === p.id ? <XIcon size={14} color={ui.indigo} strokeWidth={2.2} /> : <PencilIcon size={14} color={ui.indigo} strokeWidth={2} />}
                        </Pressable>
                      </View>
                      {editing === p.id ? (
                        <View style={styles.editBox}>
                          <PrintQuantityPicker
                            engine={engine} compact choice={c} allowShareholder={allowShareholder}
                            onChange={(nc) => setOverrides((o) => ({ ...o, [p.id]: nc }))}
                          />
                          {overridden ? (
                            <Pressable
                              onPress={() => { setOverrides((o) => { const { [p.id]: _, ...rest } = o; return rest; }); setEditing(null); }}
                              style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
                            >
                              <Text style={styles.resetTxt}>Reset to main selection</Text>
                              <RefreshIcon size={12} color="#ffffff" strokeWidth={2.4} />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          </>
        ) : null}

        {/* ── single itemized consent ── */}
        <Pressable
          onPress={() => setConsent((c) => !c)}
          style={({ pressed }) => [styles.consent, pressed && { opacity: 0.9 }]}
        >
          <View style={[styles.check, consent && styles.checkOn]}>
            {consent ? <CheckIcon size={14} color="#ffffff" strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.consentTitle}>I agree to all of the following:</Text>
            <Text style={styles.consentText}>• {t('apply.consent.text')}</Text>
            <Text style={styles.consentText}>• {t('apply.selfPan')}</Text>
          </View>
        </Pressable>

        {placeErr ? <Text style={styles.err}>{placeErr}</Text> : null}
      </ScrollView>

      {/* sticky bottom CTA */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.barK}>TOTAL{selected.length > 1 ? ` · ${selected.length} APPLICANTS` : ''}</Text>
          <Text style={styles.barV}>{inr(total)}</Text>
          {!consent ? <Text style={styles.barHint}>{t('apply.consent.required')}</Text> : null}
        </View>
        <Button
          label={placing ? 'Creating…' : 'Create & print'}
          onPress={onPlace}
          disabled={!consent || !selected.length}
          busy={placing}
          style={{ minWidth: 140 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 21, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.4, color: ui.title },
  note0: { fontFamily: fonts.regular, color: ui.muted, fontSize: 13, marginTop: 5, lineHeight: 18 },
  applicants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, minHeight: 44, borderRadius: 999,
    backgroundColor: ui.canvas, maxWidth: '100%',
  },
  appChipOn: { backgroundColor: ui.indigo },
  appTxt: { color: ui.slate, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', flexShrink: 1 },
  appTxtOn: { color: '#ffffff' },
  pickerHint: { fontSize: 12, fontFamily: fonts.regular, color: ui.muted, lineHeight: 17, marginBottom: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: ui.divider },
  memberName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  own: { fontSize: 10.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  memberSub: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTxt: { fontSize: 10.5, fontFamily: fonts.bold, fontWeight: '700' },
  editBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: ui.indigoTint, alignItems: 'center', justifyContent: 'center' },
  editBox: { backgroundColor: ui.canvas, borderRadius: 14, padding: 12, marginBottom: 10 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: ui.indigo, borderRadius: 10, height: 34, paddingHorizontal: 12, marginTop: 10, alignSelf: 'flex-start',
  },
  resetTxt: { color: '#ffffff', fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
  consent: {
    flexDirection: 'row', gap: 12, marginTop: 22, padding: 16,
    backgroundColor: '#ffffff', borderRadius: 20,
    ...shadowCard,
  },
  check: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: '#D5D9E2',
    alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: ui.canvas,
  },
  checkOn: { backgroundColor: ui.indigo, borderColor: ui.indigo },
  consentTitle: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  consentText: { fontFamily: fonts.regular, fontSize: 12.5, color: ui.muted, marginTop: 4, lineHeight: 18 },
  err: { marginTop: 14, color: ui.red, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', textAlign: 'center' },
  placedBox: { backgroundColor: '#ffffff', borderRadius: 20, padding: 6, ...shadowCard },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  doneName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  doneSub: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  dlBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: ui.redTint, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: 14, fontSize: 12.5, fontFamily: fonts.regular, color: ui.muted, lineHeight: 18, textAlign: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: ui.divider,
    ...shadowCard,
  },
  barK: { fontSize: 10.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.muted, letterSpacing: 0.8 },
  barV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 2, fontVariant: ['tabular-nums'] },
  barHint: { fontFamily: fonts.regular, color: ui.muted, fontSize: 10.5, marginTop: 2 },
});
