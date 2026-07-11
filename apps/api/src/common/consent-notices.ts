/**
 * Versioned consent notices (DPDP). The API owns the CURRENT version so bumping a
 * notice invalidates stale client copies without a redeploy: clients fetch the
 * version, show the (localised) text, and echo the version back when consenting.
 */
export const CONSENT_NOTICES = {
  data_sharing_rail: {
    type: 'data_sharing_rail',
    version: 'ds-rail-v1',
    summary:
      'Share your PAN, demat and bank/UPI details with the merchant banker and exchange rail to place and process this IPO application.',
  },
} as const;

export type ConsentNoticeType = keyof typeof CONSENT_NOTICES;

export const consentNoticeList = () => Object.values(CONSENT_NOTICES);
