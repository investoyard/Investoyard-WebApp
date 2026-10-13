import { IpoArchive } from '@/components/IpoArchive';

export const metadata = {
  title: 'IPO Archive — Every Past Mainboard & SME IPO | Investoyard',
  description:
    'Browse every past IPO in India by year and month — offer price, lot size, issue size, subscription and listing gain for Mainboard and SME issues.',
};

export default function IpoArchivePage() {
  return (
    <div className="container fade-up" style={{ paddingTop: 8 }}>
      {/* the site's existing back-link pattern, same as the detail and news pages */}
      <a href="/#ipos" className="back-link">← All IPOs</a>
      <h1 style={{ marginBottom: 6, marginTop: 10 }}>IPO Archive</h1>
      <p className="lead-p" style={{ marginTop: 0 }}>
        Every issue that has closed or listed — filter by year, month and board. The
        {' '}<a className="linklike" href="/#ipos">main list</a> carries what&apos;s open now and the last six months.
      </p>
      <IpoArchive />
    </div>
  );
}
