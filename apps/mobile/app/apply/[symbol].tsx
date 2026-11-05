/**
 * Apply flow — UPI-mandate applications ONLY (printing lives at /print/<symbol>).
 * Mirrors the finalized web flow: family multi-select (UPI + non-minor required;
 * others route to Print Forms) → Category & bid size via the shared bid engine
 * (Retail | HNI | Shareholder tabs, fixed lot options at the band ceiling,
 * Min/Max Retail + sHNI chips) → per-member overrides → single itemized consent
 * → one application per member, each approving their own UPI mandate.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeBidEngine } from '@investoyard/shared-types';
import { fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import type { IpoFull } from '../../lib/ipoCalc';
import { useT } from '../../components/i18n';
import { useAuth } from '../../components/auth';
import { useProfiles, type ProfileRecord } from '../../components/profiles';
import { getIpo, getUpiCap, createApplication, getConsentNotices, listApplications } from '../../lib/api';
import { inr } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadFailure } from '../../components/ui/LoadFailure';
import { LoginGate } from '../../components/ui/LoginGate';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { CheckIcon, PencilIcon, RefreshIcon, UsersIcon, XIcon } from '../../components/ui/icons';
import { SuccessMoment } from '../../components/ui/Celebration';
import { ApplyBidPicker, applyCategory, applyTabLabel, type ApplyChoice } from '../../components/BidControls';
import { UPI_MANDATE_MAX, dematLabel, isLiveApplication, type ApplicationView } from '@investoyard/shared-types';

/**
 * Does this applicant hold a usable demat?
 *
 * DEPOSITORY-AWARE, and it has to be in BOTH directions. A CDSL account has NO
 * DP ID and stores `dpId: ''`, so a flat `dpId && clientId` drops every CDSL
 * applicant — the fault this codebase already paid for in `dematAccountsFor`.
 * But an NSDL bid genuinely needs the DP ID, so accepting `clientId` alone
 * there would pass the picker and then be REFUSED by the rail builder, which is
 * strictly worse than being told at the picker.
 *
 * Deliberately the same expression web's ApplyWizard uses rather than a second
 * reading of the rule. Known gap, shared with web: a profile whose own columns
 * are empty while an EXTRA demat exists reads as having none. Not reachable
 * today — a profile is created with its default account.
 */
const hasDemat = (p: ProfileRecord) =>
  p.depository === 'CDSL' ? !!p.clientId : !!(p.dpId && p.clientId);

/**
 * Everything the applicant needs before a bid can be built from them — the
 * same set web's ApplyWizard requires. Mobile checked the UPI ID alone, so a
 * profile with no PAN or no demat still read as selectable (QC U5).
 */
const applyReady = (p: ProfileRecord) => !!p.fullName && !!p.pan && hasDemat(p);

/** Eligible for the UPI flow: ready, own UPI on file, and not a minor. */
const upiReady = (p: ProfileRecord) => applyReady(p) && !!p.upiId && p.relationship !== 'child';

/** What an unready applicant is missing, in the words the profile form uses. */
const missingBits = (p: ProfileRecord) => {
  const bits: string[] = [];
  if (!p.pan) bits.push('PAN');
  if (!hasDemat(p)) bits.push('demat details');
  return bits.join(' & ') || 'details';
};

