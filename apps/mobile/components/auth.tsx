import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { registerDevice } from '../lib/api';

const TOKEN_KEY = 'iy_token';
const DEVICE_KEY = 'iy_device_id';

/** Register this install's device for push (dev token; prod uses an Expo/FCM token). */
async function registerThisDevice(token: string) {
  try {
    let devId = await SecureStore.getItemAsync(DEVICE_KEY);
    if (!devId) { devId = 'expo-dev-' + Math.random().toString(36).slice(2, 12); await SecureStore.setItemAsync(DEVICE_KEY, devId); }
    await registerDevice(token, devId);
  } catch { /* best-effort */ }
}

type AuthCtx = { token: string | null; loading: boolean; signIn: (t: string) => void; signOut: () => void };
const AuthContext = createContext<AuthCtx>({ token: null, loading: true, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((t) => setToken(t ?? null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      token,
      loading,
      signIn: (t: string) => { setToken(t); void SecureStore.setItemAsync(TOKEN_KEY, t); void registerThisDevice(t); },
      signOut: () => { setToken(null); void SecureStore.deleteItemAsync(TOKEN_KEY); },
    }),
    [token, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
