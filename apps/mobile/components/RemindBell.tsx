/**
 * Set-reminder bell — subscribes the IPO to the server watchlist that drives
 * the hourly alert sweep (open · closing soon · allotment day · listing day).
 * ONE shared watchlist fetch per app session however many bells render
 * (mirrors apps/web/components/RemindButton.tsx). Signed-out taps go to login.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ui } from '../lib/theme';
import { addWatchlist, listWatchlist, removeWatchlist } from '../lib/api';
import { tapSelect } from '../lib/haptics';
import { useAuth } from './auth';
import { BellIcon } from './ui/icons';

let wlPromise: Promise<Set<string>> | null = null;
let wlToken: string | null = null;
function watchedIds(token: string): Promise<Set<string>> {
  if (!wlPromise || wlToken !== token) {
    wlToken = token;
    wlPromise = listWatchlist(token).then((rows) => new Set(rows.map((r) => r.ipoId))).catch(() => new Set<string>());
  }
  return wlPromise;
}

export function RemindBell({ ipoId, size = 15 }: { ipoId?: string; size?: number }) {
  const router = useRouter();
  const { token } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (token && ipoId) watchedIds(token).then((set) => { if (alive) setOn(set.has(ipoId)); });
    return () => { alive = false; };
  }, [token, ipoId]);

  if (!ipoId) return null; // demo/mock rows carry no live catalog id

  const toggle = async () => {
    if (!token) { router.push('/login'); return; }
    if (busy) return;
    tapSelect();
    setBusy(true);
    const next = !on;
    setOn(next); // optimistic
    const ok = next ? await addWatchlist(token, ipoId) : await removeWatchlist(token, ipoId);
    if (ok) (await watchedIds(token))[next ? 'add' : 'delete'](ipoId);
    else setOn(!next); // revert
    setBusy(false);
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Remove reminder' : 'Set reminder (open · close · allotment · listing)'}
      style={({ pressed }) => [styles.btn, on && styles.on, pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] }]}
    >
      <BellIcon size={size} color={on ? '#8A6400' : ui.muted} strokeWidth={on ? 2.3 : 1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: ui.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  on: { backgroundColor: '#FFF5D6' }, // gold tint — reminder armed
});
