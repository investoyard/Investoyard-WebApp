import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { IpoDetail } from '@investoyard/shared-types';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles } from '../../components/profiles';
import { getIpo, createApplication, getConsentNotices } from '../../lib/api';

type ApplicantType = 'individual' | 'shareholder' | 'employee';

export default function ApplyScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const { profiles } = useProfiles();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoDetail | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lots, setLots] = useState(1);
  const [method, setMethod] = useState<'upi' | 'pdf'>('upi');
  const [consent, setConsent] = useState(false);
  const [applicantType, setApplicantType] = useState<ApplicantType>('individual');
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined);
  const [placed, setPlaced] = useState(false);

  useEffect(() => { if (symbol) getIpo(String(symbol)).then((v) => setIpo(v ?? null)); }, [symbol]);
  useEffect(() => { getConsentNotices().then((ns) => setNoticeVersion(ns.find((n) => n.type === 'data_sharing_rail')?.version)); }, []);

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>{t('apply.loginRequired')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/login')}>
          <Text style={styles.btnText}>{t('login.getOtp')}</Text>
        </Pressable>
      </View>
    );
  }
  if (!ipo) return <View style={styles.screen} />;

  if (profiles.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.h1}>{t('apply.title')} · {ipo.name}</Text>
        <Text style={[styles.muted, { marginTop: 16 }]}>{t('apply.noApplicant')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/profiles/new')}>
          <Text style={styles.btnText}>+ {t('profiles.add')}</Text>
        </Pressable>
      </View>
    );
  }

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];
  const lot = ipo.lotSize ?? 0;
  const unit = ipo.priceBandMax ?? 0;
  const shares = lots * lot;
  const amount = shares * unit;

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>{t('apply.title')} · {ipo.name}</Text>
      <Text style={styles.note}>{t('apply.selfPan')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('apply.applicant')}</Text>
        <View style={styles.applicants}>
          {profiles.map((p) => {
            const on = p.id === selected.id;
            return (
              <Pressable key={p.id} onPress={() => setSelectedId(p.id)} style={[styles.appChip, on && styles.appChipOn]}>
                <Text style={[styles.appTxt, on && styles.appTxtOn]}>{t(`rel.${p.relationship}`)} · {p.fullName}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => router.push('/profiles/new')} style={styles.appChip}>
            <Text style={styles.appTxt}>+ {t('profiles.add')}</Text>
          </Pressable>
        </View>

        {ipo.reservations && ipo.reservations.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 18 }]}>{t('apply.category')}</Text>
            <View style={styles.row}>
              {(['individual', ...ipo.reservations] as ApplicantType[]).map((c) => (
                <Choice key={c} active={applicantType === c} label={t(`applicant.${c}`)} onPress={() => setApplicantType(c)} />
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { marginTop: 18 }]}>{t('apply.lots')}</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.step} onPress={() => setLots((n) => Math.max(1, n - 1))}><Text style={styles.stepTxt}>–</Text></Pressable>
          <Text style={styles.lotVal}>{lots}  ·  {shares} {t('apply.shares')}</Text>
          <Pressable style={styles.step} onPress={() => setLots((n) => n + 1)}><Text style={styles.stepTxt}>+</Text></Pressable>
        </View>

        <View style={styles.kv}><Text style={styles.kvK}>{t('apply.amount')}</Text><Text style={styles.kvV}>₹{amount.toLocaleString('en-IN')}</Text></View>

        <Text style={[styles.label, { marginTop: 18 }]}>{t('apply.method')}</Text>
        <View style={styles.row}>
          <Choice active={method === 'upi'} label={t('apply.method.upi')} onPress={() => setMethod('upi')} />
          <Choice active={method === 'pdf'} label={t('apply.method.pdf')} onPress={() => setMethod('pdf')} />
        </View>
      </View>

      <Pressable style={styles.consent} onPress={() => setConsent((c) => !c)}>
        <View style={[styles.check, consent && styles.checkOn]}>{consent && <Text style={styles.checkMark}>✓</Text>}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.consentTitle}>{t('apply.consent.title')}</Text>
          <Text style={styles.consentText}>{t('apply.consent.text')}</Text>
        </View>
      </Pressable>

      {placed ? (
        <Text style={styles.placed}>{t('apply.placed')}</Text>
      ) : (
        <>
          <Pressable
            style={[styles.btn, !consent && styles.btnDisabled]}
            disabled={!consent}
            onPress={async () => {
              await createApplication(token!, {
                investorProfileId: selected.id, ipoId: ipo.id, category: 'IND',
                applicantType,
                lots, atCutoff: true, applyMethod: method === 'upi' ? 'native' : 'pdf',
                dataSharingConsent: consent, consentNoticeVersion: noticeVersion,
              });
              setPlaced(true);
            }}
          >
            <Text style={styles.btnText}>{t('apply.cta')}</Text>
          </Pressable>
          {!consent && <Text style={styles.consentHint}>{t('apply.consent.required')}</Text>}
        </>
      )}
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceOn]}>
      <Text style={[styles.choiceTxt, active && styles.choiceTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSubtle, padding: 16 },
  h1: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  muted: { color: colors.textMuted, fontSize: 15 },
  card: { backgroundColor: colors.surface, marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 4 },
  applicants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  appChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 980, borderWidth: 1, borderColor: colors.border },
  appChipOn: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primarySoft },
  appTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  appTxtOn: { color: colors.brand.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 22, color: colors.brand.primary },
  lotVal: { fontSize: 16, fontWeight: '600', color: colors.text },
  kv: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  kvK: { color: colors.textMuted, fontSize: 15 },
  kvV: { color: colors.text, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  choice: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  choiceOn: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primarySoft },
  choiceTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  choiceTxtOn: { color: colors.brand.primary },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
  placed: { color: colors.state.success, fontSize: 15, fontWeight: '600', marginTop: 20, textAlign: 'center' },
  consent: { flexDirection: 'row', gap: 12, marginTop: 16, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  checkMark: { color: colors.brand.primaryInk, fontSize: 14, fontWeight: '700' },
  consentTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  consentText: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  consentHint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
