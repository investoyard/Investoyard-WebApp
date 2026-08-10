/**
 * Minimal stroke icon set drawn with react-native-svg (no icon packages).
 * 24×24 grid, round caps — consistent with the "calm & data-clear" system.
 */
import Svg, { Path, Circle } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function base(p: IconProps) {
  return {
    width: p.size ?? 24,
    height: p.size ?? 24,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
  };
}
function stroke(p: IconProps) {
  return {
    stroke: p.color ?? '#1d1d1f',
    strokeWidth: p.strokeWidth ?? 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function ShareIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M12 14.5V4.2" {...stroke(p)} />
      <Path d="M8.4 7.6 12 4l3.6 3.6" {...stroke(p)} />
      <Path d="M6.5 11.5H5.2v8.8h13.6v-8.8h-1.3" {...stroke(p)} />
    </Svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M3.5 10.6 12 3.8l8.5 6.8" {...stroke(p)} />
      <Path d="M5.8 9.6V20h12.4V9.6" {...stroke(p)} />
      <Path d="M9.8 20v-5.4h4.4V20" {...stroke(p)} />
    </Svg>
  );
}

export function DocsIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6.5 3.5h7.2L18.5 8v12.5h-12z" {...stroke(p)} />
      <Path d="M13.5 3.8V8.3h4.6" {...stroke(p)} />
      <Path d="M9.3 12.4h5.4M9.3 15.8h5.4" {...stroke(p)} />
    </Svg>
  );
}

export function UsersIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx={9} cy={8.2} r={3.1} {...stroke(p)} />
      <Path d="M3.6 19.4c.6-3.1 2.8-4.9 5.4-4.9s4.8 1.8 5.4 4.9" {...stroke(p)} />
      <Circle cx={16.6} cy={9.2} r={2.5} {...stroke(p)} />
      <Path d="M15.9 14.6c2.3.3 4 1.9 4.6 4.4" {...stroke(p)} />
    </Svg>
  );
}

export function GearIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4 7.3h9.2M17.2 7.3H20M4 12h3.2M11.2 12H20M4 16.7h9.2M17.2 16.7H20" {...stroke(p)} />
      <Circle cx={15.2} cy={7.3} r={2} {...stroke(p)} />
      <Circle cx={9.2} cy={12} r={2} {...stroke(p)} />
      <Circle cx={15.2} cy={16.7} r={2} {...stroke(p)} />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6.2 16v-5.4a5.8 5.8 0 1 1 11.6 0V16l1.6 2.6H4.6z" {...stroke(p)} />
      <Path d="M10.2 20.6a1.9 1.9 0 0 0 3.6 0" {...stroke(p)} />
    </Svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="m6.5 9.3 5.5 5.4 5.5-5.4" {...stroke(p)} />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="m9.3 6.5 5.4 5.5-5.4 5.5" {...stroke(p)} />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="m5 12.6 4.4 4.4L19 7.4" {...stroke(p)} />
    </Svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx={12} cy={12} r={8.2} {...stroke(p)} />
      <Path d="M12 7.6V12l3 2.2" {...stroke(p)} />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4.5 6.5h15v13.5h-15z" {...stroke(p)} />
      <Path d="M4.5 10.4h15M8.4 4v3.4M15.6 4v3.4" {...stroke(p)} />
    </Svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6.2 10.6h11.6V20H6.2z" {...stroke(p)} />
      <Path d="M8.4 10.4V8a3.6 3.6 0 1 1 7.2 0v2.4" {...stroke(p)} />
      <Circle cx={12} cy={15.2} r={1.2} fill={p.color ?? '#1d1d1f'} stroke="none" />
    </Svg>
  );
}

export function GlobeIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx={12} cy={12} r={8.4} {...stroke(p)} />
      <Path d="M3.8 12h16.4M12 3.6c-4.6 4.9-4.6 11.9 0 16.8 4.6-4.9 4.6-11.9 0-16.8Z" {...stroke(p)} />
    </Svg>
  );
}

export function SignOutIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M14.5 4.5H6v15h8.5" {...stroke(p)} />
      <Path d="M11 12h9.2M17 8.6l3.4 3.4L17 15.4" {...stroke(p)} />
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M12 3.6 5 6.2v5.4c0 4.4 2.9 7.5 7 8.8 4.1-1.3 7-4.4 7-8.8V6.2z" {...stroke(p)} />
      <Path d="m9 11.8 2.2 2.2 3.8-4" {...stroke(p)} />
    </Svg>
  );
}

/* ── Filled variants (active tab state) ─────────────────────────────────── */

export function HomeIconFill(p: IconProps) {
  const c = p.color ?? '#1d1d1f';
  return (
    <Svg {...base(p)}>
      <Path d="M12 3 3.2 10.1V20a1 1 0 0 0 1 1h5.3v-5.8h5v5.8h5.3a1 1 0 0 0 1-1v-9.9Z" fill={c} />
    </Svg>
  );
}

export function DocsIconFill(p: IconProps) {
  const c = p.color ?? '#1d1d1f';
  return (
    <Svg {...base(p)}>
      <Path d="M6 3h7.6L19 8.4V21H6z" fill={c} />
      <Path d="M9.3 12.4h5.4M9.3 15.8h5.4" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function UsersIconFill(p: IconProps) {
  const c = p.color ?? '#1d1d1f';
  return (
    <Svg {...base(p)}>
      <Circle cx={9} cy={8.2} r={3.4} fill={c} />
      <Path d="M2.9 20c.6-3.5 3.1-5.6 6.1-5.6s5.5 2.1 6.1 5.6z" fill={c} />
      <Circle cx={16.8} cy={9.2} r={2.6} fill={c} />
      <Path d="M15.6 14.7c2.6.4 4.5 2.1 5.1 4.8h-4.2a8.6 8.6 0 0 0-.9-4.8z" fill={c} />
    </Svg>
  );
}

export function GearIconFill(p: IconProps) {
  const c = p.color ?? '#1d1d1f';
  return (
    <Svg {...base(p)}>
      <Path d="M4 7.3h9.2M17.2 7.3H20M4 12h3.2M11.2 12H20M4 16.7h9.2M17.2 16.7H20" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={15.2} cy={7.3} r={2.4} fill={c} />
      <Circle cx={9.2} cy={12} r={2.4} fill={c} />
      <Circle cx={15.2} cy={16.7} r={2.4} fill={c} />
    </Svg>
  );
}
