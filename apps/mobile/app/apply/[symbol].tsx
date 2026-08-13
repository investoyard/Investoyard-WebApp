import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import type { IpoFull } from '../../lib/ipoCalc';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { getIpo, createApplication, createBulkApplication, getConsentNotices } from '../../lib/api';
import { inr } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoginGate } from '../../components/ui/LoginGate';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CheckIcon, UsersIcon } from '../../components/ui/icons';
import { SuccessMoment } from '../../components/ui/Celebration';

type ApplicantType = 'individual' | 'shareholder' | 'employee';

export default function ApplyScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { profiles } = useProfiles();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoFull | null | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lots, setLots] = useState(1);
  const [method, setMethod] = useState<'upi' | 'pdf'>('upi');
  const [consent, setConsent] = useState(false);
  const [applicantType, setApplicantType] = useState<ApplicantType>('individual');
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined);
  const [placed, setPlaced] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => { if (symbol) getIpo(String(symbol)).then((v) => setIpo(v ?? null)); }, [symbol]);
  useEffect(() => { getConsentNotices().then((ns) => setNoticeVersion(ns.find((n) => n.type === 'data_sharing_rail')?.version)); }, []);

  if (!token) return <LoginGate />;
  if (!ipo) {
    return (
      <View style={[styles.screen, { padding: 16, gap: 12 }]}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
      </View>
    );
  }

  // Operator "Start Bid" gate — no applications until it's switched on.
  const bidOpen = (ipo.extra as any)?.startBid === true;
  const printOpen = (ipo.extra as any)?.startPrint === true;
  if ((ipo.status === 'open' || ipo.status === 'upcoming') && !bidOpen) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <EmptyState
          icon={<UsersIcon size={26} color={ui.indigo} />}
          title="Bidding hasn't started yet"
          body={`Applications for ${ipo.name} will open shortly — check back soon.`}
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
          title={`${t('apply.title')} · ${ipo.name}`}
          body={t('apply.noApplicant')}
          cta={<Button label={`+ ${t('profiles.add')}`} onPress={() => router.push('/profiles/new')} />}
        />
      </View>
    );
  }

  // Multi-select: tap to add/remove family members; the batch goes as ONE bulk call.
  const chosen = selectedIds.length ? profiles.filter((p) => selectedIds.includes(p.id)) : [profiles[0]];
  const toggleApplicant = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const lot = ipo.lotSize ?? 0;
  const unit = ipo.priceBandMax ?? 0;
  const shares = lots * lot;
  const amount = shares * unit * chosen.length; // same lots per member (v1)

  const onPlace = async () => {
    setPlacing(true);
    try {
      if (chosen.length > 1 && method === 'upi') {
        // Family batch → ONE rail addbulk call; each member bids with their own PAN/UPI.
        await createBulkApplication(token!, {
          ipoId: ipo.id, category: 'IND', applyMethod: 'native',
          applicants: chosen.map((p) => ({ investorProfileId: p.id, lots, atCutoff: true, applicantType })),
          dataSharingConsent: consent, consentNoticeVersion: noticeVersion,
        });
      } else {
        await createApplication(token!, {
          investorProfileId: chosen[0].id, ipoId: ipo.id, category: 'IND',
          applicantType,
          lots, atCutoff: true, applyMethod: method === 'upi' ? 'native' : 'pdf',
          dataSharingConsent: consent, consentNoticeVersion: noticeVersion,
        });
      }
      setPlaced(true);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>{ipo.name}</Text>
        <Text style={styles.note}>{t('apply.selfPan')}</Text>

        {/* applicants */}
        <SectionTitle
          label={t('apply.applicant')}
          meta={chosen.length > 1 ? `${chosen.length} selected` : undefined}
          style={{ marginTop: 22 }}
        />
        <Card>
          <View style={styles.applicants}>
            {profiles.map((p) => {
              const on = chosen.some((c) => c.id === p.id);
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

        {/* reserved applicant category (when the issue offers quotas) */}
        {ipo.reservations && ipo.reservations.length > 0 ? (
          <>
            <SectionTitle label={t('apply.category')} style={{ marginTop: 22 }} />
            <Card>
              <View style={styles.row}>
                {(['individual', ...ipo.reservations] as ApplicantType[]).map((c) => (
                  <Choice key={c} active={applicantType === c} label={t(`applicant.${c}`)} onPress={() => setApplicantType(c)} />
                ))}
              </View>
            </Card>
          </>
        ) : null}

        {/* bid */}
        <SectionTitle label={t('apply.lots')} style={{ marginTop: 22 }} />
        <Card>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setLots((n) => Math.max(1, n - 1))}
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
            >
              <Text style={styles.stepTxt}>−</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.lotVal}>{lots} {lots === 1 ? 'lot' : 'lots'}</Text>
              <Text style={styles.lotSub}>{shares.toLocaleString('en-IN')} {t('apply.shares')}{chosen.length > 1 ? ` × ${chosen.length}` : ''}</Text>
            </View>
            <Pressable
              onPress={() => setLots((n) => n + 1)}
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
            >
              <Text style={styles.stepTxt}>+</Text>
            </Pressable>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvK}>{t('apply.amount')}</Text>
            <Text style={styles.kvV}>{inr(amount)}</Text>
          </View>
        </Card>

        {/* method */}
        <SectionTitle label={t('apply.method')} style={{ marginTop: 22 }} />
        <Card>
          <View style={styles.row}>
            <Choice active={method === 'upi'} label={t('apply.method.upi')} onPress={() => setMethod('upi')} />
            {/* ASBA form printing appears only when the operator's Start Printing gate is ON */}
            {printOpen ? (
              <Choice active={method === 'pdf'} label={t('apply.method.pdf')} onPress={() => setMethod('pdf')} />
            ) : null}
          </View>
        </Card>

        {/* DPDP data-sharing consent */}
        <Pressable
          onPress={() => setConsent((c) => !c)}
          style={({ pressed }) => [styles.consent, pressed && { opacity: 0.9 }]}
        >
          <View style={[styles.check, consent && styles.checkOn]}>
            {consent ? <CheckIcon size={14} color="#ffffff" strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.consentTitle}>{t('apply.consent.title')}</Text>
            <Text style={styles.consentText}>{t('apply.consent.text')}</Text>
          </View>
        </Pressable>

        {placed ? (
          <View style={styles.placedBox}>
            <SuccessMoment
              title="Application placed"
              body={t('apply.placed')}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* sticky bottom CTA */}
      {!placed ? (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.barK}>AMOUNT TO BLOCK</Text>
            <Text style={styles.barV}>{inr(amount)}</Text>
            {!consent ? <Text style={styles.barHint}>{t('apply.consent.required')}</Text> : null}
          </View>
          <Button label={t('apply.cta')} onPress={onPlace} disabled={!consent} busy={placing} style={{ minWidth: 140 }} />
        </View>
      ) : (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button label={t('apps.title')} variant="ghost" onPress={() => router.push('/applications')} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, active && styles.choiceOn, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
    >
      <Text style={[styles.choiceTxt, active && styles.choiceTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 21, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.4, color: ui.title },
  note: { fontFamily: fonts.regular, color: ui.muted, fontSize: 13, marginTop: 5, lineHeight: 18 },
  applicants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, minHeight: 44, borderRadius: 999,
    backgroundColor: ui.canvas, maxWidth: '100%',
  },
  appChipOn: { backgroundColor: ui.indigo },
  appTxt: { color: ui.slate, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', flexShrink: 1 },
  appTxtOn: { color: '#ffffff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  stepPressed: { backgroundColor: ui.indigoTint, transform: [{ scale: 0.95 }] },
  stepTxt: { fontSize: 24, color: ui.indigo, fontFamily: fonts.semibold, fontWeight: '600', lineHeight: 28 },
  lotVal: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  lotSub: { fontSize: 12.5, color: ui.muted, fontFamily: fonts.semibold, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: ui.divider,
  },
  kvK: { color: ui.muted, fontSize: 14, fontFamily: fonts.semibold, fontWeight: '600' },
  kvV: { color: ui.title, fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: {
    flexGrow: 1, flexBasis: '40%', minHeight: 48, paddingHorizontal: 10, paddingVertical: 10,
    borderRadius: 14, backgroundColor: ui.canvas, alignItems: 'center', justifyContent: 'center',
  },
  choiceOn: { backgroundColor: ui.indigo },
  choiceTxt: { color: ui.slate, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', textAlign: 'center' },
  choiceTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
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
  consentText: { fontFamily: fonts.regular, fontSize: 12.5, color: ui.muted, marginTop: 3, lineHeight: 18 },
  placedBox: {
    marginTop: 20, backgroundColor: '#ffffff', borderRadius: 20, padding: 6, ...shadowCard,
  },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: ui.divider,
    ...shadowCard,
  },
  barK: { ...microLabel, fontSize: 10.5 },
  barV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 2, fontVariant: ['tabular-nums'] },
  barHint: { fontFamily: fonts.regular, color: ui.muted, fontSize: 10.5, marginTop: 2 },
});
