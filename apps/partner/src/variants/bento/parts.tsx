import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tone } from '@/core/models';

/* Bento's small pieces. No hooks, so server and client components alike can use them. */

const P: Record<string, string> = {
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.6-4.6',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  hourglass: 'M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4',
  check: 'M8.5 12.5l2.5 2.5 5-5.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  chart: 'M4 20V14M10 20V9M16 20v-6M22 20V5M2 20h20',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM8 8h.01',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  coins: 'M8 8c3.3 0 6-1.1 6-2.5S11.3 3 8 3 2 4.1 2 5.5 4.7 8 8 8zM2 5.5v4C2 10.9 4.7 12 8 12s6-1.1 6-2.5v-4M14 11.6c3.1-.2 6 .8 6 2.4v4c0 1.4-2.7 2.5-6 2.5-2.4 0-4.5-.6-5.4-1.5',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14L7 21l5-3 5 3-1.5-7',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4',
  book: 'M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z',
  scale: 'M12 3v18M7 21h10M4 8h16M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0zM12 3l-3 2M12 3l3 2',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 15l-3-3c1-4 4-8 10-9 0 6-4 9-8 10zM14.5 9.5h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 18, stroke = 1.9 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg className="b-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>
  );
}

export const Arrow = () => <Icon name="arrow" size={16} stroke={2.1} />;

/** Status pill: open green, upcoming the partner colour, after bidding neutral. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`b-st ${tone}`}>{children}</span>;
}

export const Board = ({ board }: { board: string }) => <span className={`b-board${board === 'SME' ? ' sme' : ''}`}>{board}</span>;

export function Logo({ ipo, size = 'md' }: { ipo: { logo: string | null; ini: string }; size?: 'sm' | 'md' | 'lg' }) {
  const cls = `b-logo b-logo-${size}`;
  return ipo.logo ? <img className={cls} src={ipo.logo} alt="" loading="lazy" /> : <span className={`${cls} b-ini`} aria-hidden="true">{ipo.ini}</span>;
}

/* The SEBI convention: bidding opens 10:00 IST and closes 17:00 IST. The record holds dates only. */
export function targetOf(c: { tone: Tone; open: string; close: string }): { at: number; label: string } | null {
  if (c.tone === 'upcoming' && c.open) return { at: Date.parse(`${c.open}T10:00:00+05:30`), label: 'IPO opens in' };
  if (c.tone === 'open' && c.close) return { at: Date.parse(`${c.close}T17:00:00+05:30`), label: 'IPO closes in' };
  return null;
}

const SH = [100, 72, 50, 32, 20, 12];
/** Categorical shades of the partner colour, darkest first. */
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${SH[Math.min(i, SH.length - 1)]}%, #ffffff)`;

/** A conic-gradient ring from parts that sum to about 100. */
export const ring = (parts: number[]) => {
  let at = 0;
  const stops = parts.map((p, i) => { const s = `${shade(i)} ${at}% ${at + p}%`; at += p; return s; });
  return `conic-gradient(${stops.join(', ')}${at < 99.5 ? `, var(--line2) ${at}% 100%` : ''})`;
};

/** A heading with the design's brand bar. */
export function Ttl({ id, children, as = 'h2' }: { id?: string; children: ReactNode; as?: 'h2' | 'h3' }) {
  const T = as;
  return <T id={id} className="b-ttl">{children}</T>;
}

/** Page hero: soft wash, optional breadcrumb and eyebrow, a bold headline (one word may take the brand colour), a filled illustration. */
export function Hero({ eyebrow, title, accent, sub, art, crumb, children }: { eyebrow?: string; title: string; accent?: string; sub: string; art: Art; crumb?: string; children?: ReactNode }) {
  return (
    <section className="b-hero" aria-labelledby="b-hero-h">
      <div className="b-wrap b-hero-in">
        <div className="b-hero-copy">
          {crumb ? <p className="b-crumb"><Link href="/">Home</Link><Icon name="chevron" size={13} /><span>{crumb}</span></p> : null}
          {eyebrow ? <p className="b-eyebrow">{eyebrow}</p> : null}
          <h1 id="b-hero-h" className="b-h1">{title}{accent ? <> <em>{accent}</em></> : null}</h1>
          <p className="b-lede">{sub}</p>
        </div>
        <Art kind={art} />
      </div>
      {children ? <div className="b-wrap b-hero-foot">{children}</div> : null}
    </section>
  );
}

