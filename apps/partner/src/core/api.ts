/*
 * The public API the BROWSER calls (allotment lookup, legal pages). The build
 * reads through API_INTERNAL_URL instead; this one is what a visitor's browser
 * can reach. The API allows a partner's own domain by its Tenant.customDomain,
 * so a partner site calls it directly.
 */
export const API = process.env.NEXT_PUBLIC_API_URL || 'https://newipoapi.finwave.co/api';
