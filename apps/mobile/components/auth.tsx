import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { registerDevice } from '../lib/api';

const TOKEN_KEY = 'iy_token';
const MOBILE_KEY = 'iy_mobile';
const DEVICE_KEY = 'iy_device_id';

/** Register this install's device for push (dev token; prod uses an Expo/FCM token). */
async function registerThisDevice(token: string) {
  try {
    let devId = await SecureStore.getItemAsync(DEVICE_KEY);
    if (!devId) { devId = 'expo-dev-' + Math.random().toString(36).slice(2, 12); await SecureStore.setItemAsync(DEVICE_KEY, devId); }
    await registerDevice(token, devId);
  } catch { /* best-effort */ }
}

type AuthCtx = {
  token: string | null;
  /** 10-digit number this session signed in with (shown on Account/Profiles). */
  mobile: string | null;
  loading: boolean;
  signIn: (t: string, mobile?: string) => void;
  signOut: () => void;
};
const AuthContext = createContext<AuthCtx>({ token: null, mobile: null, loading: true, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [mobile, setMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(MOBILE_KEY)])
      .then(([t, m]) => { setToken(t ?? null); setMobile(m ?? null); })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      token,
      mobile,
      loading,
      signIn: (t: string, m?: string) => {
        setToken(t);
        void SecureStore.setItemAsync(TOKEN_KEY, t);
        if (m) { setMobile(m); void SecureStore.setItemAsync(MOBILE_KEY, m); }
        void registerThisDevice(t);
      },
      signOut: () => {
        setToken(null); setMobile(null);
        void SecureStore.deleteItemAsync(TOKEN_KEY);
        void SecureStore.deleteItemAsync(MOBILE_KEY);
      },
    }),
    [token, mobile, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
