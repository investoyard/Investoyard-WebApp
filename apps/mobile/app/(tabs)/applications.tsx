import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ApplicationView } from '@investoyard/shared-types';
import { fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { listApplications, withdrawApplication } from '../../lib/api';
import { inr } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Chip, ChipTone } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IllusDocs } from '../../components/ui/illustrations';
import { LoginGate } from '../../components/ui/LoginGate';
import { CompanyLogo } from '../../components/ui/CompanyLogo';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CountUp, FadeInUp } from '../../components/ui/motion';
import { DocsIcon } from '../../components/ui/icons';

/* Status → pill tone (parity with the web Portfolio STATUS_CLASS map). */
const TONE: Record<string, ChipTone> = {
  draft: 'warn', submitted: 'info', dp_verified: 'info', dp_failed: 'danger',
  mandate_pending: 'warn', upi_blocked: 'info', confirmed: 'info',
  // allotted = the celebration state → the app's one gold pill
  allotted: 'gold', not_allotted: 'danger', released: 'info', rejected: 'danger', failed: 'danger',
};

/* 4-step lifecycle: Applied → Bid → Allotment → Refund/Credit */
const STEPS = ['Applied', 'Bid', 'Allotment', 'Refund/Credit'];
function stepOf(a: ApplicationView): number {
  switch (a.status) {
    case 'submitted': return 1;
    case 'dp_verified': case 'mandate_pending': case 'upi_blocked': case 'confirmed': return 2;
    case 'allotted': return a.listingGainPct != null || a.listingGain != null ? 4 : 3;
    case 'not_allotted': case 'released': return 4;
    default: return 1;
  }
}

/** Honest, plain-English status line (parity with the web resultText). */
function resultLine(a: ApplicationView): string {
  const upi = a.applyMethod === 'native';
  switch (a.status) {
    case 'submitted': return 'Application received — queued for exchange submission.';
    case 'dp_verified': return `DP & PAN verified · awaiting ${upi ? 'UPI mandate approval' : 'ASBA submission'}.`;
    case 'mandate_pending':
      return upi
        ? `Approve the UPI mandate in your UPI app to block ${inr(a.amount || a.amountBlocked)}.`
        : `Submit the ASBA form at your bank to block ${inr(a.amount || a.amountBlocked)}.`;
    case 'upi_blocked':
    case 'confirmed':
      return `${inr(a.amountBlocked ?? a.amount)} blocked by your bank (${upi ? 'UPI-ASBA' : 'ASBA'}) — awaiting allotment.`;
    case 'allotted':
      return `Allotted${a.allottedLots != null ? ` ${a.allottedLots} lot${a.allottedLots === 1 ? '' : 's'}` : ''} · ${inr(a.allottedAmount ?? a.amountBlocked ?? a.amount)} debited.`;
    case 'not_allotted':
    case 'released':
      return `Not allotted · ${inr(a.refundAmount ?? a.amount)} released back to your bank.`;
    case 'dp_failed': return 'Demat (DP) verification failed — check this applicant’s demat details.';
    case 'rejected': return 'Application rejected by the exchange.';
    case 'failed': return 'Submission failed — no amount was blocked.';
    default: return '';
  }
}

// SEBI: a bid may be withdrawn while the issue is still open and isn't decided yet.
const WITHDRAWABLE = ['submitted', 'mandate_pending', 'upi_blocked', 'dp_verified', 'confirmed'];
const IN_PROGRESS = ['submitted', 'dp_verified', 'mandate_pending', 'upi_blocked', 'confirmed'];