export type Art = 'exchange' | 'calendar' | 'clipboard' | 'chart';

/*
 * Filled illustrations in the partner's colour — soft, layered shapes rather
 * than Horizon's thin line drawings — after the reference's photographs but
 * never a copy of them. Every fill is a mix of --brand toward white, so the
 * picture recolours with each partner.
 */
export function Art({ kind, className = 'b-art' }: { kind: Art; className?: string }) {
  const c = (pct: number) => `color-mix(in srgb, var(--brand) ${pct}%, #ffffff)`;
  let body: ReactNode;
  if (kind === 'calendar') {
    body = (
      <>
        <ellipse cx="300" cy="206" rx="210" ry="14" fill={c(10)} />
        <circle cx="430" cy="70" r="46" fill={c(9)} />
        <path d="M150 196l38-150h236l38 150z" fill={c(14)} />
        <rect x="180" y="58" width="250" height="140" rx="12" fill="#fff" />
        <rect x="180" y="58" width="250" height="34" rx="12" fill={c(78)} />
        <rect x="180" y="80" width="250" height="12" fill={c(78)} />
        {Array.from({ length: 11 }, (_, i) => <rect key={i} x={196 + i * 21} y="46" width="8" height="24" rx="4" fill={c(55)} />)}
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5, 6].map((col) => <rect key={`${r}${col}`} x={194 + col * 33} y={104 + r * 22} width="22" height="13" rx="3" fill={c(r === 1 && col === 3 ? 90 : 16)} />))}
        <ellipse cx="300" cy="137" rx="30" ry="16" fill="none" stroke={c(90)} strokeWidth="2.5" transform="rotate(-12 300 137)" />
        <path d="M400 196l90-28 6 9-90 28z" fill={c(70)} />
        <path d="M490 168l14-4-8 13z" fill={c(40)} />
        <path d="M110 196c-4-36 6-62 26-74-2 30-10 54-26 74zM110 196c-20-24-40-30-58-26 8 20 30 30 58 26z" fill={c(36)} />
        <rect x="96" y="178" width="30" height="20" rx="4" fill={c(55)} />
      </>
    );
  } else if (kind === 'clipboard') {
    body = (
      <>
        <ellipse cx="300" cy="208" rx="200" ry="12" fill={c(10)} />
        <circle cx="240" cy="96" r="78" fill={c(8)} />
        {[[400, 120], [432, 96], [464, 72], [496, 48]].map(([x, y]) => <rect key={x} x={x} y={y} width="22" height={204 - y} rx="5" fill={c(x === 496 ? 60 : 24 + (x - 400) / 4)} />)}
        <g transform="rotate(-6 280 120)">
          <rect x="196" y="40" width="168" height="170" rx="14" fill={c(70)} />
          <rect x="208" y="52" width="144" height="150" rx="8" fill="#fff" />
          <rect x="244" y="30" width="72" height="24" rx="8" fill={c(85)} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="222" y={92 + i * 32} width="18" height="18" rx="4" fill={c(80)} />
              <path d={`M226 ${101 + i * 32}l4 4 7-8`} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="250" y={96 + i * 32} width="84" height="8" rx="4" fill={c(18)} />
            </g>
          ))}
          <rect x="222" y="66" width="80" height="12" rx="6" fill={c(30)} />
        </g>
        <circle cx="362" cy="170" r="32" fill={c(92)} />
        <path d="M348 170l10 10 18-20" stroke="var(--brand-on)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  } else if (kind === 'chart') {
    body = (
      <>
        <ellipse cx="300" cy="208" rx="210" ry="12" fill={c(10)} />
        <circle cx="400" cy="80" r="64" fill={c(8)} />
        <rect x="150" y="40" width="300" height="168" rx="16" fill="#fff" />
        <rect x="150" y="40" width="300" height="168" rx="16" fill="none" stroke={c(16)} strokeWidth="2" />
        <circle cx="176" cy="62" r="5" fill={c(40)} /><circle cx="192" cy="62" r="5" fill={c(25)} /><circle cx="208" cy="62" r="5" fill={c(15)} />
        {[[180, 150], [220, 128], [260, 140], [300, 108], [340, 116], [380, 84]].map(([x, y], i) => <rect key={x} x={x} y={y} width="26" height={190 - y} rx="5" fill={c(i === 5 ? 85 : 22 + i * 7)} />)}
        <path d="M184 132l40-22 40 12 40-34 40 8 40-30" stroke={c(95)} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="424" cy="66" r="7" fill={c(95)} />
        <rect x="462" y="120" width="70" height="80" rx="12" fill={c(70)} />
        <circle cx="497" cy="148" r="14" fill="#fff" fillOpacity="0.9" />
        <rect x="474" y="172" width="46" height="7" rx="3.5" fill="#fff" fillOpacity="0.8" />
      </>
    );
  } else {
    body = (
      <>
        <ellipse cx="320" cy="210" rx="220" ry="12" fill={c(10)} />
        <circle cx="420" cy="74" r="70" fill={c(8)} />
        {[[110, 120, 40], [160, 90, 34], [204, 134, 36], [500, 110, 34]].map(([x, y, w]) => <rect key={x} x={x} y={y} width={w} height={208 - y} rx="4" fill={c(14)} />)}
        <path d="M330 208V40c0-10 16-18 36-18s36 8 36 18v168z" fill={c(62)} />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="340" y={46 + i * 13} width="52" height="5" rx="2.5" fill="#fff" fillOpacity="0.5" />)}
        <path d="M226 208v-40c46-40 160-48 250-6v46z" fill={c(82)} />
        {[0, 1, 2].map((i) => <path key={i} d={`M232 ${184 + i * 9}c46-30 158-36 238-4`} stroke="#fff" strokeOpacity="0.45" strokeWidth="3" fill="none" />)}
        {[262, 300, 338, 376, 414, 452].map((x) => <rect key={x} x={x - 3} y="190" width="6" height="18" rx="2" fill="#fff" fillOpacity="0.55" />)}
        <path d="M120 96l40-14 32 10 40-30" stroke={c(80)} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="232" cy="62" r="5" fill={c(80)} />
      </>
    );
  }
  return (
    <svg className={className} viewBox="0 0 560 224" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">{body}</svg>
  );
}

