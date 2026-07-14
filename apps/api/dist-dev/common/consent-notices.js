"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consentNoticeList = exports.CONSENT_NOTICES = void 0;
/**
 * Versioned consent notices (DPDP). The API owns the CURRENT version so bumping a
 * notice invalidates stale client copies without a redeploy: clients fetch the
 * version, show the (localised) text, and echo the version back when consenting.
 */
exports.CONSENT_NOTICES = {
    data_sharing_rail: {
        type: 'data_sharing_rail',
        version: 'ds-rail-v1',
        summary: 'Share your PAN, demat and bank/UPI details with the merchant banker and exchange rail to place and process this IPO application.',
    },
};
const consentNoticeList = () => Object.values(exports.CONSENT_NOTICES);
exports.consentNoticeList = consentNoticeList;
