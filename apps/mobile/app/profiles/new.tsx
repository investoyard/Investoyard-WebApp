import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../../components/i18n';
import { useProfiles, Relationship } from '../../components/profiles';
import { getRelationships, RelationshipOption } from '../../lib/api';

/** Fallback when the relationships master can't be fetched (offline). */
const DEFAULT_OPTIONS: RelationshipOption[] = [
  { name: 'Self', allowMultiple: false }, { name: 'Spouse', allowMultiple: false },
  { name: 'Mother', allowMultiple: false }, { name: 'Father', allowMultiple: false },
  { name: 'Child', allowMultiple: true }, { name: 'Sibling', allowMultiple: true }, { name: 'Other', allowMultiple: true },
];

export default function NewProfileScreen() {
  const t = useT();
  const router = useRouter();
  const { addProfile, profiles } = useProfiles();

  // Options come from the admin-managed Relationships master; single-slot ones
  // (allowMultiple=false) already used on this account are hidden.
  const [opts, setOpts] = useState<RelationshipOption[]>(DEFAULT_OPTIONS);
  useEffect(() => { getRelationships().then((r) => { if (r?.length) setOpts(r); }).catch(() => {}); }, []);
  const taken = profiles.map((p) => String(p.relationship).toLowerCase());
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

  // Translated label when the i18n bundle knows the relation; else Capitalized name.
  const relLabel = (r: string) => { const k = `rel.${r}`; const v = t(k); return v === k ? r.charAt(0).toUpperCase() + r.slice(1) : v; };

  // NSDL: DP ID = IN + 6 digits, 8-digit client id. CDSL: one 16-digit demat number, no DP ID.
  const isCdsl = depository === 'CDSL';
  const dematOk = isCdsl ? /^\d{16}$/.test(clientId) : /^\d{6}$/.test(dpId) && /^\d{8}$/.test(clientId);
  const valid = fullName.trim() && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) && dematOk && consent;

  const onSave = async () => {
    if (!valid) {
      setError(!consent ? 'Please give consent to continue'
        : !dematOk ? (isCdsl ? 'CDSL demat number must be 16 digits' : 'NSDL: DP ID is IN + 6 digits, Client ID is 8 digits')
        : 'Please complete all fields with a valid PAN');
      return;
    }
    setSaving(true); setError(null);
    try {
      await addProfile({
        relationship, fullName: fullName.trim(), pan: pan.toUpperCase(), depository,
        dpId: isCdsl ? '' : `IN${dpId}`, clientId, upiId: upiId || undefined,
        bankName: bankName || undefined, branchName: branchName || undefined, bankAccount: bankAccount || undefined,
        ifsc: ifsc || undefined, address: address || undefined, city: city || undefined, state: stateName || undefined,
        pincode: pincode || undefined, email: email || undefined, mobile: mobile || undefined,
      });
      router.back();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not save this profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('profile.new')}</Text>
      <Text style={styles.note}>{t('profile.note')}</Text>

      <Text style={styles.label}>{t('profile.relationship')}</Text>
      <View style={styles.segs}>
        {options.map((r) => (
          <Pressable key={r} onPress={() => setRelationship(r)} style={[styles.seg, relationship === r && styles.segOn]}>
            <Text style={[styles.segTxt, relationship === r && styles.segTxtOn]}>{relLabel(r)}</Text>
          </Pressable>
        ))}
      </View>

      <Field label={t('profile.fullName')} value={fullName} onChange={setFullName} />
      <Field label={t('profile.pan')} value={pan} onChange={setPan} autoCapitalize="characters" maxLength={10} />

      <Text style={styles.label}>{t('profile.depository')}</Text>
      <View style={styles.segs}>
        {(['NSDL', 'CDSL'] as const).map((d) => (
          <Pressable key={d} onPress={() => { setDepository(d); setDpId(''); setClientId(''); }} style={[styles.seg, depository === d && styles.segOn]}>
            <Text style={[styles.segTxt, depository === d && styles.segTxtOn]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      {!isCdsl && (
        <Field label={`${t('profile.dpId')} — IN prefix is added automatically`} value={dpId}
          onChange={(v) => setDpId(v.replace(/\D/g, '').slice(0, 6))} placeholder="301234 (6 digits)" maxLength={6} />
      )}
      <Field label={isCdsl ? 'Demat number (16 digits)' : `${t('profile.clientId')} (8 digits)`} value={clientId}
        onChange={(v) => setClientId(v.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8))}
        placeholder={isCdsl ? '16-digit demat number' : '12345678'} maxLength={isCdsl ? 16 : 8} />
      <Field label={t('profile.upi')} value={upiId} onChange={setUpiId} placeholder="name@bank" autoCapitalize="none" />

      <Text style={[styles.label, { marginTop: 14, fontWeight: '700' }]}>Bank & contact (optional)</Text>
      <Text style={styles.note}>Used to pre-fill the printed ASBA form.</Text>
      <Field label="Mobile" value={mobile} onChange={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))} maxLength={10} placeholder="98XXXXXXXX" />
      <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" autoCapitalize="none" />
      <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="HDFC Bank" />
      <Field label="Branch name" value={branchName} onChange={setBranchName} placeholder="MG Road" />
      <Field label="Bank account no." value={bankAccount} onChange={setBankAccount} autoCapitalize="none" />
      <Field label="IFSC" value={ifsc} onChange={setIfsc} autoCapitalize="characters" placeholder="HDFC0001234" />
      <Field label="Address" value={address} onChange={setAddress} />
      <Field label="City" value={city} onChange={setCity} />
      <Field label="State" value={stateName} onChange={setStateName} />
      <Field label="Pincode" value={pincode} onChange={setPincode} maxLength={6} />

      <View style={styles.consentRow}>
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand.primary }} />
        <Text style={styles.consentTxt}>{t('profile.consent')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.btn, (!valid || saving) && styles.btnDisabled]} onPress={onSave} disabled={saving}>
        <Text style={styles.btnText}>{saving ? '…' : t('profile.save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'characters'; maxLength?: number }) {
  return (
    <>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input} value={props.value} onChangeText={props.onChange}
        placeholder={props.placeholder} autoCapitalize={props.autoCapitalize ?? 'words'} maxLength={props.maxLength}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 18, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  segs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seg: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 980, borderWidth: 1, borderColor: colors.border },
  segOn: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primarySoft },
  segTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  segTxtOn: { color: colors.brand.primary },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  consentTxt: { flex: 1, color: colors.text, fontSize: 13 },
  error: { color: colors.state.danger, marginTop: 14 },
  btn: { backgroundColor: colors.brand.primary, padding: 15, borderRadius: 980, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.brand.primaryInk, fontWeight: '600', fontSize: 16 },
});
