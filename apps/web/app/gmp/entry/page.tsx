import { GmpEntryBoard } from '@/components/GmpEntryBoard';

export const metadata = {
  title: 'GMP Entry | Investoyard',
  // internal tool — keep it out of search results
  robots: { index: false, follow: false },
};

export default function GmpEntryPage() {
  return (
    <div className="container fade-up" style={{ paddingTop: 8 }}>
      <h1 style={{ marginBottom: 6 }}>GMP Entry</h1>
      <p className="lead-p" style={{ marginTop: 0 }}>
        Enter the grey-market premium for any open or upcoming IPO. Fill only the rows you know — the rest stay as they are.
      </p>
      <GmpEntryBoard />
    </div>
  );
}