export default function ApplyScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { failure: profilesFailure, refresh: refreshProfiles, profiles } = useProfiles();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [ipo, setIpo] = useState<IpoFull | null | undefined>(undefined);
  const [upiCap, setUpiCap] = useState(UPI_MANDATE_MAX);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [master, setMaster] = useState<ApplyChoice | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ApplyChoice>>({});
  /** Which demat each applicant's allotment credits to. Absent = their default,
   *  which is what the server resolves when `dematAccountId` is null — so this
   *  stays empty for everyone who holds only one account. */
  const [dematBy, setDematBy] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined);
  const [myApps, setMyApps] = useState<ApplicationView[]>([]);
  const [placed, setPlaced] = useState<{ name: string; amount: number; cat: string }[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);

  useEffect(() => { if (symbol) getIpo(String(symbol)).then((v) => setIpo(v ?? null)); }, [symbol]);
  useEffect(() => { getUpiCap().then(setUpiCap); }, []);
  /* The investor's own bids, so the picker can tell an applicant who has
     ALREADY applied for this issue from one who has not. Worth the extra
     request: the self-PAN rule is enforced server-side and `onPlace` loops one
     applicant at a time, so without this a batch containing a duplicate
     creates the earlier applications and THEN fails. `listApplications`
     returns [] on any failure, which leaves every applicant selectable — the
     server still refuses, so a missed check costs the old behaviour and never
     a wrong allow. */
  useEffect(() => { if (token) listApplications(token).then(setMyApps); }, [token]);
  useEffect(() => { getConsentNotices().then((ns) => setNoticeVersion(ns.find((n) => n.type === 'data_sharing_rail')?.version)); }, []);

  const engine = useMemo(
    () => (ipo ? makeBidEngine({ lotSize: ipo.lotSize, priceBandMax: ipo.priceBandMax ?? ipo.priceBandMin }, { upiCap }) : null),
    [ipo, upiCap],
  );
  // default master pick = min retail, once the engine is ready
  useEffect(() => {
    if (engine && !master && engine.presets.minRetail) setMaster({ tab: 'retail', q: engine.presets.minRetail });
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
  /* A FAILED READ IS NOT AN EMPTY FAMILY. This branch used to be reached
     by both, and told an investor on closing day to go and add an applicant
     they already had. */
  if (profilesFailure && profiles.length === 0) {
    return (
      <View style={styles.screen}>
        <LoadFailure reason={profilesFailure} onRetry={refreshProfiles} />
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

  const allowShareholder = (ipo.reservations ?? []).includes('shareholder');
  const eligible = profiles.filter(upiReady);

  /* TWO WAYS AN ELIGIBLE APPLICANT STILL CANNOT APPLY, both enforced
     server-side and neither visible here until now (QC U5):
       - ALREADY APPLIED for this issue. Keyed on `ipoId`, not the symbol, so a
         renamed symbol cannot slip past it. Draft/failed/rejected bids do not
         count, matching the server's own filter — a failed attempt must not
         lock someone out of retrying.
       - SAME PAN as an applicant already selected. One public application per
         PAN per IPO, so two profiles sharing a PAN cannot both go in one batch;
         the server raises this per batch. PANs arrive MASKED (ABC****4F), which
         is what web compares too — a UI pre-check in front of an authoritative
         panHash check, not a substitute for it. */
  const appliedIds = new Set(
    myApps.filter((a) => a.ipoId === ipo.id && isLiveApplication(a.status) && a.investorProfileId)
      .map((a) => a.investorProfileId as string),
  );
  const selected = eligible.filter((p) => selectedIds.includes(p.id) && !appliedIds.has(p.id));
  const panClash = (p: ProfileRecord) =>
    !selectedIds.includes(p.id) && !!p.pan && selected.some((s) => s.pan === p.pan);
  const blockedWhy = (p: ProfileRecord) =>
    (appliedIds.has(p.id) ? 'Already applied' : panClash(p) ? 'Same PAN' : null);
  const choiceFor = (p: ProfileRecord): ApplyChoice | null => overrides[p.id] ?? master;
  const totalAmount = selected.reduce((s, p) => s + (choiceFor(p)?.q.amount ?? 0), 0);
  const toggleApplicant = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onPlace = async () => {
    if (!selected.length || !master || placing) return;
    setPlacing(true); setPlaceErr(null);
    try {
      const done: { name: string; amount: number; cat: string }[] = [];
      for (const p of selected) {
        const c = choiceFor(p)!;
        await createApplication(token!, {
          investorProfileId: p.id,
          dematAccountId: dematBy[p.id] ?? null,                         // null = the profile default
          ipoId: ipo.id,
          category: applyCategory(c),
          applicantType: c.tab === 'sha' ? 'shareholder' : 'individual',
          lots: c.q.lots,
          atCutoff: c.tab !== 'hni',                                     // cut-off is Retail/Shareholder-only
          ...(c.tab === 'hni' ? { bidPrice: ipo.priceBandMax ?? ipo.priceBandMin } : {}),
          applyMethod: 'native',
          dataSharingConsent: consent,
          consentNoticeVersion: noticeVersion,
        } as any);
        done.push({ name: p.fullName, amount: c.q.amount, cat: applyTabLabel(c) });
      }
      setPlaced(done);
    } catch (e: any) {
      setPlaceErr(String(e?.message ?? e));
    } finally {
      setPlacing(false);
    }
  };

  /* ── success ── */
  if (placed) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={styles.placedBox}>
            <SuccessMoment title={placed.length > 1 ? `${placed.length} applications placed` : 'Application placed'} body={t('apply.placed')} />
          </View>
          <Card style={{ marginTop: 14 }}>
            {placed.map((a, i) => (
              <View key={i} style={[styles.sumRow, i > 0 && { borderTopWidth: 1, borderTopColor: ui.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sumName}>{a.name}</Text>
                  <Text style={styles.sumCat}>{a.cat}</Text>
                </View>
                <Text style={styles.sumAmt}>{inr(a.amount)}</Text>
              </View>
            ))}
            <View style={[styles.sumRow, { borderTopWidth: 1, borderTopColor: ui.divider }]}>
              <Text style={[styles.sumName, { flex: 1 }]}>Total to block</Text>
              <Text style={[styles.sumAmt, { color: ui.indigo }]}>{inr(placed.reduce((s, a) => s + a.amount, 0))}</Text>
            </View>
          </Card>
          <Text style={styles.note}>Approve the UPI mandate in each applicant&apos;s UPI app. No money moves until shares are allotted.</Text>
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
        <Text style={styles.note0}>{t('apply.selfPan')}</Text>

        {/* ── applicants ── */}
        <SectionTitle
          label={t('apply.applicant')}
          meta={selected.length ? `${selected.length} selected` : undefined}
          style={{ marginTop: 22 }}
        />
        <Card>
          <View style={styles.applicants}>
            {eligible.map((p) => {
              /* A chip that can only fail is worse than no chip: the server
                 refuses both of these, and `onPlace` loops one applicant at a
                 time, so letting it through creates the earlier applications
                 and then errors. Disabled and labelled instead. (QC U5) */
              const why = blockedWhy(p);
              /* `&& !why` because `myApps` ARRIVES LATE: an applicant selected
                 before it lands can turn out to have applied already, and
                 would otherwise render as selected AND blocked at once. The
                 bid math is unaffected either way — `selected` excludes them. */
              const on = selectedIds.includes(p.id) && !why;
              return (
                <Pressable
                  key={p.id}
                  disabled={!!why}
                  onPress={() => toggleApplicant(p.id)}
                  accessibilityState={{ disabled: !!why, selected: on }}
                  accessibilityLabel={why ? `${p.fullName} — ${why}, cannot be selected` : undefined}
                  style={({ pressed }) => [
                    styles.appChip, on && styles.appChipOn,
                    why && styles.appChipOff,
                    pressed && !why && { opacity: 0.75, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  {on ? <CheckIcon size={13} color="#ffffff" strokeWidth={2.6} /> : null}
                  <Text style={[styles.appTxt, on && styles.appTxtOn, why && styles.appTxtOff]} numberOfLines={1}>
                    {t(`rel.${p.relationship}`)} · {p.fullName}{why ? ` · ${why}` : ''}
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
          {/* minors & no-UPI members — UPI flow can't take them; route to Print Forms */}
          {profiles.filter((p) => !upiReady(p)).map((p) => (
            <View key={p.id} style={styles.blockedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockedName}>{p.fullName}</Text>
                <Text style={styles.blockedWhy}>
                  {/* `applyReady` FIRST: an applicant with no PAN is missing
                      something they can fix, and telling them to use Print
                      Forms instead would send them down a flow that needs the
                      same details. Same order web states these in. */}
                  {!applyReady(p)
                    ? `Missing ${missingBits(p)} to apply`
                    : p.relationship === 'child'
                      ? 'Minor — no UPI mandate; use Print Forms (bank ASBA)'
                      : 'No UPI ID saved — add it, or use Print Forms (bank ASBA)'}
                </Text>
              </View>
              {printOpen ? (
                <Pressable onPress={() => router.push(`/print/${ipo.symbol}`)} style={({ pressed }) => [styles.printsm, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.printsmTxt}>Print Forms</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>

        {/* ── category & bid size ── */}
        {selected.length > 0 && engine && master ? (
          <>
            <SectionTitle label="Category & bid size" style={{ marginTop: 22 }} />
            <Card>
              <Text style={styles.pickerHint}>
                Sets every selected member — fine-tune anyone below. Prices at the band ceiling ({inr(engine.price)}/share); retail bids at cut-off.
              </Text>
              <ApplyBidPicker
                engine={engine} choice={master} allowShareholder={allowShareholder} symbol={ipo.symbol}
                onChange={(c) => { setMaster(c); setOverrides({}); setEditing(null); }}
              />

              {/* per-member overrides */}
              <View style={{ marginTop: 14 }}>
                {selected.map((p) => {
                  const c = choiceFor(p)!;
                  const overridden = !!overrides[p.id];
                  return (
                    <View key={p.id}>
                      <View style={styles.memberRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {p.fullName}{overridden ? <Text style={styles.own}>  custom</Text> : null}
                          </Text>
                          <Text style={styles.memberSub}>
                            {c.q.lots} {c.q.lots === 1 ? 'lot' : 'lots'} · {c.q.shares.toLocaleString('en-IN')} sh · {inr(c.q.amount)} · {applyTabLabel(c)}
                          </Text>
                        </View>
                        <Pressable
                          hitSlop={7}
                          onPress={() => setEditing(editing === p.id ? null : p.id)}
                          style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                        >
                          {editing === p.id ? <XIcon size={14} color={ui.indigo} strokeWidth={2.2} /> : <PencilIcon size={14} color={ui.indigo} strokeWidth={2} />}
                        </Pressable>
                      </View>
                      {/* Credit destination — only for an applicant who holds more than
                          one demat. One account is not a choice, so asking would be noise. */}
                      {(p.demats?.length ?? 0) > 1 ? (
                        <View style={styles.dematPick}>
                          <Text style={styles.dematK}>CREDIT SHARES TO</Text>
                          <View style={styles.dematChips}>
                            {p.demats!.map((d) => {
                              const on = (dematBy[p.id] ?? null) === (d.id ?? null);
                              return (
                                <Pressable
                                  hitSlop={{ top: 3, bottom: 3 }}
                                  key={d.id ?? 'default'}
                                  onPress={() => setDematBy((m) => ({ ...m, [p.id]: d.id ?? null }))}
                                  style={[styles.dematChip, on && styles.dematChipOn]}
                                >
                                  <Text style={[styles.dematChipTxt, on && styles.dematChipTxtOn]} numberOfLines={1}>
                                    {dematLabel(d)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                      {editing === p.id ? (
                        <View style={styles.editBox}>
                          <ApplyBidPicker
                            engine={engine} compact choice={c} allowShareholder={allowShareholder} symbol={ipo.symbol}
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
            <Text style={styles.consentText}>• {t('detail.disclaimer')}</Text>
          </View>
        </Pressable>

        {placeErr ? <Text style={styles.err}>{placeErr}</Text> : null}
      </ScrollView>

      {/* sticky bottom CTA */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.barK}>TOTAL TO BLOCK{selected.length > 1 ? ` · ${selected.length} APPLICANTS` : ''}</Text>
          <Text style={styles.barV}>{inr(totalAmount)}</Text>
          {!consent ? <Text style={styles.barHint}>{t('apply.consent.required')}</Text> : null}
        </View>
        <Button
          label={t('apply.cta')}
          onPress={onPlace}
          disabled={!consent || !selected.length}
          busy={placing}
          style={{ minWidth: 130 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  h1: { fontSize: 21, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.4, color: ui.title },
  note0: { fontFamily: fonts.regular, color: ui.slate, fontSize: 13, marginTop: 5, lineHeight: 18 },
  applicants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, minHeight: 44, borderRadius: 999,
    backgroundColor: ui.canvas, maxWidth: '100%',
  },
  appChipOn: { backgroundColor: ui.indigo },
  /* Blocked: a DASHED outline as well as the dimming, so "cannot be selected"
     is not carried by opacity alone — the same reasoning as A6, where a dot's
     colour was the only thing saying "applied". */
  appChipOff: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: ui.divider },
  appTxt: { color: ui.slate, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', flexShrink: 1 },
  appTxtOn: { color: '#ffffff' },
  appTxtOff: { color: ui.slate, opacity: 0.75 },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider },
  blockedName: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  blockedWhy: { fontSize: 11.5, fontFamily: fonts.regular, color: ui.slate, marginTop: 2, lineHeight: 16 },
  printsm: { backgroundColor: ui.redTint, borderRadius: 10, paddingHorizontal: 12, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  printsmTxt: { color: ui.red, fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
  pickerHint: { fontSize: 12, fontFamily: fonts.regular, color: ui.slate, lineHeight: 17, marginBottom: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: ui.divider },
  memberName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  own: { fontSize: 11, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  memberSub: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 2, fontVariant: ['tabular-nums'] },
  editBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: ui.indigoTint, alignItems: 'center', justifyContent: 'center' },
  dematPick: { marginBottom: 10 },
  dematK: { fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: 0.5, color: ui.slate },
  dematChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  dematChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9,
    borderWidth: 1, borderColor: ui.divider, backgroundColor: ui.card, maxWidth: '100%',
  },
  dematChipOn: { borderColor: ui.indigo, backgroundColor: ui.indigoTint },
  dematChipTxt: {
    fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600',
    color: ui.body, fontVariant: ['tabular-nums'],
  },
  dematChipTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
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
  consentText: { fontFamily: fonts.regular, fontSize: 12.5, color: ui.slate, marginTop: 4, lineHeight: 18 },
  err: { marginTop: 14, color: ui.red, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', textAlign: 'center' },
  placedBox: { backgroundColor: '#ffffff', borderRadius: 20, padding: 6, ...shadowCard },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sumName: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  sumCat: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 2 },
  sumAmt: { fontSize: 14.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  note: { marginTop: 14, fontSize: 12.5, fontFamily: fonts.regular, color: ui.slate, lineHeight: 18, textAlign: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: ui.divider,
    ...shadowCard,
  },
  barK: { ...microLabel },
  barV: { fontSize: 18, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 2, fontVariant: ['tabular-nums'] },
  barHint: { fontFamily: fonts.regular, color: ui.slate, fontSize: 11, marginTop: 2 },
});
