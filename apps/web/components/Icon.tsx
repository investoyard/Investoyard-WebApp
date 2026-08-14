import type { CSSProperties } from 'react';

type IconName =
  | 'search' | 'arrow-right' | 'external' | 'check' | 'star' | 'star-fill'
  | 'shield' | 'bolt' | 'calendar' | 'trending' | 'users' | 'doc' | 'file-pdf' | 'lock'
  | 'globe' | 'sparkle' | 'wallet' | 'chart' | 'clock' | 'share' | 'refresh'
  | 'eye' | 'eye-off' | 'moon' | 'sun' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'bell' | 'logout'
  | 'edit' | 'trash' | 'power' | 'plus' | 'key' | 'copy' | 'menu' | 'help' | 'dots'
  | 'home' | 'box' | 'list' | 'exchange' | 'rupee' | 'receipt' | 'bank' | 'layers'
  | 'settings' | 'x' | 'upload' | 'download' | 'filter' | 'sitemap' | 'dot'
  | 'user' | 'user-plus' | 'pie' | 'cursor';

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
  'file-pdf': <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><text x="12" y="17.5" textAnchor="middle" fontSize="6.2" fontWeight="700" fontFamily="Arial, sans-serif" fill="currentColor" stroke="none">PDF</text></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.3" fill="currentColor" stroke="none" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v5h-5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17.3 17.3 0 0 1-3.3 4M6.3 6.3A17.2 17.2 0 0 0 2 12s3.6 7 10 7a9.5 9.5 0 0 0 4-.9" /><path d="M9.6 9.6a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /><path d="M10 11v6M14 11v6" /></>,
  power: <><path d="M12 4v8" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3" /><path d="M16 7l3 3M18.5 4.5l2 2" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1 .9-1 1.7" /><path d="M12 17h.01" /></>,
  dots: <><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" /></>,
  home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /><path d="M10 20v-6h4v6" /></>,
  box: <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.1" fill="currentColor" stroke="none" /></>,
  exchange: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  rupee: <><circle cx="12" cy="12" r="9" /><path d="M9 8h6M9 11h6M14 8c0 2.4-1.7 3-4 3l4 5" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></>,
  bank: <><path d="M4 10h16M5 10 12 4l7 6M6 10v7M10 10v7M14 10v7M18 10v7M4 20h16" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 12a7.4 7.4 0 0 0-.1-1.4l2-1.5-2-3.5-2.4 1a7.3 7.3 0 0 0-2.4-1.4L14 2h-4l-.5 2.7A7.3 7.3 0 0 0 7.1 6.1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2.8l-2 1.5 2 3.5 2.4-1a7.3 7.3 0 0 0 2.4 1.4L10 22h4l.5-2.7a7.3 7.3 0 0 0 2.4-1.4l2.4 1 2-3.5-2-1.5c.06-.46.1-.92.1-1.4Z" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  download: <><path d="M12 4v12M8 12l4 4 4-4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4Z" />,
  sitemap: <><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3" y="17" width="6" height="4" rx="1" /><rect x="15" y="17" width="6" height="4" rx="1" /><path d="M12 7v5M6 17v-3h12v3" /></>,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  'user-plus': <><circle cx="9.5" cy="8" r="3.4" /><path d="M3.5 20a6 6 0 0 1 12 0" /><path d="M19 8v6M16 11h6" /></>,
  pie: <><path d="M12 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M14 3.3A9 9 0 0 1 20.7 10H14V3.3Z" /></>,
  cursor: <path d="M5 3l6 16 2.2-6.8L20 10 5 3Z" />,
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
