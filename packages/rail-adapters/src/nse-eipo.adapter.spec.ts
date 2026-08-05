import { httpJson } from './http';
import { NseEipoAdapter } from './nse-eipo.adapter';
import { AuthSession, BidSubmission, MemberCredential } from './rail-adapter.types';

jest.mock('./http');
const mockedHttp = httpJson as jest.MockedFunction<typeof httpJson>;

const cred: MemberCredential = {
  id: 'cred1',
  exchange: 'NSE_EIPO',
  memberName: 'Axis',
  loginId: 'LOGIN1',
  memberCode: 'AXIS',
  password: 'secret',
  subBrokerCode: 'SB001',
  baseUrl: 'https://uat.example/eipo',
  env: 'uat',
};
const session: AuthSession = { token: 'tok', memberCode: 'AXIS', loginId: 'LOGIN1' };

const baseBid: BidSubmission = {
  clientRef: 'app_123',
  activity: 'new',
  symbol: 'ACME',
  category: 'IND',
  pan: 'ABCDE1234F',
  depository: 'NSDL',
  dpId: '12345678',
  clientBenId: '87654321',
  upi: 'rahul@upi',
  bids: [{ quantity: 142, atCutOff: true, amount: 14910 }],
};

beforeEach(() => mockedHttp.mockReset());

describe('NseEipoAdapter.submitBid payload', () => {
  it('builds a UPI member-login payload (upiFlag=Y, subBrokerCode, remark=clientRef)', async () => {
    mockedHttp.mockResolvedValue({ errorCode: '0', applicationNumber: 'APP1', bids: [{ bidId: 'B1' }] });
    const res = await new NseEipoAdapter().submitBid(baseBid, session, cred);

    expect(mockedHttp).toHaveBeenCalledTimes(1);
    const body: any = mockedHttp.mock.calls[0][1].body;
    expect(body.upiFlag).toBe('Y');
    expect(body.upi).toBe('rahul@upi');
    expect(body.subBrokerCode).toBe('SB001');
    expect(body.pan).toBe('ABCDE1234F');
    expect(body.bids[0]).toMatchObject({ activityType: 'new', quantity: 142, atCutOff: true, remark: 'app_123' });
    expect(body.bids[0].price).toBeUndefined(); // cut-off → no price

    expect(res).toMatchObject({ clientRef: 'app_123', ok: true, applicationNumber: 'APP1', bidIds: ['B1'] });
  });

  it('sends the session token in the "Access-Token" header (v1.20.6 Basic Security)', async () => {
    mockedHttp.mockResolvedValue({ status: 'success' });
    await new NseEipoAdapter().submitBid(baseBid, session, cred);
    const headers: any = mockedHttp.mock.calls[0][1].headers;
    expect(headers['Access-Token']).toBe('tok');
    expect(headers.Authorization).toBeUndefined();
  });

  it('treats the documented status:"success" response as ok and reads bidReferenceNumber', async () => {
    mockedHttp.mockResolvedValue({
      status: 'success',
      applicationNumber: 'APP9',
      bids: [{ activityType: 'new', bidReferenceNumber: 2015120100000382, status: 'success' }],
    });
    const res = await new NseEipoAdapter().submitBid(baseBid, session, cred);
    expect(res.ok).toBe(true);
    expect(res.applicationNumber).toBe('APP9');
    expect(res.bidIds).toEqual([2015120100000382]);
  });

  it('treats status:"failed" with reasonCode/reason as not ok', async () => {
    mockedHttp.mockResolvedValue({ status: 'failed', reasonCode: 14, reason: 'Invalid bid amount for category IND' });
    const res = await new NseEipoAdapter().submitBid(baseBid, session, cred);
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('14');
    expect(res.message).toBe('Invalid bid amount for category IND');
  });

  it('sets a price when not at cut-off, and upiFlag=N for bank ASBA', async () => {
    mockedHttp.mockResolvedValue({ errorCode: '0' });
    const bid: BidSubmission = {
      ...baseBid,
      upi: undefined,
      bankAccount: '000111222',
      ifsc: 'HDFC0001',
      bids: [{ quantity: 142, atCutOff: false, price: 104.5, amount: 14839 }],
    };
    await new NseEipoAdapter().submitBid(bid, session, cred);
    const body: any = mockedHttp.mock.calls[0][1].body;
    expect(body.upiFlag).toBe('N');
    expect(body.bankAccount).toBe('000111222');
    expect(body.bids[0].price).toBe(104.5);
  });

  it('rejects a bid with neither UPI nor bank account', async () => {
    const bad: BidSubmission = { ...baseBid, upi: undefined };
    await expect(new NseEipoAdapter().submitBid(bad, session, cred)).rejects.toThrow(/upi.*bankAccount/i);
  });

  it('flags an error response as not ok', async () => {
    mockedHttp.mockResolvedValue({ errorCode: '102', message: 'Invalid category' });
    const res = await new NseEipoAdapter().submitBid(baseBid, session, cred);
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('102');
    expect(res.message).toBe('Invalid category');
  });
});

describe('NseEipoAdapter.submitBidsBulk', () => {
  it('rejects more than 100 records', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...baseBid, clientRef: `a${i}` }));
    await expect(new NseEipoAdapter().submitBidsBulk(many, session, cred)).rejects.toThrow(/100/);
  });
});
