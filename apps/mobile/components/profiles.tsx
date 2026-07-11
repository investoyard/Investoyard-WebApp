import { createContext, useContext, useMemo, useState } from 'react';

export type Relationship = 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';

export interface ProfileRecord {
  id: string;
  relationship: Relationship;
  fullName: string;
  pan: string;            // stored locally for the demo; prod → vault via API
  depository: 'NSDL' | 'CDSL';
  dpId: string;
  clientId: string;
  upiId?: string;
}

type Ctx = {
  profiles: ProfileRecord[];
  addProfile: (rec: Omit<ProfileRecord, 'id'>) => void;
  removeProfile: (id: string) => void;
};

const ProfilesContext = createContext<Ctx>({ profiles: [], addProfile: () => {}, removeProfile: () => {} });

let counter = 0;

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  // TODO(prod): back with the API (POST /profiles → PII vault); restore on launch.
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const value = useMemo<Ctx>(
    () => ({
      profiles,
      addProfile: (rec) => setProfiles((p) => [...p, { ...rec, id: `p${++counter}` }]),
      removeProfile: (id) => setProfiles((p) => p.filter((x) => x.id !== id)),
    }),
    [profiles],
  );
  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export const useProfiles = () => useContext(ProfilesContext);

/** PAN mask: ABCDE1234F → ABC****4F */
export function maskPan(pan: string): string {
  return pan.length <= 4 ? '****' : pan.slice(0, 3) + '****' + pan.slice(-2);
}
