/**
 * The applicant's demat accounts, and where another is added or retired.
 *
 * KEEP THIS IN STEP WITH `DematPanel` in `apps/web/components/Account.tsx` by
 * hand — different frameworks, no shared component, the same standing rule as
 * the split UPI input. The wording, the NSDL/CDSL field shapes and the "this
 * does not let you apply twice" line are deliberately identical.
 *
 * `p.demats` arrives built by the server (`dematAccountsFor`), default first, so
 * nothing here joins the profile's own columns to its extra rows. It is the same
 * list the apply picker shows.
 *
 * NO EDIT, deliberately: a submitted bid names its demat to the exchange, so
 * changing the identifiers under it would rewrite what a real application did.
 * A typo is retired and re-added; retiring never deletes.
 *
 * The DP ID is held as SIX DIGITS in state and prefixed `IN` on the way out,
 * which is what `app/profiles/new.tsx` already does — the two screens take the
 * same keystrokes for the same field.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { dematLabel } from '@investoyard/shared-types';
import { fonts, ui } from '../lib/theme';
import { useAuth } from './auth';
import { useProfiles, type ProfileRecord } from './profiles';
import { addDemat, retireDemat } from '../lib/demat-api';

export function DematPanel({ p }: { p: ProfileRecord }) {
  const { token } = useAuth();
  const { refresh } = useProfiles();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dep, setDep] = useState<'NSDL' | 'CDSL'>('NSDL');
  const [dpId, setDpId] = useState('');
  const [clientId, setClientId] = useState('');
  const [label, setLabel] = useState('');

  const list = p.demats ?? [];
  const isCdsl = dep === 'CDSL';
  const ready = isCdsl ? /^\d{16}$/.test(clientId) : /^\d{6}$/.test(dpId) && /^\d{8}$/.test(clientId);

  const reset = () => { setDep('NSDL'); setDpId(''); setClientId(''); setLabel(''); };

  const add = async () => {
    if (!token || !ready) return;
    setBusy('add'); setErr(null);
    try {
      // CDSL carries no DP ID — the 16-digit number is the whole identifier
      await addDemat(token, p.id, {
        depository: dep,
        dpId: isCdsl ? undefined : `IN${dpId}`,
        clientId,
        label: label.trim() || undefined,
      });
      await refresh();
      reset(); setOpen(false);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const retire = async (id: string) => {
    if (!token) return;
    setBusy(id); setErr(null);
    try { await retireDemat(token, p.id, id); await refresh(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>DEMAT ACCOUNTS ({list.length})</Text>
        {!open ? (
          <Pressable onPress={() => { setOpen(true); setErr(null); }} hitSlop={10}>
            <Text style={s.addLink}>+ Add another</Text>
          </Pressable>
        ) : null}
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}

      {list.map((d) => (
        <View key={d.id ?? 'default'} style={s.row}>
          <Text style={s.val} numberOfLines={1}>{dematLabel(d)}</Text>
          {d.isDefault ? (
            <Text style={s.defaultTag}>Default</Text>
          ) : busy === d.id ? (
            <ActivityIndicator size="small" color={ui.muted} />
          ) : (
            <Pressable onPress={() => retire(d.id!)} hitSlop={10}>
              <Text style={s.retire}>Retire</Text>
            </Pressable>
          )}
        </View>
      ))}

      {open ? (
        <View style={s.form}>
          <View style={s.seg}>
            {(['NSDL', 'CDSL'] as const).map((d) => (
              <Pressable
                key={d}
                onPress={() => { setDep(d); setDpId(''); setClientId(''); }}
                style={[s.segBtn, dep === d && s.segOn]}
              >
                <Text style={[s.segTxt, dep === d && s.segTxtOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          {!isCdsl ? (
            <View style={s.dpRow}>
              <View style={s.dpPrefix}><Text style={s.dpPrefixTxt}>IN</Text></View>
              <TextInput
                style={[s.input, s.dpInput]}
                value={dpId}
                maxLength={6}
                keyboardType="number-pad"
                placeholder="301234"
                placeholderTextColor={ui.muted}
                onChangeText={(t) => setDpId(t.replace(/\D/g, '').slice(0, 6))}
              />
            </View>
          ) : null}

          <TextInput
            style={s.input}
            value={clientId}
            keyboardType="number-pad"
            maxLength={isCdsl ? 16 : 8}
            placeholder={isCdsl ? 'Demat number (16 digits)' : 'Client ID (8 digits)'}
            placeholderTextColor={ui.muted}
            onChangeText={(t) => setClientId(t.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8))}
          />
          <TextInput
            style={s.input}
            value={label}
            maxLength={40}
            placeholder="Name it (optional) — e.g. Zerodha"
            placeholderTextColor={ui.muted}
            onChangeText={setLabel}
          />

          <View style={s.btnRow}>
            <Pressable
              onPress={add}
              disabled={!ready || busy === 'add'}
              style={[s.btn, (!ready || busy === 'add') && s.btnOff]}
            >
              <Text style={s.btnTxt}>{busy === 'add' ? 'Adding…' : 'Add demat'}</Text>
            </Pressable>
            <Pressable onPress={() => { setOpen(false); setErr(null); reset(); }} style={[s.btn, s.btnGhost]}>
              <Text style={[s.btnTxt, s.btnGhostTxt]}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={s.note}>
            Adding an account does not let this applicant apply twice — one application per PAN
            per IPO still holds. It only chooses where an allotment is credited.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: 0.5, color: ui.muted },
  addLink: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  err: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.red, marginTop: 8, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  val: {
    flex: 1, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600',
    color: ui.title, fontVariant: ['tabular-nums'],
  },
  defaultTag: { fontSize: 11, fontFamily: fonts.bold, fontWeight: '700', color: ui.muted },
  retire: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.red },
  form: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: ui.canvas, gap: 9 },
  seg: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: ui.divider },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: ui.card },
  segOn: { backgroundColor: ui.indigo },
  segTxt: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: ui.body },
  segTxtOn: { color: '#FFFFFF' },
  dpRow: { flexDirection: 'row', alignItems: 'stretch' },
  dpPrefix: {
    justifyContent: 'center', paddingHorizontal: 11,
    backgroundColor: ui.slateTint, borderWidth: 1, borderRightWidth: 0, borderColor: ui.divider,
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10,
  },
  dpPrefixTxt: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.muted },
  dpInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  input: {
    borderWidth: 1, borderColor: ui.divider, borderRadius: 10, backgroundColor: ui.card,
    paddingHorizontal: 11, paddingVertical: 10,
    fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title,
    fontVariant: ['tabular-nums'],
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: ui.indigo },
  btnOff: { opacity: 0.45 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: ui.divider },
  btnTxt: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: '#FFFFFF' },
  btnGhostTxt: { color: ui.body },
  note: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, lineHeight: 16 },
});
