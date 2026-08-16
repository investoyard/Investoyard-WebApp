/**
 * Bid-size controls — mobile twins of the web's finalized pickers, driven by the
 * shared bid engine (@investoyard/shared-types):
 *   ApplyBidPicker    — Apply/UPI flow: Retail | HNI | Shareholder tabs + fixed
 *                       list of lot options priced at the band ceiling
 *                       (retail/shareholder ≤ ₹2L · HNI ₹2L→UPI cap) + Min/Max
 *                       Retail & sHNI quick chips.
 *   PrintQuantityPicker — Print-Forms flow: preset tiles (Min/Max Retail, sHNI,
 *                       bHNI) + Custom tile (by amount in ₹ Cr with Below/Exact/
 *                       Above one-line rows, or by lots single strip) + optional
 *                       shareholder checkbox (≤ ₹2L).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { crToRupees, type BidEngine, type BidQuote } from '@investoyard/shared-types';
import { fonts, microLabel, ui } from '../lib/theme';
import { inr } from '../lib/format';
import { CheckIcon, ChevronRightIcon } from './ui/icons';

export type BidTab = 'retail' | 'hni' | 'sha';
export interface ApplyChoice { tab: BidTab; q: BidQuote }
export interface PrintChoice { q: BidQuote; sha: boolean }

export const applyTabLabel = (c: ApplyChoice) => (c.tab === 'sha' ? 'Shareholder' : c.tab === 'hni' ? 'HNI (sNII)' : 'Retail');
export const applyCategory = (c: ApplyChoice) => (c.tab === 'hni' ? (c.q.category === 'bhni' ? 'bNII' : 'sNII') : 'Retail');
export const printCatLabel = (c: PrintChoice) => (c.sha ? 'Shareholder' : c.q.category === 'retail' ? 'Retail' : c.q.category === 'shni' ? 'sHNI' : 'bHNI');
export const printCategory = (c: PrintChoice) => (c.q.category === 'retail' ? 'Retail' : c.q.category === 'shni' ? 'sNII' : 'bNII');

/** Form badge for a print choice (mirrors the server's template pick). */
export function printFormBadge(c: PrintChoice, isMainboard: boolean): { label: string; bg: string; color: string } {
  if (c.sha) return { label: 'Shareholder form', bg: ui.indigoTint, color: ui.indigo };
  if (!isMainboard) return { label: 'Application form', bg: ui.canvas, color: ui.muted };
  return c.q.formType === 'syndicate'
    ? { label: 'Syndicate form', bg: '#FFF4DC', color: '#8A6D1F' }
    : { label: 'Normal form', bg: ui.canvas, color: ui.muted };
}

/* ---------------------------------------------------------------- Apply picker */

