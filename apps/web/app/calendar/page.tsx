import { Suspense } from 'react';
import { IpoCalendar } from '@/components/IpoCalendar';

export const metadata = {
  title: 'IPO Calendar | Investoyard',
  description: 'Every IPO open, close, allotment and listing date in one calendar — Mainboard & SME.',
};

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <IpoCalendar />
    </Suspense>
  );
}
