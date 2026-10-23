/**
 * A field that opens a searchable sheet — the phone's answer to web's
 * `SearchSelect` and `AsyncSearchSelect`.
 *
 * ONE COMPONENT FOR BOTH, because the difference between them is where the
 * options come from and nothing else: banks and states are a closed list held
 * in memory and filtered locally, branches and cities are a server query. Two
 * components would be two sets of selection, empty-state and keyboard
 * behaviour to keep in step, and this project has paid for that shape often
 * enough.
 *
 * THREE THINGS THE ASYNC PATH HAS TO GET RIGHT, all three learned on web:
 *
 *  1. A SLOW EARLY RESPONSE MUST NOT OVERWRITE A FAST LATER ONE. Typing "fort"
 *     fires f / fo / for / fort; every request carries a sequence number and
 *     the in-flight one is aborted, so the list can only ever show the answer
 *     to what is in the box.
 *
 *  2. "SEARCHING…" AND "NO MATCH" ARE DIFFERENT STATES. An empty list under an
 *     open request tells the reader their branch does not exist, which is the
 *     same `loaded`-flag distinction /subscription/v2 makes between "still
 *     fetching" and "not in the catalogue".
 *
 *  3. THE SELECTED LABEL CANNOT BE LOOKED UP FROM THE OPTIONS. They are fetched
 *     per query and thrown away, so the chosen label is held — and accepted
 *     from the caller for a value loaded off a saved profile.
 *
 * FREE TEXT is a mode, not a second component: a city the directory has never
 * heard of must still be enterable, because the registrar matches what the
 * applicant's BANK holds, not what we imported. A closed list there could make
 * a valid application impossible to submit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { fonts, microLabel, ui } from '../../lib/theme';
import { ChevronDownIcon, CheckIcon } from './icons';

export interface PickOption {
  /** Stable identity. For free-text values this is the text itself. */
  value: string;
  label: string;
  /** Second line — a branch's city, a city's state. */
  sub?: string;
  /** Section heading rendered ABOVE this row; see the note on `group`. */
  group?: string;
  /**
   * Anything the caller needs back on selection that is not the value — a
   * branch carries its IFSC here. It exists so `onPick` never has to parse
   * a figure back out of `label` or `sub`, which works until the day one of
   * them is reworded and then takes a city for a routing code.
   */
  meta?: Record<string, string>;
}

