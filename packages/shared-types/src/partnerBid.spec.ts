import { bidWebhookEvent, checkPartnerBid, panBucketOf, type PartnerBidInput, type PartnerBidIpo } from './partnerBid';

/* An illustrative mainboard issue (NOT a stored record): lot 13, band ₹1,053–1,110, shareholder quota.
   One lot at the cap is ₹14,430, so retail tops out at 13 lots (₹1,87,590)
   and small-HNI starts at 14 (₹2,02,020). */
const JPL: PartnerBidIpo = { lotSize: 13, priceBandMin: 1053, priceBandMax: 1110, sme: false, reservations: ['shareholder'] };
/* An SME issue: lot 1,200 at ₹120 — ₹1,44,000 a lot, so the individual bid
   is exactly 2 lots (₹2,88,000) and small-HNI starts at 3. */
const SME: PartnerBidIpo = { lotSize: 1200, priceBandMin: 114, priceBandMax: 120, sme: true, reservations: [] };

const base: PartnerBidInput = {
  orderId: 'ORD-1', consentRef: 'C-1', fullName: 'Rakesh Kumar', pan: 'ABCDE1234F',
  depository: 'NSDL', dpId: 'IN301234', clientId: '12345678', upiId: 'rakesh@okhdfc',
  category: 'retail', lots: 1, atCutoff: true,
};
const problems = (b: PartnerBidInput, ipo = JPL) => {
  const r = checkPartnerBid(b, ipo);
  return r.ok ? [] : r.problems;
};

describe('checkPartnerBid — accepts', () => {
  it('a retail cut-off bid, and works out the amount at the cap', () => {
    const r = checkPartnerBid(base, JPL);
    expect(r).toEqual({ ok: true, terms: { category: 'retail', applicantType: 'individual', lots: 1, qty: 13, atCutoff: true, price: null, amount: 14430 } });
  });

  it('retail up to ₹2 lakh, small-HNI from just above it, up to the UPI cap', () => {
    expect(problems({ ...base, lots: 13 })).toEqual([]);
    expect(problems({ ...base, category: 'shni', lots: 14, atCutoff: false, price: 1110 })).toEqual([]);
    expect(problems({ ...base, category: 'shni', lots: 34, atCutoff: false, price: 1110 })).toEqual([]); // ₹4,90,620
  });

  it('a CDSL demat with no DP ID', () => {
    expect(problems({ ...base, depository: 'CDSL', dpId: '', clientId: '1203320012345678' })).toEqual([]);
  });

  it('an offered reserved quota', () => {
    expect(problems({ ...base, category: 'shareholder' })).toEqual([]);
  });

  it('an SME individual bid of exactly two lots, above ₹2 lakh', () => {
    expect(problems({ ...base, lots: 2 }, SME)).toEqual([]);
  });
});

describe('checkPartnerBid — refuses', () => {
  it('reports every problem at once, not the first', () => {
    const p = problems({ orderId: '', pan: 'XYZ', depository: 'NSDL', dpId: 'X', clientId: '1', upiId: 'nope', category: 'vip', lots: 0 });
    expect(p.length).toBeGreaterThanOrEqual(8);
  });

  it('a category that disagrees with the amount — never re-filed quietly', () => {
    expect(problems({ ...base, lots: 14 })[0]).toMatch(/retail bid may be at most ₹2,00,000/);
    const p = problems({ ...base, category: 'shni', lots: 13, atCutoff: false, price: 1110 });
    expect(p.some((m) => /must be above ₹2,00,000/.test(m))).toBe(true);
    expect(p.some((m) => /needs at least 14 lot/.test(m))).toBe(true);
  });

  it('anything above the ₹5 lakh UPI cap, and every big-HNI bid', () => {
    expect(problems({ ...base, category: 'shni', lots: 35, atCutoff: false, price: 1110 })[0]).toMatch(/capped at ₹5,00,000/);
    expect(problems({ ...base, category: 'bhni', lots: 70, atCutoff: false, price: 1110 })[0]).toMatch(/Use print forms/);
  });

  it('cut-off for an HNI', () => {
    expect(problems({ ...base, category: 'shni', lots: 14 })).toContain('Only a retail or reserved-quota bid may be placed at the cut-off price.');
  });

  it('a price outside the band', () => {
    expect(problems({ ...base, atCutoff: false, price: 1200 })[0]).toMatch(/within the price band, ₹1,053 to ₹1,110/);
    expect(problems({ ...base, atCutoff: false, price: undefined })[0]).toMatch(/price is required/);
  });

  it('a quota the issue does not offer', () => {
    expect(problems({ ...base, category: 'employee' })).toContain('This IPO does not offer a employee reservation.');
  });

  it('an SME individual bid that is not exactly the minimum', () => {
    expect(problems({ ...base, lots: 3 }, SME)[0]).toMatch(/exactly 2 lots/);
  });

  it('demat details in the wrong shape for their depository', () => {
    expect(problems({ ...base, dpId: '301234' })[0]).toMatch(/IN followed by six digits/);
    expect(problems({ ...base, depository: 'CDSL', clientId: '12345678' })[0]).toMatch(/sixteen-digit/);
  });

  it('an IPO with no price or lot yet', () => {
    expect(problems(base, { ...JPL, lotSize: null })[0]).toMatch(/no lot size or price/);
  });
});

describe('panBucketOf', () => {
  it('puts retail and HNI together and each reserved quota apart', () => {
    expect(panBucketOf('retail')).toBe('public');
    expect(panBucketOf('shni')).toBe('public');
    expect(panBucketOf('shareholder')).toBe('shareholder');
  });
});

describe('bidWebhookEvent', () => {
  it('maps the pipeline\'s own event rows', () => {
    expect(bidWebhookEvent('submitted', { queued: true })).toBe('bid.accepted');
    expect(bidWebhookEvent('mandate_pending', { opId: 'x', sent: true })).toBe('bid.sent');
    expect(bidWebhookEvent('upi_blocked')).toBe('bid.funds_blocked');
    expect(bidWebhookEvent('failed', { code: 'X' })).toBe('bid.rejected');
    expect(bidWebhookEvent('cancelled', { by: 'partner' })).toBe('bid.cancelled');
    expect(bidWebhookEvent('allotted')).toBe('bid.allotment');
    expect(bidWebhookEvent('released')).toBe('bid.refund');
  });

  it('does not report a modify that reached the exchange as the bid being sent again', () => {
    expect(bidWebhookEvent('mandate_pending', { action: 'modify', sent: true })).toBe('bid.status');
  });

  it('reports a refused modify or cancel as refused, whatever the status', () => {
    expect(bidWebhookEvent('upi_blocked', { action: 'cancel', refused: true })).toBe('bid.instruction_refused');
  });
});
