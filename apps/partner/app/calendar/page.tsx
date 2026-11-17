import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { calendarModel } from '@/core/calendar';

export const metadata = { title: 'IPO calendar' };

export default async function Calendar() {
  return <variant.CalendarPage model={calendarModel(await loadIpos())} />;
}
