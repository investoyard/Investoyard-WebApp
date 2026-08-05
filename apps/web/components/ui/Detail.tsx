'use client';
import { Icon } from '@/components/Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

/** Key/value grid using the shared field styles. */
export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="form-grid">
      {items.map(([k, v]) => (
        <div className="field" key={k}><label>{k}</label><div className="dl-v">{v == null || v === '' ? '—' : v}</div></div>
      ))}
    </div>
  );
}

/** Empty-state block for a tab with no data yet. */
export function Empty({ icon = 'sparkle', title, sub }: { icon?: IconName; title: string; sub?: string }) {
  return (
    <div className="tab-empty">
      <span className="te-ic"><Icon name={icon} size={22} /></span>
      <div className="te-t">{title}</div>
      {sub && <div className="te-s">{sub}</div>}
    </div>
  );
}
