import { buildBidSubmission, BidSubmissionError, type BidSubmissionInput } from './build-bid-submission';

/**
 * Built from the sample request in NSE WEB API v1.20.5 `/v1/transactions/add`
 * (the UPI-flow example: upiFlag "Y", upi "9393939393@upi").
 */
const VALID: BidSubmissionInput = {
  activity: 'new',
  clientRef: 'IY-0001',
  symbol: 'TEST',
  category: 'IND',
  applicantName: 'Sumit Aggarwal',
  pan: 'AFAKA2323L',
  depository: 'NSDL',
  dpId: 'IN334455',
  clientId: '12345678',
  upi: '9393939393@upi',
  quantity: 100,
  atCutOff: false,
  price: 55.3,
};

const reason = (over: Partial<BidSubmissionInput>): string => {
  try { buildBidSubmission({ ...VALID, ...over }); return 'NO THROW'; }
  catch (e: any) { return e.message; }
};

describe('buildBidSubmission — the happy path', () => {
  it('maps to the contract the adapters actually post', () => {
    const r = buildBidSubmission(VALID);
    expect(r).toMatchObject({
      clientRef: 'IY-0001', activity: 'new', symbol: 'TEST', category: 'IND',
      applicantName: 'Sumit Aggarwal', pan: 'AFAKA2323L',
      depository: 'NSDL', dpId: 'IN334455',
      // `clientBenId`, NOT `clientId` — the old inline builder sent the wrong key
      clientBenId: '12345678',
      upi: '9393939393@upi',
    });
    // `bids` is an ARRAY. The old builder sent flat quantity/price, so
    // `toAddPayload`'s `req.bids.map` threw before anything was sent.
    expect(r.bids).toEqual([
      { quantity: 100, atCutOff: false, price: 55.3, amount: 5530, remark: 'IY-0001' },
    ]);
  });

  it('derives the amount from quantity × price', () => {
    expect(buildBidSubmission({ ...VALID, quantity: 3, price: 10.555 }).bids[0].amount).toBe(31.67);
  });

  it('takes a passed-in amount at cut-off, where the bid carries no price', () => {
    const r = buildBidSubmission({ ...VALID, atCutOff: true, price: null, amount: 14_999 });
    expect(r.bids[0]).toEqual({ quantity: 100, atCutOff: true, price: undefined, amount: 14_999, remark: 'IY-0001' });
  });

  it('accepts a CDSL applicant with no DP ID', () => {
    // CDSL's 16-digit client id IS the whole identifier.
    const r = buildBidSubmission({ ...VALID, depository: 'CDSL', dpId: '', clientId: '1234567890123456' });
    expect(r.clientBenId).toBe('1234567890123456');
    expect(r.dpId).toBe('');
  });

  it('normalises a lowercase PAN and trims whitespace', () => {
    expect(buildBidSubmission({ ...VALID, pan: '  afaka2323l ' }).pan).toBe('AFAKA2323L');
  });
});

describe('buildBidSubmission — what it refuses', () => {
  it('refuses a bid with no UPI and no bank account, naming the fix', () => {
    // THE one that mattered: the old builder never sent a UPI at all, so the
    // adapter threw on every bid and none could be placed.
    const m = reason({ upi: null });
    expect(m).toContain('no way to block the funds');
    expect(m).toContain('Add a UPI ID');
    expect(m).toContain('Sumit Aggarwal');
  });

  it('refuses a UPI that is not name@handle', () => {
    expect(reason({ upi: '9393939393' })).toContain('name@handle');
  });

  it('refuses an unresolved PAN rather than forwarding an empty string', () => {
    // An empty PAN is what a failed vault resolve looks like.
    expect(reason({ pan: '' })).toContain('could not be resolved from the vault');
  });

  it('refuses a malformed PAN and does not put the whole PAN in the message', () => {
    const m = reason({ pan: 'NOTAPAN123' });
    expect(m).toContain('not a valid PAN');
    expect(m).not.toContain('NOTAPAN123');
    expect(m).toContain('NO****23');
  });

  it('refuses a missing beneficiary id, and an NSDL bid with no DP ID', () => {
    expect(reason({ clientId: '' })).toContain('beneficiary id is missing');
    expect(reason({ dpId: '' })).toContain('NSDL demat needs a DP ID');
  });

  it('refuses a priced bid with no price, but allows cut-off without one', () => {
    expect(reason({ atCutOff: false, price: null })).toContain('needs a price');
    expect(reason({ atCutOff: true, price: null, amount: 1000 })).toBe('NO THROW');
  });

  it.each([0, -5, null, undefined])('refuses quantity %p', (quantity) => {
    expect(reason({ quantity: quantity as any })).toContain('quantity must be greater than zero');
  });

  it('refuses a zero amount at cut-off rather than sending 0', () => {
    expect(reason({ atCutOff: true, price: null, amount: null })).toContain('amount must be greater than zero');
  });

  it.each(['modify', 'cancel'] as const)('refuses a %s with no exchange bid reference', (activity) => {
    expect(reason({ activity })).toContain('needs the exchange bid reference');
  });

  it.each(['modify', 'cancel'] as const)('refuses a %s with no application number', (activity) => {
    expect(reason({ activity, bidReferenceNumber: 'ABCD' })).toContain('needs the application number');
  });

  it('accepts a modify that carries both', () => {
    const r = buildBidSubmission({
      ...VALID, activity: 'modify', bidReferenceNumber: 'ABCD', applicationNumber: '1200299929020',
    });
    expect(r.activity).toBe('modify');
    expect(r.bidReferenceNumber).toBe('ABCD');
  });

  it('refuses a missing symbol or category', () => {
    expect(reason({ symbol: '' })).toContain('IPO symbol is missing');
    expect(reason({ category: '' })).toContain('investor category is missing');
  });

  it('throws BidSubmissionError, so a caller can tell it from a network failure', () => {
    expect(() => buildBidSubmission({ ...VALID, upi: null })).toThrow(BidSubmissionError);
  });
});

describe('a UPI change is a modify that carries the new UPI', () => {
  it('sends the new UPI on the modify — it is an applicant-level field', () => {
    // Per the spec, `upi` sits beside pan/dpId on /transactions/add, not inside
    // the bid, so a modify restates it. That is what makes "change the UPI on a
    // placed bid" expressible at all.
    const r = buildBidSubmission({
      ...VALID,
      activity: 'modify',
      bidReferenceNumber: 'ABCD',
      applicationNumber: '1200299929020',
      upi: 'newhandle@okaxis',
    });
    expect(r.upi).toBe('newhandle@okaxis');
    expect(r.bids[0].quantity).toBe(100); // the bid itself is unchanged
  });
});
