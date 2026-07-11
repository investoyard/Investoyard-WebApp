import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@investoyard/design-tokens';
import { useT } from '../../components/i18n';
import { useProfiles, Relationship } from '../../components/profiles';

const RELS: Relationship[] = ['self', 'spouse', 'child', 'parent', 'sibling', 'other'];

export default function NewProfileScreen() {
  const t = useT();
  const router = useRouter();
  const { addProfile } = useProfiles();

  const [relationship, setRelationship] = useState<Relationship>('self');
  const [fullName, setFullName] = useState('');
  const [pan, setPan] = useState('');
  const [depository, setDepository] = useState<'NSDL' | 'CDSL'>('NSDL');
  const [dpId, setDpId] = useState('');
  const [clientId, setClientId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = fullName.trim() && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) && dpId && clientId && consent;

  const onSave = () => {
    if (!valid) { setError(!consent ? 'Please give consent to continue' : 'Please complete all fields with a valid PAN'); return; }
    addProfile({ relationship, fullName: fullName.trim(), pan: pan.toUpperCase(), depository, dpId, clientId, upiId: upiId || undefined });
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>{t('profile.new')}</Text>
      <Text style={styles.note}>{t('profile.note')}</Text>

      <Text style={styles.label}>{t('profile.relationship')}</Text>
      <View style={styles.segs}>
        {RELS.map((r) => (
          <Pressable key={r} onPress={() => setRelationship(r)} style={[styles.seg, relationship === r && styles.segOn]}>
            <Text style={[styles.segTxt, relationship === r && styles.segTxtOn]}>{t(`rel.${r}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Field label={t('profile.fullName')} value={fullName} onChange={setFullName} />
      <Field label={t('profile.pan')} value={pan} onChange={setPan} autoCapitalize="characters" maxLength={10} />

      <Text style={styles.label}>{t('profile.depository')}</Text>
      <View style={styles.segs}>
        {(['NSDL', 'CDSL'] as const).map((d) => (
          <Pressable key={d} onPress={() => setDepository(d)} style={[styles.seg, depository === d && styles.segOn]}>
            <Text style={[styles.segTxt, depository === d && styles.segTxtOn]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <Field label={t('profile.dpId')} value={dpId} onChange={setDpId} />
      <Field label={t('profile.clientId')} value={clientId} onChange={setClientId} />
      <Field label={t('profile.upi')} value={upiId} onChange={setUpiId} placeholder="name@bank" autoCapitalize="none" />

      <View style={styles.consentRow}>
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand.primary }} />
        <Text style={styles.consentTxt}>{t('profile.consent')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.btn, !valid && styles.btnDisabled]} onPress={onSave}>
        <Text style={styles.btnText}>{t('profile.save')}</Text>
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