export default function ApplicationsScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const [apps, setApps] = useState<ApplicationView[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (token) setApps(await listApplications(token));
  }, [token]);

  // refresh whenever the tab regains focus (fresh statuses after applying)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const onWithdraw = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    await withdrawApplication(token, id);
    await load();
    setBusyId(null);
  };

  if (!token) return <LoginGate body="Sign in to see your IPO applications and allotment results." />;

  const allottedN = (apps ?? []).filter((a) => a.status === 'allotted').length;
  const progressN = (apps ?? []).filter((a) => IN_PROGRESS.includes(a.status)).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 110 /* clear the floating tab bar */ }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
      }
    >
      <Text style={styles.h1}>{t('apps.title')}</Text>

      {apps === null ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
      ) : apps.length === 0 ? (
        <EmptyState
          art={<IllusDocs />}
          title={t('apps.empty')}
          body="Your first application will show up here — pick an open IPO and go for it."
          cta={<Button label="Explore IPOs" variant="ghost" onPress={() => router.push('/')} />}
        />
      ) : (
        <>
          {/* summary strip (figures count up on first load) */}
          <FadeInUp index={0} style={styles.summary}>
            <SummaryCol k="APPLIED" v={apps.length} />
            <View style={styles.sumDiv} />
            <SummaryCol k="ALLOTTED" v={allottedN} tone={allottedN > 0 ? ui.green : undefined} />
            <View style={styles.sumDiv} />
            <SummaryCol k="IN PROGRESS" v={progressN} />
          </FadeInUp>

          {apps.map((a, cardIdx) => {
            const step = stepOf(a);
            const line = resultLine(a);
            const profileName = (a as any).profileName as string | undefined;
            // `missingDetails` is in the shared contract's src but not yet in its built dist —
            // read it defensively so the mobile app typechecks against either build.
            const missing = ((a as any).missingDetails ?? []) as string[];
            return (
              <FadeInUp key={a.id} index={cardIdx + 1}>
              <Card style={{ marginTop: 12 }}>
                <View style={styles.row}>
                  <View style={styles.title}>
                    <CompanyLogo name={a.ipoName ?? a.ipoSymbol ?? '?'} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{a.ipoName ?? a.ipoSymbol ?? a.ipoId}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {a.ipoSymbol ?? ''}{a.applicationNumber ? `  ·  ${a.applicationNumber}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Chip label={t(`appStatus.${a.status}`)} tone={TONE[a.status] ?? 'neutral'} />
                </View>

                {/* 4-step progress dots */}
                <View style={styles.steps}>
                  {STEPS.map((lbl, i) => (
                    <View key={lbl} style={styles.stepCol}>
                      <View style={styles.stepDotRow}>
                        <View style={[styles.stepLine, i === 0 && { backgroundColor: 'transparent' }, i > 0 && i < step && styles.stepLineOn]} />
                        <View style={[styles.stepDot, i < step && styles.stepDotOn]} />
                        <View style={[styles.stepLine, i === STEPS.length - 1 && { backgroundColor: 'transparent' }, i + 1 < step && styles.stepLineOn]} />
                      </View>
                      <Text style={[styles.stepLbl, i < step && styles.stepLblOn]} numberOfLines={1}>{lbl}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.amountK} numberOfLines={1}>
                    {profileName ?? t('apply.applicant')} · {a.applyMethod === 'pdf' ? 'ASBA form' : 'UPI'}
                  </Text>
                  <Text style={styles.amountV}>{inr(a.amount || a.amountBlocked)}</Text>
                </View>

                {line ? <Text style={styles.result}>{line}</Text> : null}

                {missing.length > 0 ? (
                  <View style={styles.missingBanner}>
                    {missing.map((m) => (
                      <Text key={m} style={styles.missingTxt}>{m} — add it on the Profiles tab.</Text>
                    ))}
                  </View>
                ) : null}

                {(a.categorySubscribedTimes != null || a.allotmentOddsPct != null) ? (
                  <View style={styles.oddsRow}>
                    <Text style={styles.oddsK}>Category subscription (live)</Text>
                    <Text style={styles.oddsV}>
                      {a.categorySubscribedTimes != null ? `${a.categorySubscribedTimes}×` : '—'}
                      {a.allotmentOddsPct != null ? `  ·  ~${a.allotmentOddsPct}% odds` : ''}
                    </Text>
                  </View>
                ) : null}

                {a.allottedLots != null ? (
                  <View style={styles.oddsRow}>
                    <Text style={styles.oddsK}>
                      {a.allottedLots > 0 ? `${t('apps.allotted')}: ${a.allottedLots} ${t('apps.lots')}` : t('apps.notAllotted')}
                    </Text>
                    {a.refundAmount != null && a.refundAmount > 0 ? (
                      <Text style={[styles.oddsV, { color: ui.green }]}>{inr(a.refundAmount)} {t('apps.refund')}</Text>
                    ) : null}
                  </View>
                ) : null}

                {a.listingGain != null ? (
                  <View style={styles.oddsRow}>
                    <Text style={styles.oddsK}>{a.listingGain >= 0 ? t('apps.listingGain') : t('apps.listingLoss')}</Text>
                    <Text style={[styles.gainTxt, { color: a.listingGain >= 0 ? ui.green : ui.red }]}>
                      {a.listingGain >= 0 ? '▲ +' : '▼ −'}₹{Math.abs(a.listingGain).toLocaleString('en-IN')}
                      {a.listingGainPct != null ? `  (${a.listingGainPct >= 0 ? '+' : ''}${a.listingGainPct}%)` : ''}
                    </Text>
                  </View>
                ) : null}

                {a.ipoStatus === 'open' && WITHDRAWABLE.includes(a.status) ? (
                  <Button
                    small
                    variant="danger"
                    label={t('apps.withdraw')}
                    busy={busyId === a.id}
                    onPress={() => onWithdraw(a.id)}
                    style={{ alignSelf: 'flex-start', marginTop: 12 }}
                  />
                ) : null}
              </Card>
              </FadeInUp>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function SummaryCol({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <View style={styles.sumCol}>
      <Text style={styles.sumK}>{k}</Text>
      <CountUp value={v} style={[styles.sumV, tone ? { color: tone } : null] as any} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 24, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.5, color: ui.title },
  summary: {
    flexDirection: 'row', alignItems: 'center', marginTop: 16,
    backgroundColor: '#ffffff', borderRadius: 20, paddingVertical: 16,
    ...shadowCard,
  },
  sumCol: { flex: 1, alignItems: 'center', gap: 3 },
  sumDiv: { width: 1, height: 30, backgroundColor: ui.divider },
  sumK: { ...microLabel, fontSize: 10.5 },
  sumV: { fontSize: 20, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  name: { fontSize: 15, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  meta: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  steps: { flexDirection: 'row', marginTop: 16 },
  stepCol: { flex: 1, alignItems: 'center' },
  stepDotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 2, backgroundColor: ui.divider },
  stepLineOn: { backgroundColor: ui.indigo },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ui.divider, marginHorizontal: 2 },
  stepDotOn: { backgroundColor: ui.indigo },
  stepLbl: { fontSize: 10, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 6 },
  stepLblOn: { color: ui.indigo },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider, gap: 10,
  },
  amountK: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, flex: 1 },
  amountV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  result: { fontFamily: fonts.regular, fontSize: 13, color: ui.muted, marginTop: 8, lineHeight: 19 },
  missingBanner: { backgroundColor: ui.redTint, borderRadius: 12, padding: 12, marginTop: 10, gap: 4 },
  missingTxt: { fontSize: 12.5, color: ui.red, fontFamily: fonts.semibold, fontWeight: '600', lineHeight: 18 },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  oddsK: { fontFamily: fonts.regular, fontSize: 13, color: ui.muted, flexShrink: 1 },
  oddsV: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, fontVariant: ['tabular-nums'] },
  gainTxt: { fontSize: 14, fontFamily: fonts.extrabold, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
