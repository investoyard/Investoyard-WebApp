/**
 * Additional demat accounts on an applicant (2026-10-07).
 *
 * Kept beside `api.ts` rather than inside it only because that file is already
 * long; the conventions are its own — bearer token passed in, the server's own
 * message surfaced on failure rather than a generic one.
 *
 * Both routes return the WHOLE refreshed applicant, so the caller swaps one row
 * instead of merging a partial response into its own copy and then wondering
 * which is current.
 */
import type { ProfileView } from '@investoyard/shared-types';
import { API_BASE } from './api';

async function send(url: string, token: string, init: RequestInit): Promise<ProfileView> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    /* The API says why — "That demat account is already on this applicant", or
       the NSDL/CDSL format rule. A generic "could not save" would throw that
       away and leave the investor guessing at a fixable input. */
    let msg = `Could not save (HTTP ${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as ProfileView;
}

export const addDemat = (
  token: string,
  profileId: string,
  input: { depository: 'NSDL' | 'CDSL'; dpId?: string; clientId: string; label?: string },
): Promise<ProfileView> =>
  send(`${API_BASE}/profiles/${profileId}/demat`, token, { method: 'POST', body: JSON.stringify(input) });

/** Retire, never delete — a submitted bid names its demat to the exchange. */
export const retireDemat = (token: string, profileId: string, dematId: string): Promise<ProfileView> =>
  send(`${API_BASE}/profiles/${profileId}/demat/${dematId}`, token, { method: 'DELETE' });
