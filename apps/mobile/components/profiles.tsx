import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { listProfiles, createProfile, deleteProfile } from '../lib/api';
import type { ProfileView } from '@investoyard/shared-types';

/** Admin-managed via Masters → Relationships; stored/compared lowercase. */
export type Relationship = string;

/** Optional bank/contact fields captured to prefill the printed ASBA form. */
export interface AsbaContact {
  bankName?: string;
  branchName?: string;
  bankAccount?: string;
  ifsc?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  mobile?: string;
}

export interface ProfileRecord {
  id: string;                 // server UUID — sent to the rail as investorProfileId
  relationship: Relationship;
  fullName: string;
  pan: string;                // masked by the API (ABC****4F)
  depository: 'NSDL' | 'CDSL';
  dpId: string;
  clientId: string;
  upiId?: string;             // display flag only ('set' when a UPI is on file)
}

type Ctx = {
  profiles: ProfileRecord[];
  loading: boolean;
  /** POST /profiles → PII vault. Throws on failure (e.g. duplicate PAN) so the form can show why. */
  addProfile: (rec: Omit<ProfileRecord, 'id'> & AsbaContact) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  refresh: () => void;
};

const ProfilesContext = createContext<Ctx>({
  profiles: [],
  loading: false,
  addProfile: async () => {},
  removeProfile: async () => {},
  refresh: () => {},
});

function fromView(v: ProfileView): ProfileRecord {
  return {
    id: v.id,
    relationship: v.relationship,
    fullName: v.fullName,
    pan: v.pan,
    depository: v.depository,
    dpId: v.dpId,
    clientId: v.clientId,
    upiId: v.hasUpi ? 'set' : undefined,
  };
}

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!token) {
      setProfiles([]);
      return;
    }
    setLoading(true);
    listProfiles(token)
      .then((rows) => setProfiles(rows.map(fromView)))
      .finally(() => setLoading(false));
  }, [token]);

  // Load (and clear on sign-out) whenever the token changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      profiles,
      loading,
      refresh,
      addProfile: async (rec) => {
        if (!token) throw new Error('Please sign in first');
        await createProfile(token, {
          relationship: rec.relationship,
          fullName: rec.fullName,
          pan: rec.pan,
          depository: rec.depository,
          dpId: rec.dpId,
          clientId: rec.clientId,
          upiId: rec.upiId, // raw name@bank from the form (not the display flag)
          bankName: rec.bankName,
          branchName: rec.branchName,
          bankAccount: rec.bankAccount,
          ifsc: rec.ifsc,
          address: rec.address,
          city: rec.city,
          state: rec.state,
          pincode: rec.pincode,
          email: rec.email,
          mobile: rec.mobile,
        });
        refresh();
      },
      removeProfile: async (id) => {
        if (!token) return;
        await deleteProfile(token, id);
        refresh();
      },
    }),
    [profiles, loading, token, refresh],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export const useProfiles = () => useContext(ProfilesContext);

/** PAN mask: ABCDE1234F → ABC****4F. Idempotent on already-masked values. */
export function maskPan(pan: string): string {
  return pan.length <= 4 ? '****' : pan.slice(0, 3) + '****' + pan.slice(-2);
}
