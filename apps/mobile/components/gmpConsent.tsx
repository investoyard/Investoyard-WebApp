import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LABEL } from '@investoyard/shared-types';
import { fonts, ui } from '../lib/theme';
import { useAuth } from './auth';
import { grantConsent } from '../lib/api';
import { tapLight } from '../lib/haptics';

/**
 * THE GMP CONSENT GATE (QC C1).
 *
 * The acceptance flag used to be read in exactly ONE place - GmpDialog's own
 * mount check - so consent DISMISSED a modal rather than UNLOCKING anything,
 * and every figure (the card premium band, the Trends screen, the detail panel
 * and its sparkline) rendered unconditionally. Three ways that showed GMP to
 * someone who had never been given the disclaimer:
 *
 *   1. the dialog was mounted on Home ALONE, while the figures are on four
 *      screens;
 *   2. app.json sets `scheme: investoyard`, so expo-router's automatic linking
 *      makes `investoyard://gmp` mount the Trends screen WITHOUT Home - the
 *      dialog never runs, and because acceptance was what dismissed it rather
 *      than what revealed the numbers, such a reader was never shown it at all;
 *   3. even on Home the flag arrives asynchronously, so the first frame painted
 *      the premium band on every card with no modal over it.
 *
 * So consent now gates the VALUES. `ok` is three-state and callers withhold on
 * `null`: revealing a figure and retracting it is worse than one that arrives a
 * tick late - the same reasoning that makes the web footer wait for the host to
 * resolve before naming a legal operator.
 *
 * A context at the ROOT rather than a module store, matching AuthProvider, so
 * every screen under the stack shares one answer and accepting on one reveals
 * the rest without a remount.
 */

/** Bump when the DIALOG WORDING changes - a stored consent has to say which
 *  text it was given against, the rule the web notice versions already follow. */
export const GMP_CONSENT_VERSION = 'gmp-v2';
const KEY = `iy_gmp_consent_${GMP_CONSENT_VERSION}`;

type GmpCtx = {
  /** null while SecureStore is still answering. WITHHOLD on null. */
  ok: boolean | null;
  /** Open the operator's disclaimer. Figures stay hidden until it is accepted. */
  ask: () => void;
  /** Whether the disclaimer is currently open (the dialog reads this). */
  asking: boolean;
  /** Accept: store on-device, record server-side when signed in, reveal. */
  grant: () => void;
  /** Close WITHOUT accepting - figures stay withheld. */
  dismiss: () => void;
};

const Ctx = createContext<GmpCtx>({
  ok: null, ask: () => {}, asking: false, grant: () => {}, dismiss: () => {},
});

export function GmpConsentProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [ok, setOk] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(KEY)
      /* A read failure means NOT CONSENTED, never consented: the safe answer to
         "we cannot tell" is to keep the figures behind the disclaimer. */
      .then((v) => { if (live) setOk(!!v); })
      .catch(() => { if (live) setOk(false); });
    return () => { live = false; };
  }, []);

  const grant = useCallback(() => {
    setOk(true);
    setAsking(false);
    void SecureStore.setItemAsync(KEY, new Date().toISOString()).catch(() => {});
    if (token) void grantConsent(token, 'gmp_disclaimer', GMP_CONSENT_VERSION);
  }, [token]);

  const value = useMemo<GmpCtx>(() => ({
    ok,
    asking,
    ask: () => setAsking(true),
    dismiss: () => setAsking(false),
    grant,
  }), [ok, asking, grant]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useGmpConsent = () => useContext(Ctx);

/**
 * Wrap any GMP FIGURE in this. Before consent the reader gets a chip that opens
 * the operator's disclaimer; while the flag is still unknown they get nothing,
 * which is why `placeholder` exists for callers that need the row to keep its
 * height.
 *
 * The label is `LABEL.gmp` - "Exp. Premium" - not the letters GMP, because this
 * is a customer-facing surface and the vocabulary rule keeps GMP for the URL,
 * the SEO copy and the disclaimer that has to name the thing.
 */
export function GmpReveal({
  children, placeholder = null, compact = false,
}: { children: React.ReactNode; placeholder?: React.ReactNode; compact?: boolean }) {
  const { ok, ask } = useGmpConsent();
  if (ok === null) return <>{placeholder}</>;
  if (ok) return <>{children}</>;
  return (
    <View style={compact ? undefined : styles.wrap}>
      <Pressable
        hitSlop={{ top: 4, bottom: 4 }}
        onPress={() => { tapLight(); ask(); }}
        accessibilityRole="button"
        accessibilityLabel={`See ${LABEL.gmp}. Shows an unofficial grey-market figure after you read the disclaimer.`}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.chipTxt}>See {LABEL.gmp}</Text>
      </Pressable>
      {compact ? null : (
        <Text style={styles.note}>Unofficial · read the disclaimer first</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  /* minHeight 36 + 4dp of slop top and bottom reaches the 44dp target (QC A4). */
  chip: {
    alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: ui.slateTint, borderWidth: 1, borderColor: ui.divider,
  },
  chipTxt: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  note: { fontSize: 11, fontFamily: fonts.regular, color: ui.slate },
});
