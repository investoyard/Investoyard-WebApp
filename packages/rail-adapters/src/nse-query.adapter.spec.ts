import { httpJson } from './http';
import { NseQueryAdapter } from './nse-query.adapter';
import { MemberCredential } from './rail-adapter.types';

jest.mock('./http');
const mockedHttp = httpJson as jest.MockedFunction<typeof httpJson>;

const cred: MemberCredential = {
  id: 'cred1',
  exchange: 'NSE_EIPO',
  memberName: 'Axis',
  loginId: 'USER1',
  memberCode: 'M001',
  password: 'Pass@123',
  baseUrl: 'https://uat-ipo.nseindia.com/eipo',
  env: 'uat',
};

beforeEach(() => mockedHttp.mockReset());

describe('NseQueryAdapter auth + URLs', () => {
  it('builds the Basic header exactly as the doc example (member^loginid:password)', () => {
    // Doc: M001 / USER1 / Pass@123 → "Basic TTAwMV5VU0VSMTpQYXNzQDEyMw=="
    expect(new NseQueryAdapter().authHeader(cred)).toBe('Basic TTAwMV5VU0VSMTpQYXNzQDEyMw==');
  });

  it('calls /mktdata/v1/catwise/{symbol} on the derived Query Server base with Basic auth', async () => {
    mockedHttp.mockResolvedValue({ symbol: 'ACME', status: 'success', demand: [] });
    await new NseQueryAdapter().getCatwise('ACME', cred);
    const [url, opts] = mockedHttp.mock.calls[0];
    expect(url).toBe('https://uat-ipo.nseindia.com/eipo/mktdata/v1/catwise/ACME');
    expect(opts.method).toBe('GET');
    expect(opts.headers?.Authorization).toBe('Basic TTAwMV5VU0VSMTpQYXNzQDEyMw==');
  });
});

describe('NseQueryAdapter.getCatwise', () => {
  it('maps the doc sample rows (category/subCategory/quantity/bidCount)', async () => {
    mockedHttp.mockResolvedValue({
      symbol: 'TESTSYM01',
      status: 'success',
      demand: [
        { category: 'QIB', subCategory: 'FII', quantity: 200, bidCount: 2 },
        { category: 'RETAIL', subCategory: 'IND', quantity: 500, bidCount: 5 },
      ],
    });
    const rows = await new NseQueryAdapter().getCatwise('TESTSYM01', cred);
    expect(rows).toEqual([
      { category: 'QIB', subCategory: 'FII', quantity: 200, bidCount: 2 },
      { category: 'RETAIL', subCategory: 'IND', quantity: 500, bidCount: 5 },
    ]);
  });

  it('throws on a status:"failed" response', async () => {
    mockedHttp.mockResolvedValue({ symbol: 'X', status: 'failed', reason: 'Invalid Symbol' });
    await expect(new NseQueryAdapter().getCatwise('X', cred)).rejects.toThrow(/Invalid Symbol/);
  });
});

describe('NseQueryAdapter.getDemand', () => {
  it('maps price-point rows incl. the cut-off row without a price', async () => {
    mockedHttp.mockResolvedValue({
      symbol: 'TESTSYM01',
      status: 'success',
      demand: [
        { cutOffIndicator: true, absoluteQuantity: 100, cumulativeQuantity: 100, absoluteBidCount: 1, cumulativeBidCount: 1 },
        { cutOffIndicator: false, price: 121.0, absoluteQuantity: 200, cumulativeQuantity: 300 },
      ],
    });
    const rows = await new NseQueryAdapter().getDemand('TESTSYM01', cred);
    expect(rows[0]).toMatchObject({ cutOffIndicator: true, cumulativeQuantity: 100 });
    expect(rows[0].price).toBeUndefined();
    expect(rows[1]).toMatchObject({ cutOffIndicator: false, price: 121.0, cumulativeQuantity: 300 });
  });
});
