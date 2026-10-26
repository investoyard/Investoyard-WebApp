import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { animateNext, fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import { tapSelect } from '../../lib/haptics';
import { useT } from '../../components/i18n';
import { useProfiles, Relationship } from '../../components/profiles';
import { getRelationships, getUpiHandles, RelationshipOption } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { APPLICANT_ERR as ERR, APPLICANT_HELP as HELP } from '@investoyard/shared-types';
import { PickerField, type PickOption } from '../../components/ui/PickerField';
import { fetchBanks, fetchStates, searchBranches, searchCities, lookupPincode, type BankOption } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { CheckIcon, ChevronDownIcon } from '../../components/ui/icons';

/** Fallback when the relationships master can't be fetched (offline). */
const DEFAULT_OPTIONS: RelationshipOption[] = [
  { name: 'Self', allowMultiple: false }, { name: 'Spouse', allowMultiple: false },
  { name: 'Mother', allowMultiple: false }, { name: 'Father', allowMultiple: false },
  { name: 'Child', allowMultiple: true }, { name: 'Sibling', allowMultiple: true }, { name: 'Other', allowMultiple: true },
];

export default function NewProfileScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { addProfile, editProfile, profiles } = useProfiles();

  // Edit mode: same form, prefilled. PAN/UPI/bank are vaulted — fields start
  // blank and only REPLACE the saved value when typed. PAN locks once the
  // applicant has any application (self-PAN integrity).
  const editing = id ? profiles.find((p) => p.id === id) : undefined;
  const panLocked = !!editing?.hasApplications;

  // Options come from the admin-managed Relationships master; single-slot ones
  // (allowMultiple=false) already used on this account are hidden (the one
  // being edited keeps its own relationship selectable).
  const [opts, setOpts] = useState<RelationshipOption[]>(DEFAULT_OPTIONS);
  useEffect(() => { getRelationships().then((r) => { if (r?.length) setOpts(r); }).catch(() => {}); }, []);
  const taken = profiles.filter((p) => p.id !== editing?.id).map((p) => String(p.relationship).toLowerCase());
  const options = opts.filter((o) => o.allowMultiple || !taken.includes(o.name.toLowerCase())).map((o) => o.name.toLowerCase());
  const [relationship, setRelationship] = useState<Relationship>(options.includes('self') ? 'self' : (options[0] ?? 'other'));
  useEffect(() => { if (!options.includes(relationship)) setRelationship(options[0] ?? 'other'); }, [options.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fullName, setFullName] = useState('');
  const [pan, setPan] = useState('');
  const [depository, setDepository] = useState<'NSDL' | 'CDSL'>('NSDL');
  const [dpId, setDpId] = useState('');
  const [clientId, setClientId] = useState('');
  // UPI is captured as two parts and joined on save (name + admin-approved handle)
  const [upiName, setUpiName] = useState('');
  const [upiHandle, setUpiHandle] = useState('');
  const [handleOpen, setHandleOpen] = useState(false);
  const [handleQuery, setHandleQuery] = useState('');
  const upiId = upiName && upiHandle ? `${upiName}@${upiHandle}` : '';
  // optional bank/contact block stays collapsed until asked for
  const [bankOpen, setBankOpen] = useState(false);
  // optional bank/contact — prefill the printed ASBA form
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* Set on the first save attempt; nothing inline is shown before it. */
  const [tried, setTried] = useState(false);

  /* ---- the bank / branch / pincode directory ------------------------
   * `dirReady` is the SERVER’s answer, not a flag of ours: if the masters
   * are empty every control below falls back to the plain text field it was
   * before. Both lists are small and closed (1,348 banks, 36 states), so
   * they load once and filter in memory; branches and cities are server
   * queries because 1.82 lakh rows is not something to pull to a phone.
   * ------------------------------------------------------------------ */
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [bankId, setBankId] = useState<string>('');
  const [pinNote, setPinNote] = useState<string | null>(null);
  const pinSeq = useRef(0);
  const dirReady = banks.length > 0;

  useEffect(() => {
    fetchBanks().then(setBanks);
    fetchStates().then((r) => setStateList(r.map((x) => x.name)));
  }, []);

  /* Resolve the saved bank NAME to an id once the list arrives — see above. */
  useEffect(() => {
    if (!banks.length || bankId || !bankName.trim()) return;
    const hit = banks.find((b) => b.name.toLowerCase() === bankName.trim().toLowerCase());
    if (hit) setBankId(hit.id);
  }, [banks, bankId, bankName]);

  /* THE API ALREADY RETURNS THE TWO-TIER ORDER and this must not re-sort it:
     72 banks with 100+ branches first, biggest first, then the 1,276-bank
     tail alphabetically. Ordered by NAME alone, the first twelve options
     were an army credit co-operative and eleven district co-operatives
     while State Bank of India sat at #1163. The headings are here so the
     jump back to "A" at the boundary does not read as the list restarting. */
  const bankOptions: PickOption[] = banks.map((b) => ({
    value: b.id,
    label: b.name,
    group: b.major ? 'Most used' : 'All banks (A–Z)',
  }));
  const stateOptions: PickOption[] = stateList.map((n) => ({ value: n, label: n }));

  /* A PINCODE FILLS ONLY WHAT IS EMPTY. Overwriting a city the applicant
     typed would be the form correcting their own records against a
     directory, and theirs is what the registrar matches on. */
  useEffect(() => {
    if (!dirReady || !/^[0-9]{6}$/.test(pincode)) { setPinNote(null); return; }
    const mine = ++pinSeq.current;
    const ac = new AbortController();
    lookupPincode(pincode, ac.signal).then((r) => {
      if (mine !== pinSeq.current) return;
      if (!r) { setPinNote(ERR.pincodeUnknown); return; }
      if (!city.trim() && r.city) setCity(r.city);
      if (!stateName.trim() && r.state) setStateName(r.state);
      /* 1,314 pincodes cover more than one district — 6.8%, not a rounding
         error — and the import flags them rather than picking quietly. */
      setPinNote(r.ambiguous ? HELP.pincodeAmbiguous : null);
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode, dirReady]);
  // Allowed UPI handles (admin master) — a UPI ID saves only on a listed handle.
  const [upiHandles, setUpiHandles] = useState<string[]>([]);
  useEffect(() => { getUpiHandles().then(setUpiHandles); }, []);
  // The handle master can run long — filter it rather than make people scan a wall of chips.
  const handleMatches = upiHandles.filter((h) => h.includes(handleQuery.trim().toLowerCase()));

  // Prefill once when the record to edit is available (secrets stay blank).
  useEffect(() => {
    if (!editing) return;
    setRelationship(String(editing.relationship).toLowerCase());
    setFullName(editing.fullName);
    setDepository(editing.depository);
    setDpId(editing.depository === 'NSDL' ? editing.dpId.replace(/^IN/, '') : '');
    setClientId(editing.clientId);
    setBankName(editing.bankName ?? '');
    setBranchName(editing.branchName ?? '');
    setIfsc(editing.ifsc ?? '');
    setAddress(editing.address ?? '');
    setCity(editing.city ?? '');
    setStateName(editing.state ?? '');
    setPincode(editing.pincode ?? '');
    setEmail(editing.email ?? '');
    setMobile(editing.mobile ?? '');
    // a profile that already carries bank/contact detail opens that block, so
    // nothing the operator saved earlier looks lost behind a collapsed section
    if (editing.bankName || editing.ifsc || editing.address || editing.email || editing.mobile || editing.hasBank) {
      setBankOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Translated label when the i18n bundle knows the relation; else Capitalized name.
  const relLabel = (r: string) => { const k = `rel.${r}`; const v = t(k); return v === k ? r.charAt(0).toUpperCase() + r.slice(1) : v; };

  // NSDL: DP ID = IN + 6 digits, 8-digit client id. CDSL: one 16-digit demat number, no DP ID.
  const isCdsl = depository === 'CDSL';
  const dematOk = isCdsl ? /^\d{16}$/.test(clientId) : /^\d{6}$/.test(dpId) && /^\d{8}$/.test(clientId);
  // Edit mode: PAN optional (blank = keep saved) and no consent re-tick needed.
  const panOk = editing ? (!pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())) : /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
  const upiFormatOk = !upiId || /^[\w.\-]{2,}@[a-zA-Z0-9]{2,}$/.test(upiId);
  const upiHandleOk = !upiId || !upiHandles.length || upiHandles.includes((upiId.split('@')[1] ?? '').toLowerCase());
  const upiOk = upiFormatOk && upiHandleOk;
  /* IFSC and mobile are OPTIONAL, so these only bite once something has been
     typed into them. Web has validated both for months; mobile accepted a
     malformed IFSC silently and printed it onto the ASBA form. */
  const ifscOk = !ifsc || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc);
  const mobileOk = !mobile || mobile.length === 10;
  const valid = fullName.trim() && panOk && dematOk && upiOk && ifscOk && mobileOk && (editing ? true : consent);

  /* INLINE ERRORS WAIT FOR THE FIRST SAVE ATTEMPT. Telling someone their
     half-typed PAN is malformed while they are still typing it is the form
     arguing with them. */
  const E = {
    fullName: tried && !fullName.trim() ? ERR.fullName : null,
    pan: tried && !panOk ? ERR.pan : null,
    dpId: tried && !isCdsl && !/^[0-9]{6}$/.test(dpId) ? ERR.dpId : null,
    clientId: tried && !dematOk && (isCdsl ? !/^[0-9]{16}$/.test(clientId) : !/^[0-9]{8}$/.test(clientId))
      ? (isCdsl ? ERR.cdsl : ERR.clientId) : null,
    ifsc: tried && !ifscOk ? ERR.ifsc : null,
    mobile: tried && !mobileOk ? ERR.mobile : null,
  };

  const onSave = async () => {
    setTried(true);
    if (!valid) {
      setError(!editing && !consent ? 'Please give consent to continue'
        : !dematOk ? (isCdsl ? 'CDSL demat number must be 16 digits' : 'NSDL: DP ID is IN + 6 digits, Client ID is 8 digits')
        : !upiFormatOk ? 'Enter the UPI ID as name@handle (e.g. name@okaxis)'
        : !upiHandleOk ? `@${upiId.split('@')[1] ?? ''} is not a supported UPI handle`
        : !ifscOk ? ERR.ifsc
        : !mobileOk ? ERR.mobile
        : 'Please complete all fields with a valid PAN');
      return;
    }
    setSaving(true); setError(null);
    try {
      if (editing) {
        await editProfile(editing.id, {
          relationship, fullName: fullName.trim(), depository,
          dpId: isCdsl ? '' : `IN${dpId}`, clientId,
          // vaulted fields only when typed — blank means "keep the saved value"
          ...(pan && !panLocked ? { pan: pan.toUpperCase() } : {}),
          ...(upiId ? { upiId } : {}),
          ...(bankAccount ? { bankAccount } : {}),
          ...(ifsc ? { ifsc: ifsc.toUpperCase() } : {}),
          ...(mobile ? { mobile } : {}),
          bankName, branchName, address, city, state: stateName, pincode, email,
        });
      } else {
        await addProfile({
          relationship, fullName: fullName.trim(), pan: pan.toUpperCase(), depository,
          dpId: isCdsl ? '' : `IN${dpId}`, clientId, upiId: upiId || undefined,
          bankName: bankName || undefined, branchName: branchName || undefined, bankAccount: bankAccount || undefined,
          ifsc: ifsc || undefined, address: address || undefined, city: city || undefined, state: stateName || undefined,
          pincode: pincode || undefined, email: email || undefined, mobile: mobile || undefined,
        });
      }
      router.back();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not save this profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    // 'padding' on BOTH platforms — SDK 54 Android is edge-to-edge (same fix as login)
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Stack.Screen options={{ title: editing ? `Edit — ${editing.fullName}` : t('profile.new') }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.note}>{t('profile.note')}</Text>

        <SectionTitle label={t('profile.relationship')} style={{ marginTop: 20 }} />
        <Card>
          <View style={styles.segs}>
            {options.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRelationship(r)}
                style={({ pressed }) => [styles.seg, relationship === r && styles.segOn, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
              >
                <Text style={[styles.segTxt, relationship === r && styles.segTxtOn]}>{relLabel(r)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.segHelp}>{HELP.relationship}</Text>
        </Card>

        <SectionTitle label="Identity" style={{ marginTop: 24 }} />
        <Card>
          <Field label={t('profile.fullName')} value={fullName} onChange={setFullName} first help={HELP.fullName} error={E.fullName} />
          <Field
            label={panLocked ? `${t('profile.pan')} — locked (has applications)` : t('profile.pan')}
            value={pan} onChange={setPan} autoCapitalize="characters" maxLength={10}
            placeholder={editing ? `${editing.pan} — type to change` : 'ABCDE1234F'}
            mono editable={!panLocked}
            help={panLocked ? HELP.panLocked : HELP.pan} error={E.pan}
          />
        </Card>

        <SectionTitle label={t('profile.depository')} style={{ marginTop: 24 }} />
        <Card>
          <View style={styles.segs}>
            {(['NSDL', 'CDSL'] as const).map((d) => (
              <Pressable
                key={d}
                onPress={() => { setDepository(d); setDpId(''); setClientId(''); }}
                style={({ pressed }) => [styles.seg, styles.segWide, depository === d && styles.segOn, pressed && { opacity: 0.75 }]}
              >
                <Text style={[styles.segTxt, depository === d && styles.segTxtOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          {/* Plain-language explainer — most applicants don't know which one they hold. */}
          <Text style={styles.dematNote}>
            {isCdsl
              ? 'CDSL — one 16-digit number, no separate DP ID.'
              : 'NSDL — two parts: DP ID (IN + 6 digits) and an 8-digit Client ID.'}
            {' '}Find it in your broker&apos;s app under Demat. Starts 12… → CDSL, starts IN → NSDL.
          </Text>
          {!isCdsl && (
            <Field label={`${t('profile.dpId')} — IN prefix is added automatically`} value={dpId}
              onChange={(v) => setDpId(v.replace(/\D/g, '').slice(0, 6))} placeholder="301234 (6 digits)" maxLength={6} mono keyboard="number-pad" help={HELP.dpId} error={E.dpId} />
          )}
          <Field label={isCdsl ? 'Demat number (16 digits)' : `${t('profile.clientId')} (8 digits)`} value={clientId}
            onChange={(v) => setClientId(v.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8))}
            placeholder={isCdsl ? '16-digit demat number' : '12345678'} maxLength={isCdsl ? 16 : 8} mono keyboard="number-pad"
            help={isCdsl ? HELP.cdsl : HELP.clientId} error={E.clientId} />
          {/* UPI is split: the user types only the name and PICKS the handle from
              the admin-managed master, so an unsupported handle is impossible. */}
          <View style={styles.upiWrap}>
            <Text style={styles.upiLabel}>{t('profile.upi')}</Text>
            <View style={styles.upiRow}>
              <TextInput
                style={styles.upiName}
                value={upiName}
                onChangeText={(v) => setUpiName(v.replace(/[^\w.\-]/g, ''))}
                placeholder={editing?.upiId ? 'saved ✓ — type to replace' : 'yourname'}
                placeholderTextColor={ui.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => { tapSelect(); setHandleOpen((o) => !o); setHandleQuery(''); }}
                style={({ pressed }) => [styles.upiHandle, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.upiHandleTxt} numberOfLines={1}>@{upiHandle || 'select'}</Text>
                <ChevronDownIcon size={13} color={ui.indigo} strokeWidth={2.2} />
              </Pressable>
            </View>
            {handleOpen ? (
              <View style={styles.handleList}>
                {upiHandles.length === 0 ? (
                  <Text style={styles.hint}>Handle list unavailable — try again in a moment.</Text>
                ) : (
                  <>
                    {/* Only worth a search box once scanning the chips costs more than typing. */}
                    {upiHandles.length > 8 ? (
                      <TextInput
                        style={styles.handleSearch}
                        value={handleQuery}
                        onChangeText={setHandleQuery}
                        placeholder="Search handle…"
                        placeholderTextColor={ui.muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    ) : null}
                    <View style={styles.handleChips}>
                      {handleMatches.length === 0 ? (
                        <Text style={styles.hint}>No handle matches “{handleQuery}”.</Text>
                      ) : handleMatches.map((h) => (
                        <Pressable
                          key={h}
                          onPress={() => { tapSelect(); setUpiHandle(h); setHandleOpen(false); setHandleQuery(''); }}
                          style={({ pressed }) => [styles.handleItem, h === upiHandle && styles.handleItemOn, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={[styles.handleTxt, h === upiHandle && styles.handleTxtOn]}>@{h}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ) : null}
            <Text style={styles.hint}>
              {upiName && upiHandle ? `Will be saved as ${upiName}@${upiHandle}` : 'Type your UPI name, then pick the handle.'}
            </Text>
          </View>
        </Card>

        <SectionTitle label="Bank & contact" meta="optional" style={{ marginTop: 24 }} />
        <Card>
          <Pressable
            style={styles.optToggle}
            onPress={() => { tapSelect(); animateNext(); setBankOpen((o) => !o); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: bankOpen }}
          >
            <View style={[styles.checkbox, bankOpen && styles.checkboxOn]}>
              {bankOpen ? <CheckIcon size={13} color="#ffffff" strokeWidth={3} /> : null}
            </View>
            <Text style={styles.optToggleTxt}>Add bank &amp; contact details — pre-fills the printed ASBA form</Text>
          </Pressable>
          {!bankOpen ? null : (
          <>
          <Field label="Mobile" value={mobile} onChange={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))} maxLength={10} placeholder="98XXXXXXXX" mono keyboard="number-pad" help={HELP.mobile} error={E.mobile} />
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" autoCapitalize="none" help={HELP.email} />
          {dirReady ? (
            <>
              <PickerField
                label="Bank name"
                selectedLabel={bankName}
                placeholder="Select your bank"
                options={bankOptions}
                searchPlaceholder="Search 1,348 banks…"
                help={HELP.bankPick}
                onPick={(o) => {
                  /* CHANGING THE BANK CLEARS THE BRANCH AND THE IFSC. Leaving
                     either behind pairs a new bank with the old branch’s
                     routing code — a plausible-looking IFSC that sends money
                     to the wrong institution. */
                  setBankId(o?.value ?? '');
                  setBankName(o?.label ?? '');
                  setBranchName('');
                  setIfsc('');
                }}
              />
              <PickerField
                label="Branch"
                selectedLabel={branchName}
                placeholder={bankId ? 'Search for your branch' : 'Pick a bank first'}
                disabled={!bankId}
                searchPlaceholder="Branch name or city…"
                help={ifsc ? HELP.branchPicked(ifsc) : HELP.branchPick}
                search={async (q, signal) => {
                  const rows = await searchBranches(bankId, q, signal);
                  return rows.map((b) => ({
                    value: b.id,
                    label: b.branch,
                    sub: [b.city, b.state].filter(Boolean).join(', ') + ' · ' + b.ifsc,
                    meta: { ifsc: b.ifsc },
                  }));
                }}
                onPick={async (o) => {
                  setBranchName(o?.label ?? '');
                  /* The IFSC comes from the branch, which is the whole point:
                     nobody should type eleven characters they cannot check.
                     Read off `meta`, never parsed back out of the label. */
                  setIfsc(o?.meta?.ifsc ?? '');
                }}
              />
            </>
          ) : (
            <>
              <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="HDFC Bank" help={HELP.bankName} />
              <Field label="Branch name" value={branchName} onChange={setBranchName} placeholder="MG Road" help={HELP.branchName} />
            </>
          )}
          <Field label="Bank account no." value={bankAccount} onChange={setBankAccount}
            placeholder={editing?.hasBank ? 'saved ✓ — type to replace' : undefined} autoCapitalize="none" mono help={HELP.bankAccount} />
          {dirReady ? (
            /* HIDDEN, NOT REMOVED — it still saves and still prints on the
               ASBA form. What goes away is asking for eleven characters
               nobody can verify. A read-only DISPLAY rather than a disabled
               input: a greyed box still reads as something the user failed
               to fill, which is why the CDSL "Not needed" box went too. */
            ifsc ? (
              <View style={styles.ifscShow}>
                <Text style={styles.ifscK}>IFSC</Text>
                <Text style={styles.ifscV}>{ifsc}</Text>
              </View>
            ) : null
          ) : (
            <Field label="IFSC" value={ifsc} onChange={setIfsc} autoCapitalize="characters" placeholder="HDFC0001234" mono help={HELP.ifsc} error={E.ifsc} />
          )}
          <Field label="Address" value={address} onChange={setAddress} help={HELP.address} />
          {/* PINCODE FIRST, because it fills the two fields under it (operator
              ask on web 2026-10-20, carried to mobile 2026-10-26 - it was
              applied to one surface and never grepped for on the other).
              Asking for the city and then overwriting it a moment later is the
              form arguing with the person filling it in - and because the fill
              only touches what is EMPTY, a pincode asked for LAST could never
              fill anything at all. */}
          <Field label="Pincode" value={pincode} onChange={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} mono keyboard="number-pad"
            help={dirReady ? (pinNote ?? HELP.pincode) : HELP.pincodeTyped}
            /* An UNKNOWN pincode is an error, an AMBIGUOUS one is a note -
               web draws that line and mobile did not. Field renders error
               INSTEAD of help, so the two cannot stack. */
            error={dirReady && pinNote === ERR.pincodeUnknown ? pinNote : undefined} />
          {dirReady ? (
            <>
              <PickerField
                label="City"
                selectedLabel={city}
                placeholder="Search or type your city"
                freeText
                searchPlaceholder="City name…"
                help={HELP.city}
                /* SUGGESTIONS, not a closed list. A city the directory has
                   never heard of must still be enterable — the registrar
                   matches what the applicant’s BANK holds, not our import. */
                search={async (q, signal) => {
                  const rows = await searchCities(q, stateName || undefined, signal);
                  return rows.map((c) => ({ value: c.city, label: c.city, sub: c.state ?? undefined }));
                }}
                onPick={(o) => {
                  setCity(o?.label ?? '');
                  if (o?.sub && !stateName.trim()) setStateName(o.sub);
                }}
              />
              <PickerField
                label="State"
                selectedLabel={stateName}
                placeholder="Select a state"
                options={stateOptions}
                searchPlaceholder="State or UT…"
                help={HELP.state}
                onPick={(o) => setStateName(o?.label ?? '')}
              />
            </>
          ) : (
            <>
              <Field label="City" value={city} onChange={setCity} help={HELP.cityTyped} />
              <Field label="State" value={stateName} onChange={setStateName} help={HELP.stateTyped} />
            </>
          )}
          </>
          )}
        </Card>

        {!editing ? (
          <Pressable style={styles.consentRow} onPress={() => setConsent((c) => !c)}>
            <Switch
              value={consent}
              onValueChange={setConsent}
              trackColor={{ true: ui.indigo }}
              thumbColor="#ffffff"
            />
            <Text style={styles.consentTxt}>{t('profile.consent')}</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* sticky save bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={t('profile.save')} onPress={onSave} disabled={!valid} busy={saving} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  autoCapitalize?: 'none' | 'characters'; maxLength?: number; first?: boolean; mono?: boolean;
  keyboard?: 'default' | 'number-pad'; editable?: boolean;
  /* THE ERROR REPLACES THE HELP rather than stacking under it. Two lines of
     competing advice under one input is worse than either alone — by the
     time the help is wrong, what is wanted is the correction. */
  help?: string; error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const locked = props.editable === false;
  return (
    <>
      <Text style={[styles.label, props.first && { marginTop: 0 }]}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.mono && { fontVariant: ['tabular-nums'] }, focused && styles.inputOn, locked && { opacity: 0.55 }]}
        value={props.value}
        onChangeText={props.onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={props.placeholder}
        placeholderTextColor={ui.muted}
        autoCapitalize={props.autoCapitalize ?? 'words'}
        maxLength={props.maxLength}
        keyboardType={props.keyboard ?? 'default'}
        editable={!locked}
      />
      {props.error ? (
        <Text style={styles.fieldErr}>{props.error}</Text>
      ) : props.help ? (
        <Text style={styles.fieldHelp}>{props.help}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  note: { fontFamily: fonts.regular, color: ui.muted, fontSize: 13, lineHeight: 18 },
  hint: { fontFamily: fonts.regular, color: ui.muted, fontSize: 12.5, marginBottom: 4 },
  upiWarn: { fontFamily: fonts.semibold, fontWeight: '600', color: ui.red, fontSize: 12, marginTop: 2, lineHeight: 17 },
  // demat explainer
  dematNote: { fontFamily: fonts.regular, color: ui.muted, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  /* Sits under its input, pulled up against it — the gap below belongs to the
     NEXT label (`label` carries marginTop 16), so no margin is added here. */
  fieldHelp: { fontFamily: fonts.regular, color: ui.muted, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  fieldErr: { fontFamily: fonts.medium, fontWeight: '500', color: ui.red, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  /* The relationship control is not a `Field`, so it carries its own. */
  segHelp: { fontFamily: fonts.regular, color: ui.muted, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  /* A STATEMENT, not an input — see the note at the call site. */
  ifscShow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingVertical: 4 },
  ifscK: { ...microLabel, fontSize: 11 },
  ifscV: { fontSize: 14.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, fontVariant: ['tabular-nums'] },
  // split UPI input: name + handle picker
  upiWrap: { marginTop: 16 },
  upiLabel: { ...microLabel, fontSize: 11, marginBottom: 7 },
  upiRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  upiName: {
    flex: 1, height: 48, borderRadius: 12, paddingHorizontal: 14,
    backgroundColor: ui.canvas, borderWidth: 1, borderColor: ui.divider,
    fontFamily: fonts.semibold, fontWeight: '600', fontSize: 15, color: ui.title,
  },
  upiHandle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: ui.indigoTint, width: 124, justifyContent: 'center',
  },
  upiHandleTxt: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 14, color: ui.indigo, flexShrink: 1 },
  handleList: { marginTop: 8, borderRadius: 12, backgroundColor: ui.canvas, padding: 6 },
  handleSearch: {
    height: 38, borderRadius: 9, paddingHorizontal: 12, marginBottom: 6,
    backgroundColor: '#ffffff', fontFamily: fonts.medium, fontSize: 13.5, color: ui.title,
  },
  handleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  handleItem: { paddingHorizontal: 12, height: 34, borderRadius: 999, justifyContent: 'center', backgroundColor: '#ffffff' },
  handleItemOn: { backgroundColor: ui.indigo },
  handleTxt: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 13, color: ui.slate },
  handleTxtOn: { color: '#ffffff' },
  // optional-section checkbox
  optToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.6, borderColor: ui.divider,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff',
  },
  checkboxOn: { backgroundColor: ui.indigo, borderColor: ui.indigo },
  optToggleTxt: { flex: 1, fontFamily: fonts.semibold, fontWeight: '600', fontSize: 13, color: ui.body, lineHeight: 18 },
  label: { ...microLabel, fontSize: 11, marginTop: 16, marginBottom: 7 },
  input: {
    height: 48, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 15.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, backgroundColor: ui.canvas,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  inputOn: { borderColor: ui.indigo, backgroundColor: '#ffffff' },
  segs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seg: {
    paddingHorizontal: 14, minHeight: 40, borderRadius: 999,
    backgroundColor: ui.canvas, justifyContent: 'center',
  },
  segWide: { flexGrow: 1, alignItems: 'center' },
  segOn: { backgroundColor: ui.indigo },
  segTxt: { color: ui.slate, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600' },
  segTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, paddingHorizontal: 2 },
  consentTxt: { fontFamily: fonts.regular, flex: 1, color: ui.body, fontSize: 13, lineHeight: 18 },
  errorBanner: { backgroundColor: ui.redTint, borderRadius: 12, padding: 12, marginTop: 14 },
  error: { color: ui.red, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', lineHeight: 18 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: ui.divider,
    ...shadowCard,
  },
});
