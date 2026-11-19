/**
 * WHAT A PERSON AGREES TO WHEN THEY CREATE AN ACCOUNT — one entry per kind of
 * sign-up, each with the version that is stored on their consent record.
 *
 * A partner applying to distribute and an investor applying for IPOs agree to
 * different things, so they see different wording; and a stored consent must
 * say WHICH text it was given against (DPDP), so each wording carries its own
 * version. The web shows the text and the API stores the version from this one
 * table, so the two cannot drift. BUMP a version whenever its wording changes.
 */
export type SignupPurpose = 'client' | 'partner';

export const SIGNUP_PURPOSES: readonly SignupPurpose[] = ['client', 'partner'];

export interface SignupNotice {
  /** Stored on the consent record. */
  version: string;
  /** Stored as the consent's channel. */
  channel: string;
  /** The consent sentence that follows "I agree to the Terms and the Privacy Policy, and to Investoyard". */
  text: string;
}

export const SIGNUP_NOTICES: Readonly<Record<SignupPurpose, SignupNotice>> = Object.freeze({
  client: {
    version: 'service-v1',
    channel: 'signup',
    text: 'holding the details I enter so it can submit my IPO applications.',
  },
  partner: {
    version: 'partner-signup-v1',
    channel: 'partner-signup',
    text: 'holding the details I enter about me and my firm so it can review my partner application and contact me about it.',
  },
});

/** The notice for a purpose sent by a client; anything unrecognised is the ordinary client sign-up. */
export function signupNotice(purpose?: string | null): SignupNotice {
  return purpose === 'partner' ? SIGNUP_NOTICES.partner : SIGNUP_NOTICES.client;
}
