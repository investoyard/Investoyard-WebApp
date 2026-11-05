/**
 * What a screen shows when a read FAILED, as opposed to coming back empty.
 *
 * The two are different statements and the app had been making the wrong one:
 * `listApplications` returned `[]` on a dead network, a 500 and an expired
 * session alike, and the Applied tab renders `[]` as *"Your first application
 * will show up here"* — telling an investor with money blocked that they had
 * never applied for anything, and inviting them to apply again.
 *
 * TWO SHAPES, because a failure means different things depending on whether
 * there is anything on screen already — which is two of the four states U1
 * asks for:
 *   `LoadFailure`     the first load failed and there is nothing to show
 *   `LoadFailureBar`  a REFRESH failed over data that is already rendered,
 *                     so the data stays and the bar says it may be stale
 *
 * A RETRY IS OFFERED ONLY WHERE A RETRY COULD WORK. An expired session fails
 * identically however many times it is tried, so `signedout` gets the sign-in
 * gate and no Retry — a button that can only fail is worse than no button,
 * the same rule that keeps the UPI-change action off a confirmed bid.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, ui } from '../../lib/theme';
import { LoginGate } from './LoginGate';
import { OfflineState } from './OfflineState';

export type FailureReason = 'unreachable' | 'signedout';

export function LoadFailure({ reason, onRetry }: { reason: FailureReason; onRetry?: () => void }) {
  if (reason === 'signedout') {
    return <LoginGate body="Your session has expired. Sign in again to pick up where you left off." />;
  }
  return <OfflineState onRetry={onRetry} />;
}

/**
 * The stale-data bar. It names what is wrong and what to do, never just that
 * something went wrong — the house rule for every error string on this
 * platform.
 */
export function LoadFailureBar({ reason, onRetry }: { reason: FailureReason; onRetry?: () => void }) {
  const router = useRouter();
  const signedOut = reason === 'signedout';
  return (
    <View style={[styles.bar, signedOut && styles.barOut]} accessibilityRole="alert">
      <View style={[styles.dot, signedOut && styles.dotOut]} />
      <Text style={styles.txt}>
        {signedOut
          ? 'Your session has expired, so this may be out of date.'
          : 'We could not reach Investoyard, so this may be out of date.'}
      </Text>
      <Pressable
        onPress={signedOut ? () => router.push('/login') : onRetry}
        accessibilityRole="button"
        accessibilityLabel={signedOut ? 'Sign in again' : 'Try loading again'}
        style={({ pressed }) => [styles.act, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.actTxt, signedOut && styles.actTxtOut]}>{signedOut ? 'Sign in' : 'Retry'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    /* minHeight, not height — A7: a raised font scale must grow the bar
       rather than clip the sentence inside it. */
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: ui.amberTint,
    marginBottom: 12,
  },
  barOut: { backgroundColor: ui.indigoTint },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ui.amber },
  dotOut: { backgroundColor: ui.indigo },
  txt: { flex: 1, fontFamily: fonts.semibold, fontWeight: '600', fontSize: 12, lineHeight: 17, color: ui.title },
  /* The label is the whole target and already clears 44dp with the bar's
     padding, so no hitSlop — which would reach into the bar's own row. */
  act: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, marginRight: -4 },
  actTxt: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 12, color: ui.amber },
  actTxtOut: { color: ui.indigo },
});
