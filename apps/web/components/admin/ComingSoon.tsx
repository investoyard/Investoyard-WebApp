'use client';
import { PageHead } from '@/components/ui/Form';
import { Icon } from '@/components/Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

/** On-brand placeholder for menu sections that are designed but not yet wired to live data. */
export function ComingSoon({ title, sub, icon = 'sparkle', points }: {
  title: string; sub?: string; icon?: IconName; points?: string[];
}) {
  return (
    <>
      <PageHead title={title} sub={sub ?? 'Part of the IPO console roadmap.'} />
      <div className="card coming-card">
        <div className="cs-badge"><Icon name={icon} size={26} /></div>
        <div className="cs-title">{title} — coming soon</div>
        <p className="cs-text">
          This screen is designed and sits in the menu so the console is complete end-to-end.
          Wiring it to live data is queued on the build roadmap.
        </p>
        {points && points.length > 0 && (
          <ul className="cs-list">{points.map((p) => <li key={p}><Icon name="check" size={15} /> {p}</li>)}</ul>
        )}
        <span className="st brand" style={{ marginTop: 6 }}>Planned</span>
      </div>
    </>
  );
}
