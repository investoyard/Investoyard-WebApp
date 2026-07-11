import type { CSSProperties } from 'react';

type IconName =
  | 'search' | 'arrow-right' | 'external' | 'check' | 'star' | 'star-fill'
  | 'shield' | 'bolt' | 'calendar' | 'trending' | 'users' | 'doc' | 'lock'
  | 'globe' | 'sparkle' | 'wallet' | 'chart' | 'clock' | 'share' | 'refresh';

const PATHS: Record<IconName, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></>,
  check: <path d="m20 6-11 11-5-5" />,
  star: <path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.9 6.1 22l1.2-6.5L2.5 9.9 9.1 9 12 3Z" />,
  'star-fill': <path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.9 6.1 22l1.2-6.5L2.5 9.9 9.1 9 12 3Z" fill="currentColor" stroke="none" />,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  trending: <><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-3-4.9" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.3" fill="currentColor" stroke="none" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v5h-5" /></>,
};

export function Icon({ name, size = 18, style, strokeWidth = 1.75 }: {
  name: IconName; size?: number; style?: CSSProperties; strokeWidth?: number;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