type Day = { label: string; date: string; qib: number | null; nii: number | null; retail: number | null; employee: number | null; total: number | null };
const SERIES: { k: 'qib' | 'nii' | 'retail' | 'employee'; l: string }[] = [{ k: 'qib', l: 'QIB' }, { k: 'nii', l: 'NII' }, { k: 'retail', l: 'Retail' }, { k: 'employee', l: 'Employee' }];
const xs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);

/* Day-wise subscription as grouped bars, one group per bidding day. Times as recorded each day. */
export function DayBars({ days }: { days: Day[] }) {
  const series = SERIES.filter((s) => days.some((d) => d[s.k] != null));
  if (!days.length || !series.length) return <p className="b-none">No day-wise figures recorded for this issue.</p>;
  const W = 640, H = 260, L = 44, R = 10, T = 26, B = 30;
  const max = Math.max(...days.flatMap((d) => series.map((s) => d[s.k] ?? 0))) * 1.12 || 1;
  const gw = (W - L - R) / days.length;
  const bw = Math.min(30, (gw * 0.72) / series.length);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  return (
    <div>
      <ul className="b-legend-row">{series.map((s, i) => <li key={s.k}><i style={{ background: shade(i) }} />{s.l}</li>)}</ul>
      <svg className="b-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={days.map((d) => `${d.label}: ${series.map((s) => `${s.l} ${xs(d[s.k])}`).join(', ')}`).join('; ')}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="b-axis">{t < 10 ? t.toFixed(1) : Math.round(t)}×</text></g>)}
        {days.map((d, di) => {
          const x0 = L + di * gw + (gw - bw * series.length) / 2;
          return (
            <g key={d.label}>
              {series.map((s, si) => {
                const v = d[s.k];
                if (v == null) return null;
                return (
                  <g key={s.k}>
                    <rect x={x0 + si * bw + 1} y={y(v)} width={bw - 2} height={Math.max(1, H - B - y(v))} rx="3" fill={shade(si)} />
                    {bw >= 18 ? <text x={x0 + si * bw + bw / 2} y={y(v) - 5} textAnchor="middle" className="b-bar-v">{v < 10 ? v.toFixed(2) : v.toFixed(1)}</text> : null}
                  </g>
                );
              })}
              <text x={L + di * gw + gw / 2} y={H - 8} textAnchor="middle" className="b-axis b-axis-d">{d.label} · {d.date}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