export function PickerField(props: {
  label: string;
  /** What the closed field shows. Held by the caller — see note 3. */
  selectedLabel?: string;
  placeholder?: string;
  /** Called with the chosen option, or null when the choice is cleared. */
  onPick: (opt: PickOption | null) => void;
  /** In-memory mode: the whole list, filtered here. */
  options?: PickOption[];
  /** Async mode: a server query. Takes a signal and may be aborted. */
  search?: (q: string, signal: AbortSignal) => Promise<PickOption[]>;
  /** Accept a value the list does not contain — see the free-text note. */
  freeText?: boolean;
  help?: string;
  error?: string | null;
  disabled?: boolean;
  /** Sheet title; defaults to the field label. */
  title?: string;
  searchPlaceholder?: string;
  first?: boolean;
}) {
  const {
    label, selectedLabel, placeholder, onPick, options, search,
    freeText, help, error, disabled, title, searchPlaceholder, first,
  } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PickOption[]>([]);
  /* `loaded` separates "no match" from "still looking" — see note 2. */
  const [loaded, setLoaded] = useState(true);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  /* BOTH ARE PASSED INLINE IN JSX, so each render hands this component a new
     function and a new array. Refs rather than dependencies: listing them in
     the effect below turned every response into the next request. */
  const searchRef = useRef(search);
  const optionsRef = useRef(options);
  searchRef.current = search;
  optionsRef.current = options;

  /* IN-MEMORY: filter locally, no debounce — there is nothing to wait for. */
  const localRows = useCallback((query: string) => {
    const all = optionsRef.current ?? [];
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter((o) => o.label.toLowerCase().includes(needle) || (o.sub ?? '').toLowerCase().includes(needle));
  }, []);

  /* What actually changes the answer: the query, whether the sheet is open,
     which mode this is, and — for an in-memory list — how many options there
     are, so a list that arrives after mount still populates. Counting rather
     than comparing identity is what keeps that from reintroducing the loop. */
  const isAsync = Boolean(search);
  const optionCount = options?.length ?? 0;

  useEffect(() => {
    if (!open) return;
    if (!isAsync) { setRows(localRows(q)); setLoaded(true); return; }

    /* DEBOUNCED at 250ms: at 1.82 lakh branches every keystroke is a database
       query, and the earlier ones are answers to a question already changed. */
    const mine = ++seq.current;
    setLoaded(false);
    const timer = setTimeout(() => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      searchRef.current!(q, ctl.signal)
        .then((r) => {
          /* Note 1: a response that is no longer the latest is DISCARDED, not
             rendered. Without this, "f" arriving after "fort" repaints the
             list with the wrong answer and nothing looks wrong. */
          if (mine !== seq.current) return;
          setRows(r);
          setLoaded(true);
        })
        .catch(() => { if (mine === seq.current) { setRows([]); setLoaded(true); } });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open, isAsync, optionCount, localRows]);

  /* Opening resets the query but NOT the selection: someone reopening to check
     what they picked should see the list, not an empty box over no results. */
  const openSheet = () => {
    if (disabled) return;
    setQ('');
    setRows(isAsync ? [] : localRows(''));
    setLoaded(!isAsync);
    setOpen(true);
  };

  const choose = (opt: PickOption) => {
    abort.current?.abort();
    setOpen(false);
    onPick(opt);
  };

  const typedIsNew = Boolean(
    freeText && q.trim() && !rows.some((r) => r.label.toLowerCase() === q.trim().toLowerCase()),
  );

  return (
    <>
      <Text style={[s.label, first && { marginTop: 0 }]}>{label}</Text>
      <Pressable
        onPress={openSheet}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${selectedLabel ?? placeholder ?? 'Not set'}`}
        style={({ pressed }) => [s.field, pressed && !disabled && { opacity: 0.8 }, disabled && { opacity: 0.55 }]}
      >
        <Text style={[s.fieldTxt, !selectedLabel && s.fieldPlaceholder]} numberOfLines={1}>
          {selectedLabel || placeholder || 'Select'}
        </Text>
        <ChevronDownIcon size={15} color={ui.muted} strokeWidth={2} />
      </Pressable>
      {error ? <Text style={s.err}>{error}</Text> : help ? <Text style={s.help}>{help}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={s.backdropTap} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheet}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>{title ?? label}</Text>
            <TextInput
              style={s.search}
              value={q}
              onChangeText={setQ}
              placeholder={searchPlaceholder ?? 'Search…'}
              placeholderTextColor={ui.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            {/* The typed value, offered as its own row ABOVE the matches. It is
                not mixed into them: "use what I typed" is a different action
                from "pick one of these". */}
            {typedIsNew ? (
              <Pressable
                onPress={() => choose({ value: q.trim(), label: q.trim() })}
                style={({ pressed }) => [s.row, s.rowTyped, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTxt}>{q.trim()}</Text>
                  <Text style={s.rowSub}>Use what I typed</Text>
                </View>
              </Pressable>
            ) : null}

            <FlatList
              data={rows}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              ListEmptyComponent={
                !loaded ? (
                  <View style={s.state}><ActivityIndicator color={ui.indigo} /><Text style={s.stateTxt}>Searching…</Text></View>
                ) : q.trim() || !isAsync ? (
                  <View style={s.state}>
                    <Text style={s.stateTxt}>
                      {isAsync && !q.trim() ? 'Type to search.' : `No match for “${q.trim()}”.`}
                    </Text>
                  </View>
                ) : (
                  <View style={s.state}><Text style={s.stateTxt}>Type to search.</Text></View>
                )
              }
              renderItem={({ item, index }) => {
                /* A heading is a SIBLING of the rows, never a row — anything
                   indexing the list would otherwise count it as an option. */
                const head = item.group && item.group !== rows[index - 1]?.group ? item.group : null;
                const on = selectedLabel === item.label;
                return (
                  <>
                    {head ? <Text style={s.group}>{head}</Text> : null}
                    <Pressable
                      onPress={() => choose(item)}
                      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTxt} numberOfLines={1}>{item.label}</Text>
                        {item.sub ? <Text style={s.rowSub} numberOfLines={1}>{item.sub}</Text> : null}
                      </View>
                      {on ? <CheckIcon size={15} color={ui.indigo} strokeWidth={2.5} /> : null}
                    </Pressable>
                  </>
                );
              }}
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  label: { ...microLabel, fontSize: 11, marginTop: 16, marginBottom: 7 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: ui.divider, borderRadius: 12,
    paddingHorizontal: 13, height: 46, backgroundColor: '#ffffff',
  },
  fieldTxt: { flex: 1, fontSize: 15, fontFamily: fonts.medium, fontWeight: '500', color: ui.title },
  fieldPlaceholder: { color: ui.muted, fontFamily: fonts.regular, fontWeight: '400' },
  help: { fontFamily: fonts.regular, color: ui.muted, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  err: { fontFamily: fonts.medium, fontWeight: '500', color: ui.red, fontSize: 11.5, lineHeight: 16, marginTop: 6 },

  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,27,0.45)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: ui.canvas, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, maxHeight: '78%',
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: ui.divider, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginBottom: 12 },
  search: {
    borderWidth: 1, borderColor: ui.divider, borderRadius: 12, paddingHorizontal: 13, height: 44,
    backgroundColor: '#ffffff', fontSize: 15, fontFamily: fonts.regular, color: ui.title, marginBottom: 8,
  },
  group: { ...microLabel, fontSize: 10, marginTop: 14, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ui.divider,
  },
  rowTyped: { borderBottomWidth: 1, borderBottomColor: ui.divider },
  rowTxt: { fontSize: 14.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.title },
  rowSub: { fontSize: 11.5, fontFamily: fonts.regular, color: ui.muted, marginTop: 2 },
  state: { paddingVertical: 26, alignItems: 'center', gap: 8 },
  stateTxt: { fontSize: 13, fontFamily: fonts.regular, color: ui.muted },
});
