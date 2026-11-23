import { partnerIpoDetails } from './partnerIpoDetails';

/** Shaped like a real record's `extra` (MAHACOAL as stored on 2026-11-23). */
const record = {
  faceValue: '2', sector: 'Energy & Natural Resources', industry: 'Coal Mining', mechanism: 'book_built', tickSize: '1',
  employeeDiscount: '6', retailDiscount: '', totalShares: '661836300',
  ofs: { basis: 'shares', value: 661836300 },
  openDate: '2026-11-19T10:00', closeDate: '2026-11-23T17:00', upiMandateCutoff: '2026-11-23T17:00',
  anchorDate: '2026-11-18T10:00', refundDate: '2026-11-25', dematDate: '2026-11-25',
  leads: ['SBI Capital Markets Limited', 'Axis Capital Limited', ''],
  sponsorBank: 'Axis Bank Limited and ICICI Bank Limited',
  registrarUrl: 'https://example.com/allotment', registrarEmail: '', registrarPhone: '040-0000',
  companyWebsite: 'https://www.example.com/', companyPromoter: 'Government of India',
  // ours — must never reach a partner
  pdfSeries: [{ from: '78067912', to: '78167910', kind: 'syndicate', member: 'Axis Capital Limited' }],
  onlineSeries: [], partners: [{ member: 'Axis Capital Limited' }],
  asbaNames: { resident: 'MCL.pdf' }, startBid: false, startPrint: true,
  shareResv: { qib: { pct: '42.5', source: 'exchange' } }, carveouts: { shareholder: '66183630' },
  totalSharesSource: 'derived', resvRemarks: 'internal note', categoryName: 'Mainboard', issueSizeCr: '9000.97',
  companyDescription: '<p>…</p>', companyFinancials: '<table>…</table>', contactInfo: '<p>…</p>', anchors: [{ name: 'X' }],
  gmpLog: [1], subLog: [1], applicationsReceived: '1200',
};

describe('partnerIpoDetails — only the details a partner needs', () => {
  const d = partnerIpoDetails(record) as Record<string, any>;

  it('never carries our operating data, page content or reporting keys', () => {
    const json = JSON.stringify(d);
    for (const k of ['pdfSeries', 'onlineSeries', 'partners', 'asbaNames', 'startBid', 'startPrint', 'shareResv', 'carveouts',
      'totalSharesSource', 'resvRemarks', 'companyDescription', 'companyFinancials', 'contactInfo', 'anchors', 'gmpLog', 'subLog', 'applicationsReceived']) {
      expect(d[k]).toBeUndefined();
    }
    expect(json).not.toContain('78067912');
    expect(json).not.toContain('MCL.pdf');
  });

  it('turns stored strings into numbers', () => {
    expect(d.faceValue).toBe(2);
    expect(d.tickSize).toBe(1);
    expect(d.totalShares).toBe(661836300);
    expect(d.discounts).toEqual({ employee: 6 });
  });

  it('gives the bidding times with the India offset and the other dates as days', () => {
    expect(d.biddingOpensAt).toBe('2026-11-19T10:00:00+05:30');
    expect(d.biddingClosesAt).toBe('2026-11-23T17:00:00+05:30');
    expect(d.upiMandateCutoff).toBe('2026-11-23T17:00:00+05:30');
    expect(d.anchorDate).toBe('2026-11-18');
    expect(d.refundDate).toBe('2026-11-25');
  });

  it('names the offer legs plainly, folding in the importer’s flat keys', () => {
    expect(d.offerForSale).toEqual({ basis: 'shares', value: 661836300 });
    expect(d.freshIssue).toBeUndefined();
    expect(partnerIpoDetails({ freshIssueShares: 4902000 }).freshIssue).toEqual({ basis: 'shares', value: 4902000 });
  });

  it('drops blanks rather than sending empty strings', () => {
    expect(d.leadManagers).toEqual(['SBI Capital Markets Limited', 'Axis Capital Limited']);
    expect(d.registrarContact).toEqual({ url: 'https://example.com/allotment', phone: '040-0000' });
    expect(partnerIpoDetails({ retailDiscount: '', registrarEmail: '' })).toEqual({});
  });

  it('is unchanged when a new key appears on the record', () => {
    expect(partnerIpoDetails({ ...record, someFutureKey: 'x', pdfSeries2: [1] })).toEqual(partnerIpoDetails(record));
  });

  it('survives a null extra', () => {
    expect(partnerIpoDetails(null)).toEqual({});
  });
});