export function ApplyBidPicker({ engine, choice, onChange, allowShareholder, symbol, compact }: {
  engine: BidEngine;
  choice: ApplyChoice;
  onChange: (c: ApplyChoice) => void;
  allowShareholder: boolean;
  symbol: string;
  compact?: boolean;
}) {
  const [listOpen, setListOpen] = useState(false);
  const options = choice.tab === 'hni' ? engine.hniUpiOptions() : engine.retailOptions();

  const tabs: { key: BidTab; label: string; hidden?: boolean }[] = [
    { key: 'retail', label: 'Retail' },
    { key: 'hni', label: 'HNI' },
    { key: 'sha', label: 'Shareholder', hidden: !allowShareholder },
  ];
  const switchTab = (t: BidTab) => {
    if (t === choice.tab) return;
    const opts = t === 'hni' ? engine.hniUpiOptions() : engine.retailOptions();
    const q0 = t === 'hni' ? opts[0] : (engine.presets.minRetail ?? opts[0]);
    if (q0) onChange({ tab: t, q: q0 });
    setListOpen(false);
  };
  const chips: { label: string; q: BidQuote | null; tab: BidTab; hidden?: boolean }[] = [
    { label: 'Min Retail', q: engine.presets.minRetail, tab: choice.tab === 'sha' ? 'sha' : 'retail' },
    { label: 'Max Retail', q: engine.presets.maxRetail, tab: choice.tab === 'sha' ? 'sha' : 'retail' },
    { label: 'sHNI', q: engine.presets.sHni, tab: 'hni', hidden: choice.tab === 'sha' || engine.presets.sHni.amount > engine.rules.upiCap },
  ];

  return (
    <View>
      {/* tabs + quick chips share one row (chips label-only) */}
      <View style={s.topRow}>
        <View style={s.tabs}>
          {tabs.filter((t) => !t.hidden).map((t) => {
            const on = choice.tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => switchTab(t.key)} style={[s.tab, compact && s.tabCompact, on && s.tabOn]}>
                <Text style={[s.tabTxt, compact && { fontSize: 11.5 }, on && s.tabTxtOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.chips}>
          {chips.filter((c) => !c.hidden && c.q).map((c) => {
            const on = choice.q.lots === c.q!.lots && ((c.tab === 'hni') === (choice.tab === 'hni'));
            return (
              <Pressable key={c.label} onPress={() => { onChange({ tab: c.tab, q: c.q! }); setListOpen(false); }} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {options.length === 0 ? (
        <Text style={s.warn}>
          {choice.tab === 'hni'
            ? `No HNI sizes fit under the ${inr(engine.rules.upiCap)} UPI-mandate cap for this lot size — use Print Forms (bank ASBA) instead.`
            : 'One lot already exceeds the ₹2,00,000 retail cap for this issue.'}
        </Text>
      ) : (
        <>
          {!compact && (
            <Text style={s.fieldHint}>
              Bid size · {choice.tab === 'hni' ? `${inr(engine.rules.retailCap)}–${inr(engine.rules.upiCap)} · no cut-off` : `up to ${inr(engine.rules.retailCap)}`} · shares × {inr(engine.price)} = total
            </Text>
          )}
          {/* select box → inline expanding options list */}
          <Pressable onPress={() => setListOpen((o) => !o)} style={s.select}>
            <Text style={s.selectTxt}>
              {choice.q.lots} {choice.q.lots === 1 ? 'lot' : 'lots'} — {choice.q.shares.toLocaleString('en-IN')} sh × ₹{engine.price} = {inr(choice.q.amount)}
            </Text>
            <View style={{ transform: [{ rotate: listOpen ? '-90deg' : '90deg' }] }}>
              <ChevronRightIcon size={15} color={ui.muted} strokeWidth={2.2} />
            </View>
          </Pressable>
          {listOpen && (
            <ScrollView style={s.optList} nestedScrollEnabled>
              {options.map((o) => {
                const on = o.lots === choice.q.lots;
                return (
                  <Pressable key={o.lots} onPress={() => { onChange({ ...choice, q: o }); setListOpen(false); }} style={[s.opt, on && s.optOn]}>
                    <Text style={[s.optTxt, on && s.optTxtOn]}>
                      {o.lots} {o.lots === 1 ? 'lot' : 'lots'} — {o.shares.toLocaleString('en-IN')} sh × ₹{engine.price} = {inr(o.amount)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </>
      )}

      {!compact && choice.tab === 'sha' && (
        <Text style={s.note}>Shareholder reserved quota — for existing shareholders of the parent/promoter company · max {inr(engine.rules.retailCap)}.</Text>
      )}
      {!compact && choice.tab === 'hni' && (
        <Text style={s.note}>
          HNI bids carry no cut-off — priced at the band ceiling. Above {inr(engine.rules.upiCap)} (UPI-mandate cap)? Use Print Forms for bank ASBA.
        </Text>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- Print picker */

export function PrintQuantityPicker({ engine, choice, onChange, allowShareholder, compact }: {
  engine: BidEngine;
  choice: PrintChoice;
  onChange: (c: PrintChoice) => void;
  allowShareholder: boolean;
  compact?: boolean;
}) {
  const [customOn, setCustomOn] = useState(false);
  const [mode, setMode] = useState<'amount' | 'lots'>('amount');
  const [crText, setCrText] = useState('');
  const [lotsText, setLotsText] = useState('');

  const { presets, rules } = engine;
  const setQuote = (q: BidQuote | null) => { if (q) onChange({ ...choice, q }); };
  const setSha = (sha: boolean) => {
    const q = sha && choice.q.amount > rules.retailCap ? (presets.maxRetail ?? choice.q) : choice.q;
    onChange({ sha, q });
  };
  const pickable = (q: BidQuote) => !(choice.sha && q.amount > rules.retailCap);

  const tiles: { key: string; label: string; q: BidQuote | null; hidden?: boolean }[] = [
    { key: 'minR', label: 'Min Retail', q: presets.minRetail },
    { key: 'maxR', label: 'Max Retail', q: presets.maxRetail },
    { key: 'shni', label: 'sHNI', q: presets.sHni, hidden: choice.sha },
    { key: 'bhni', label: 'bHNI', q: presets.bHni, hidden: choice.sha },
  ];

  const cr = parseFloat(crText);
  const suggestion = mode === 'amount' && Number.isFinite(cr) && cr > 0 ? engine.suggestByAmount(crToRupees(cr)) : null;
  const sugRows = suggestion
    ? ([['Below', suggestion.below], ['Exact', suggestion.exact], ['Above', suggestion.above]] as const).filter(([, q]) => q)
    : [];
  const lotsN = parseInt(lotsText, 10);
  const lotsQuote = mode === 'lots' && Number.isFinite(lotsN) && lotsN >= 1 ? engine.quote(lotsN) : null;

  return (
    <View>
      <View style={s.tiles}>
        {tiles.filter((t) => !t.hidden && t.q).map((t) => {
          const on = !customOn && choice.q.lots === t.q!.lots;
          return (
            <Pressable key={t.key} onPress={() => { setCustomOn(false); setQuote(t.q); }} style={[s.tile, compact && s.tileCompact, on && s.tileOn]}>
              <Text style={[s.tileT, on && { color: ui.indigo }]}>{t.label}</Text>
              <Text style={s.tileS}>{t.q!.lots.toLocaleString('en-IN')} {t.q!.lots === 1 ? 'lot' : 'lots'} · {inr(t.q!.amount)}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setCustomOn(true)} style={[s.tile, compact && s.tileCompact, customOn && s.tileOn]}>
          <Text style={[s.tileT, customOn && { color: ui.indigo }]}>Custom</Text>
          <Text style={s.tileS}>by amount / lots</Text>
        </Pressable>
      </View>

      {customOn && (
        <View style={{ marginTop: 12 }}>
          <View style={s.modes}>
            {(['amount', 'lots'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[s.mode, mode === m && s.modeOn]}>
                <Text style={[s.modeTxt, mode === m && { color: ui.indigo }]}>{m === 'amount' ? 'By amount (₹ Cr)' : 'By lots'}</Text>
              </Pressable>
            ))}
          </View>
          {mode === 'amount' ? (
            <View style={s.customRow}>
              <TextInput
                style={s.inputBox} inputMode="decimal" placeholder="e.g. 0.50 Cr" placeholderTextColor={ui.muted}
                value={crText} onChangeText={(v) => setCrText(v.replace(/[^\d.]/g, ''))}
              />
              <View style={{ flex: 1, minWidth: 210, gap: 6 }}>
                {sugRows.map(([tag, q]) => {
                  const on = choice.q.lots === q!.lots;
                  const dis = !pickable(q!);
                  return (
                    <Pressable key={tag} disabled={dis} onPress={() => setQuote(q!)} style={[s.sug, on && s.sugOn, dis && { opacity: 0.45 }]}>
                      <Text style={s.sugTag}>{tag}</Text>
                      <Text style={s.sugTxt}>{q!.lots.toLocaleString('en-IN')} lots · {q!.shares.toLocaleString('en-IN')} sh</Text>
                      <Text style={[s.sugAmt, on && { color: ui.indigo }]}>{inr(q!.amount)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={s.customRow}>
              <TextInput
                style={[s.inputBox, { minWidth: 90, maxWidth: 110 }]} inputMode="numeric" placeholder="Lots" placeholderTextColor={ui.muted}
                value={lotsText} onChangeText={(v) => setLotsText(v.replace(/\D/g, ''))}
              />
              {lotsQuote && (
                <Pressable disabled={!pickable(lotsQuote)} onPress={() => setQuote(lotsQuote)}
                  style={[s.sug, choice.q.lots === lotsQuote.lots && s.sugOn, !pickable(lotsQuote) && { opacity: 0.45 }, { flex: 1 }]}>
                  <Text style={s.sugTxt}>{lotsQuote.lots.toLocaleString('en-IN')} lots · {lotsQuote.shares.toLocaleString('en-IN')} sh</Text>
                  <Text style={[s.sugAmt, choice.q.lots === lotsQuote.lots && { color: ui.indigo }]}>{inr(lotsQuote.amount)}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {allowShareholder && (
        <Pressable onPress={() => setSha(!choice.sha)} style={s.shaRow}>
          <View style={[s.shaCheck, choice.sha && s.shaCheckOn]}>
            {choice.sha ? <CheckIcon size={12} color="#ffffff" strokeWidth={3} /> : null}
          </View>
          <Text style={s.shaTxt}>Shareholder category <Text style={{ color: ui.muted }}>(reserved quota · max ₹2,00,000)</Text></Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', backgroundColor: ui.canvas, borderRadius: 999, padding: 3, gap: 2 },
  tab: { paddingHorizontal: 14, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabCompact: { paddingHorizontal: 11, height: 26 },
  tabOn: { backgroundColor: '#ffffff', elevation: 2, shadowColor: '#1A1440', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  tabTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  tabTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, height: 26, borderRadius: 999, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: ui.indigo, backgroundColor: ui.indigoTint },
  chipTxt: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  chipTxtOn: { color: ui.indigo },
  fieldHint: { ...microLabel, fontSize: 10.5, marginTop: 12, marginBottom: 6, textTransform: 'none', letterSpacing: 0 },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 46, paddingHorizontal: 13, borderRadius: 12, backgroundColor: ui.canvas, marginTop: 2,
  },
  selectTxt: { flex: 1, fontSize: 13.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, fontVariant: ['tabular-nums'] },
  optList: { maxHeight: 250, marginTop: 6, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: ui.divider },
  opt: { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1, borderTopColor: ui.divider },
  optOn: { backgroundColor: ui.indigoTint },
  optTxt: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, fontVariant: ['tabular-nums'] },
  optTxtOn: { color: ui.indigo },
  warn: { marginTop: 12, fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: '#8A6D1F', backgroundColor: '#FFF4DC', borderRadius: 10, padding: 10, lineHeight: 18 },
  note: { marginTop: 8, fontSize: 11.5, fontFamily: fonts.regular, color: ui.muted, lineHeight: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '30%', borderRadius: 12, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#ffffff', paddingHorizontal: 11, paddingVertical: 9 },
  tileCompact: { paddingHorizontal: 9, paddingVertical: 7 },
  tileOn: { borderColor: ui.indigo, backgroundColor: ui.indigoTint },
  tileT: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  tileS: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  modes: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  mode: { paddingHorizontal: 12, height: 28, borderRadius: 999, backgroundColor: ui.canvas, alignItems: 'center', justifyContent: 'center' },
  modeOn: { backgroundColor: ui.indigoTint },
  modeTxt: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted },
  customRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  inputBox: {
    minWidth: 120, maxWidth: 140, height: 42, borderRadius: 12, paddingHorizontal: 12,
    backgroundColor: ui.canvas, fontSize: 14, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title,
  },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: ui.divider, backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sugOn: { borderColor: ui.indigo, backgroundColor: ui.indigoTint },
  sugTag: { fontSize: 10, fontFamily: fonts.bold, fontWeight: '700', color: ui.muted, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 38 },
  sugTxt: { flex: 1, fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, fontVariant: ['tabular-nums'] },
  sugAmt: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, fontVariant: ['tabular-nums'] },
  shaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 12 },
  shaCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D5D9E2', backgroundColor: ui.canvas, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  shaCheckOn: { backgroundColor: ui.indigo, borderColor: ui.indigo },
  shaTxt: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title, lineHeight: 18 },
});
