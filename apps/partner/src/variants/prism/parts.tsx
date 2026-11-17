import type { ReactNode } from 'react';
import type { Tone } from '@/core/models';

/* Prism's small pieces. No hooks, so server and client components alike can use them. */

const P: Record<string, string> = {
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 13h2M12 13h2M16 13h0M8 17h2M12 17h2',
  chart: 'M4 20V14M10 20V9M16 20v-6M22 20V5M2 20h20',
  check: 'M8.5 12.5l2.5 2.5 5-5.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.6-4.6',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM8 8h.01',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  coins: 'M8 8c3.3 0 6-1.1 6-2.5S11.3 3 8 3 2 4.1 2 5.5 4.7 8 8 8zM2 5.5v4C2 10.9 4.7 12 8 12s6-1.1 6-2.5v-4M10 15.5c.6.3 1.3.5 2 .5 3.3 0 6-1.1 6-2.5v-4M14 11.6c3.1-.2 6 .8 6 2.4v4c0 1.4-2.7 2.5-6 2.5-2.4 0-4.5-.6-5.4-1.5',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  book: 'M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  hourglass: 'M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4',
  rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 15l-3-3c1-4 4-8 10-9 0 6-4 9-8 10zM14.5 9.5h.01M9 12l-2 1M12 15l-1 2',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  building: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M9 11h.01M15 11h.01',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  ext: 'M7 17L17 7M9 7h8v8',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  pie: 'M12 3v9h9M12 3a9 9 0 1 0 9 9',
  pct: 'M5 19L19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
};

export function Icon({ name, size = 20, stroke = 1.8 }: { name: keyof typeof P; size?: number; stroke?: number }) {
  return (
    <span className="p-ico" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"><path d={P[name]} /></svg>
    </span>
  );
}

export function Logo({ ipo, cls = '' }: { ipo: { logo: string | null; ini: string }; cls?: string }) {
  return ipo.logo ? <img className={`p-logo ${cls}`} src={ipo.logo} alt="" loading="lazy" /> : <span className={`p-ini ${cls}`} aria-hidden="true">{ipo.ini}</span>;
}

export const BoardTag = ({ board }: { board: string }) => <span className={`p-tag${board === 'SME' ? ' sme' : ''}`}>{board}</span>;

export function State({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`p-state ${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function Bar({ width }: { width: number }) {
  return <span className="p-bar" aria-hidden="true"><span style={{ width: `${Math.max(width, width > 0 ? 3 : 0)}%` }} /></span>;
}

/** The hero band: eyebrow (or icon title), headline with one word in the brand colour, subline, and the drawn motif. */
export function Hero({ eyebrow, icon, title, accent, after = '', sub }: { eyebrow?: string; icon?: keyof typeof P; title: string; accent?: string; after?: string; sub: string }) {
  return (
    <section className="p-hero">
      <div className="p-wrap p-hero-in">
        <div>
          {eyebrow ? <p className="p-eyebrow">{eyebrow}</p> : null}
          {icon ? (
            <div className="p-hero-title">
              <span className="p-tile"><Icon name={icon} size={30} /></span>
              <h1 style={{ marginTop: 0 }}>{title}{accent ? <> <em>{accent}</em></> : null}{after}</h1>
            </div>
          ) : (
            <h1>{title}{accent ? <> <em>{accent}</em></> : null}{after}</h1>
          )}
          <p>{sub}</p>
          {eyebrow ? <div className="p-hero-rule" aria-hidden="true" /> : null}
        </div>
        <HeroArt />
      </div>
    </section>
  );
}

/*
 * The hero motif, drawn rather than illustrated: faint candlesticks behind a
 * run of rising bars and a trend arrow, all in the partner's own colour, on a
 * gentle ground line. It recolours with the brand and stays sharp at any size.
 */
export function HeroArt() {
  const candles = [[18, 120, 150, 132, 142], [44, 110, 146, 118, 138], [70, 104, 136, 124, 112], [96, 96, 130, 102, 124], [122, 88, 124, 112, 96], [148, 80, 116, 88, 108], [174, 74, 110, 98, 82], [200, 66, 104, 72, 94], [226, 60, 98, 86, 66], [252, 52, 90, 58, 80]];
  const bars = [[300, 140], [342, 116], [384, 92], [426, 66], [468, 40]];
  return (
    <svg className="p-hero-art" viewBox="0 0 520 200" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="prBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="prGround" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--brand)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {candles.map(([x, hi, lo, a, b]) => {
        const top = Math.min(a, b);
        return (
          <g key={x} opacity="0.28" stroke="var(--brand)" fill="var(--brand)">
            <line x1={x} y1={hi} x2={x} y2={lo} strokeWidth="1.5" />
            <rect x={x - 5} y={top} width="10" height={Math.max(4, Math.abs(a - b))} rx="1.5" />
          </g>
        );
      })}
      {bars.map(([x, y]) => <rect key={x} x={x} y={y} width="30" height={176 - y} rx="7" fill="url(#prBar)" />)}
      <polyline points="250,150 320,118 370,128 440,70 500,32" fill="none" stroke="#f0a020" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M484 26 L506 24 L500 46" fill="none" stroke="#f0a020" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="0" y="176" width="520" height="3" rx="1.5" fill="url(#prGround)" />
    </svg>
  );
}

const PIE = [100, 70, 48, 30, 18];
/** Categorical shades of the partner colour for charts and legends. */
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${PIE[Math.min(i, PIE.length - 1)]}%, #ffffff)`;

/** A conic-gradient ring from parts that sum to 100. */
export const ring = (parts: number[]) => {
  let at = 0;
  const stops = parts.map((p, i) => { const s = `${shade(i)} ${at}% ${at + p}%`; at += p; return s; });
  return `conic-gradient(${stops.join(', ')}${at < 100 ? `, var(--line2) ${at}% 100%` : ''})`;
};

/* A dash for a missing multiple; the figure itself otherwise. */
export const xs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}×`);
