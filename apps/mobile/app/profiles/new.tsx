import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, microLabel, shadowCard, ui } from '../../lib/theme';
import { useT } from '../../components/i18n';
import { useProfiles, Relationship } from '../../components/profiles';
import { getRelationships, getUpiHandles, RelationshipOption } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { Button } from '../../components/ui/Button';

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
  const [upiId, setUpiId] = useState('');
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
  // Allowed UPI handles (admin master) — a UPI ID saves only on a listed handle.
  const [upiHandles, setUpiHandles] = useState<string[]>([]);
  useEffect(() => { getUpiHandles().then(setUpiHandles); }, []);

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
  const valid = fullName.trim() && panOk && dematOk && upiOk && (editing ? true : consent);

  const onSave = async () => {
    if (!valid) {
      setError(!editing && !consent ? 'Please give consent to continue'
        : !dematOk ? (isCdsl ? 'CDSL demat number must be 16 digits' : 'NSDL: DP ID is IN + 6 digits, Client ID is 8 digits')
        : !upiFormatOk ? 'Enter the UPI ID as name@handle (e.g. name@okaxis)'
        : !upiHandleOk ? `@${upiId.split('@')[1] ?? ''} is not a supported UPI handle`
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
        </Card>

        <SectionTitle label="Identity" style={{ marginTop: 24 }} />
        <Card>
          <Field label={t('profile.fullName')} value={fullName} onChange={setFullName} first />
          <Field
            label={panLocked ? `${t('profile.pan')} — locked (has applications)` : t('profile.pan')}
            value={pan} onChange={setPan} autoCapitalize="characters" maxLength={10}
            placeholder={editing ? `${editing.pan} — type to change` : 'ABCDE1234F'}
            mono editable={!panLocked}
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

          {!isCdsl && (
            <Field label={`${t('profile.dpId')} — IN prefix is added automatically`} value={dpId}
              onChange={(v) => setDpId(v.replace(/\D/g, '').slice(0, 6))} placeholder="301234 (6 digits)" maxLength={6} mono keyboard="number-pad" />
          )}
          <Field label={isCdsl ? 'Demat number (16 digits)' : `${t('profile.clientId')} (8 digits)`} value={clientId}
            onChange={(v) => setClientId(v.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8))}
            placeholder={isCdsl ? '16-digit demat number' : '12345678'} maxLength={isCdsl ? 16 : 8} mono keyboard="number-pad" />
          <Field label={t('profile.upi')} value={upiId} onChange={setUpiId}
            placeholder={editing?.upiId ? 'saved ✓ — type to replace' : 'name@bank'} autoCapitalize="none" mono />
          {upiId && upiFormatOk && !upiHandleOk ? (
            <Text style={styles.upiWarn}>@{upiId.split('@')[1]} is not a supported UPI handle — allowed: {upiHandles.slice(0, 6).map((h) => `@${h}`).join(', ')}…</Text>
          ) : null}
        </Card>

        <SectionTitle label="Bank & contact" meta="optional" style={{ marginTop: 24 }} />
        <Card>
          <Text style={styles.hint}>Used to pre-fill the printed ASBA form.</Text>
          <Field label="Mobile" value={mobile} onChange={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))} maxLength={10} placeholder="98XXXXXXXX" mono keyboard="number-pad" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" autoCapitalize="none" />
          <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="HDFC Bank" />
          <Field label="Branch name" value={branchName} onChange={setBranchName} placeholder="MG Road" />
          <Field label="Bank account no." value={bankAccount} onChange={setBankAccount}
            placeholder={editing?.hasBank ? 'saved ✓ — type to replace' : undefined} autoCapitalize="none" mono />
          <Field label="IFSC" value={ifsc} onChange={setIfsc} autoCapitalize="characters" placeholder="HDFC0001234" mono />
          <Field label="Address" value={address} onChange={setAddress} />
          <Field label="City" value={city} onChange={setCity} />
          <Field label="State" value={stateName} onChange={setStateName} />
          <Field label="Pincode" value={pincode} onChange={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} mono keyboard="number-pad" />
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
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  note: { fontFamily: fonts.regular, color: ui.muted, fontSize: 13, lineHeight: 18 },
  hint: { fontFamily: fonts.regular, color: ui.muted, fontSize: 12.5, marginBottom: 4 },
  upiWarn: { fontFamily: fonts.semibold, fontWeight: '600', color: ui.red, fontSize: 12, marginTop: 2, lineHeight: 17 },
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
