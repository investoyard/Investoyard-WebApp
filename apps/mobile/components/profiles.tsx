import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { listProfilesResult, createProfile, updateProfile, deleteProfile, type CreateProfileInput } from '../lib/api';
import type { FailureReason } from './ui/LoadFailure';
import type { ProfileView, DematAccountView } from '@investoyard/shared-types';

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

export interface ProfileRecord extends AsbaContact {
  id: string;                 // server UUID — sent to the rail as investorProfileId
  relationship: Relationship;
  fullName: string;
  pan: string;                // masked by the API (ABC****4F)
  depository: 'NSDL' | 'CDSL';
  dpId: string;
  clientId: string;
  /** Every demat on this applicant, default first — built by the API with
   *  dematAccountsFor(), the same list the apply picker reads. */
  demats?: DematAccountView[];
  upiId?: string;             // display flag only ('set' when a UPI is on file)
  hasBank?: boolean;          // display flag — bank account on file
  kycStatus?: 'unverified' | 'verified' | 'failed';
  /** true once any IPO application exists — PAN edits are then locked */
  hasApplications?: boolean;
}

type Ctx = {
  profiles: ProfileRecord[];
  loading: boolean;
  /**
   * WHY the list is empty, when it is empty because the read FAILED.
   *
   * Without this, every consumer reads `[]` as "this investor has no family":
   * the apply screen said *"no applicant — add one"* on an issue closing that
   * afternoon, and Account showed no count. A screen that can tell the two
   * apart renders `LoadFailure` instead, which is the point of U1.
   */
  failure: FailureReason | null;
  /** POST /profiles → PII vault. Throws on failure (e.g. duplicate PAN) so the form can show why. */
  addProfile: (rec: Omit<ProfileRecord, 'id'> & AsbaContact) => Promise<void>;
  /** PATCH /profiles/:id — omitted fields keep their values; secrets replace only when typed. */
  editProfile: (id: string, patch: Partial<CreateProfileInput>) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  refresh: () => void;
};

const ProfilesContext = createContext<Ctx>({
  profiles: [],
  loading: false,
  failure: null,
  addProfile: async () => {},
  editProfile: async () => {},
  removeProfile: async () => {},
  refresh: () => {},
});

function fromView(v: ProfileView): ProfileRecord {
  const x = v as any; // contact/bank prefill fields + hasApplications (newer API than shared-types dist)
  return {
    id: v.id,
    relationship: v.relationship,
    fullName: v.fullName,
    pan: v.pan,
    depository: v.depository,
    dpId: v.dpId,
    clientId: v.clientId,
    // carried through, or the picker would never appear
    demats: v.demats,
    upiId: v.hasUpi ? 'set' : undefined,
    hasBank: v.hasBank,
    kycStatus: v.kycStatus,
    ifsc: x.ifsc ?? undefined,
    bankName: x.bankName ?? undefined,
    branchName: x.branchName ?? undefined,
    address: x.address ?? undefined,
    city: x.city ?? undefined,
    state: x.state ?? undefined,
    pincode: x.pincode ?? undefined,
    email: x.email ?? undefined,
    mobile: x.mobile ?? undefined,
    hasApplications: !!x.hasApplications,
  };
}

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<FailureReason | null>(null);

  const refresh = useCallback(() => {
    if (!token) {
      /* Signed out is not a failure — it is the honest empty. */
      setProfiles([]);
      setFailure(null);
      return;
    }
    setLoading(true);
    listProfilesResult(token)
      .then((r) => {
        if (r.ok) {
          setProfiles(r.data.map(fromView));
          setFailure(null);
        } else {
          /* The rows already loaded are KEPT. A refresh that fails must not
             make a family vanish mid-apply; the screen shows a bar instead. */
          setFailure(r.reason);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Load (and clear on sign-out) whenever the token changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      profiles,
      failure,
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
      editProfile: async (id, patch) => {
        if (!token) throw new Error('Please sign in first');
        await updateProfile(token, id, patch);
        refresh();
      },
      removeProfile: async (id) => {
        if (!token) return;
        await deleteProfile(token, id);
        refresh();
      },
    }),
    [profiles, loading, failure, token, refresh],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export const useProfiles = () => useContext(ProfilesContext);

/** PAN mask: ABCDE1234F → ABC****4F. Idempotent on already-masked values. */
export function maskPan(pan: string): string {
  return pan.length <= 4 ? '****' : pan.slice(0, 3) + '****' + pan.slice(-2);
}
