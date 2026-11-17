import type { ReactNode } from 'react';
import type { Tone } from '@/core/models';

/* Horizon's small pieces. No hooks, so server and client components alike can use them; the live countdown lives in Countdown.tsx. */

const P: Record<string, string> = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.6-4.6',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M8.5 12.5l2.5 2.5 5-5.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  candles: 'M6 4v3M6 15v5M18 3v4M18 13v7M12 8v2M12 17v3M4 7h4v8H4zM16 7h4v6h-4zM10 10h4v7h-4z',
  building: 'M4 21h16M6 21V8l6-4 6 4v13M9.5 21v-5h5v5M9.5 11h.01M14.5 11h.01',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM8 8h.01',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  ext: 'M7 17L17 7M9 7h8v8',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  chart: 'M4 20V14M10 20V9M16 20v-6M22 20V5M2 20h20',
  pie: 'M12 3v9h9M12 3a9 9 0 1 0 9 9',
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  book: 'M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z',
  rupee: 'M7 4h10M7 8h10M14 20L8 13h2a4 4 0 0 0 0-8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  laptop: 'M5 5h14a1 1 0 0 1 1 1v10H4V6a1 1 0 0 1 1-1zM2 19h20',
  rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 15l-3-3c1-4 4-8 10-9 0 6-4 9-8 10zM14.5 9.5h.01',
  coins: 'M8 8c3.3 0 6-1.1 6-2.5S11.3 3 8 3 2 4.1 2 5.5 4.7 8 8 8zM2 5.5v4C2 10.9 4.7 12 8 12s6-1.1 6-2.5v-4M14 11.6c3.1-.2 6 .8 6 2.4v4c0 1.4-2.7 2.5-6 2.5-2.4 0-4.5-.6-5.4-1.5',
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 18, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg className="h-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>
  );
}

export const Arrow = () => <Icon name="arrow" size={15} stroke={2} />;
export const ExtIcon = () => <Icon name="ext" size={14} stroke={2} />;

/** A status pill. Open is green, upcoming the partner colour, anything after bidding neutral. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`h-st ${tone}`}>{children}</span>;
}

export const Board = ({ board }: { board: string }) => <span className={`h-board${board === 'SME' ? ' sme' : ''}`}>{board}</span>;

export function Logo({ ipo, size = 'md' }: { ipo: { logo: string | null; ini: string }; size?: 'sm' | 'md' | 'lg' }) {
  const cls = `h-logo h-logo-${size}`;
  return ipo.logo ? <img className={cls} src={ipo.logo} alt="" loading="lazy" /> : <span className={`${cls} h-ini`} aria-hidden="true">{ipo.ini}</span>;
}

/*
 * The moment a countdown points at. An Indian issue opens at 10:00 IST and
 * closes at 17:00 IST by SEBI convention — stated as such on the page, so the
 * clock never claims an hour the record does not carry.
 */
export function targetOf(c: { tone: Tone; open: string; close: string }): { at: number; label: string } | null {
  if (c.tone === 'upcoming' && c.open) return { at: Date.parse(`${c.open}T10:00:00+05:30`), label: 'IPO opens in' };
  if (c.tone === 'open' && c.close) return { at: Date.parse(`${c.close}T17:00:00+05:30`), label: 'IPO closes in' };
  return null;
}

const SH = [100, 74, 54, 38, 26, 17, 10];
/** Categorical shades of the partner colour, mixed toward white. */
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${SH[Math.min(i, SH.length - 1)]}%, #ffffff)`;

/** The page hero: a soft partner-coloured wash, an eyebrow with a short rule, a serif headline, and drawn line art on the right. */
export function Hero({ eyebrow, title, sub, art = 'exchange', children }: { eyebrow: string; title: string; sub: string; art?: Art; children?: ReactNode }) {
  return (
    <section className="h-hero" aria-labelledby="h-hero-h">
      <div className="h-wrap h-hero-in">
        <div className="h-hero-copy">
          <p className="h-eyebrow">{eyebrow}</p>
          <h1 id="h-hero-h" className="h-h1">{title}</h1>
          <p className="h-lede">{sub}</p>
          {children}
        </div>
        <HeroArt kind={art} />
      </div>
    </section>
  );
}

type Art = 'exchange' | 'tower' | 'checker';

/*
 * Drawn line art in the partner's colour, after the reference's photographs
 * (an exchange building, a tower, a laptop with a tick) but never a copy of
 * them: thin strokes over white fills so shapes overlap cleanly, a faint
 * skyline behind, and a fade on the left so it sits under the text rather
 * than beside it. It recolours with every partner and stays sharp.
 */
export function HeroArt({ kind }: { kind: Art }) {
  const s = { stroke: 'var(--brand)', fill: 'none', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const solid = { ...s, fill: '#ffffff' };
  const faint = { ...s, strokeOpacity: 0.28 };
  const skyline = (
    <g {...faint}>
      <path d="M8 214V150h26v64M40 214V122h22v92M68 214V160h30v54M104 214V108h18v106M128 214V140h28v74M380 214V136h24v78M474 214V150h30v64" />
      <path d="M44 132h14M44 144h14M44 156h14M108 120h10M108 134h10M108 148h10M384 148h16M384 162h16" />
    </g>
  );
  const ground = <path d="M0 214h520" stroke="var(--brand)" strokeOpacity="0.35" strokeWidth="1.3" />;
  const trees = (xs: number[]) => (
    <g {...s} strokeOpacity={0.55}>
      {xs.map((x) => <g key={x}><circle cx={x} cy={196} r={9} fill="var(--brand-tint)" /><path d={`M${x} 205v9`} /></g>)}
    </g>
  );

  let body: ReactNode;
  if (kind === 'checker') {
    body = (
      <>
        {skyline}
        <g {...s} strokeOpacity={0.4}><path d="M120 214c20-20 40-18 60 0M300 214c30-24 70-24 100 0" /></g>
        {/* plant */}
        <g {...solid}>
          <path d="M150 214h40l-5-34h-30z" />
          <path d="M170 180c-2-26 8-44 26-52-2 20-10 38-26 52zM170 180c-14-18-30-24-46-22 6 16 22 24 46 22zM170 178c4-22 0-40-10-52-8 18-6 36 10 52z" fill="var(--brand-tint)" />
        </g>
        {/* laptop */}
        <g {...solid}>
          <path d="M226 72h196a8 8 0 0 1 8 8v122H218V80a8 8 0 0 1 8-8z" strokeWidth={1.6} />
          <path d="M232 84h184v108H232z" strokeOpacity={0.5} />
          <path d="M196 202h256l-12 12H208z" strokeWidth={1.6} />
          <path d="M300 207h48" strokeOpacity={0.5} />
        </g>
        <g {...s} strokeOpacity={0.45} strokeWidth={2}><path d="M252 108h84M252 122h60M252 136h70M252 150h48" /></g>
        <circle cx="376" cy="138" r="26" fill="var(--brand)" />
        <path d="M364 138l8 8 16-17" stroke="var(--brand-on)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* books */}
        <g {...solid}>
          <path d="M452 214h56v-14h-56zM458 200h46v-13h-46zM448 187h56v-14h-56z" />
          <path d="M452 207h50M458 193h40M448 180h50" strokeOpacity={0.4} />
        </g>
        {ground}
      </>
    );
  } else if (kind === 'tower') {
    const floors = Array.from({ length: 13 }, (_, i) => 52 + i * 12);
    body = (
      <>
        {skyline}
        {/* a calendar card floating left of the tower */}
        <g {...solid}>
          <rect x="168" y="70" width="88" height="80" rx="9" strokeWidth={1.5} />
          <path d="M168 92h88" />
          <path d="M188 62v16M236 62v16" strokeWidth={1.8} />
        </g>
        <g fill="var(--brand)" fillOpacity={0.55}>
          {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={180 + c * 18} y={102 + r * 15} width="10" height="8" rx="2" fillOpacity={c === 2 && r === 1 ? 1 : 0.35} />))}
        </g>
        {/* the tower: a tapered curved facade */}
        <g {...solid}>
          <path d="M300 214V60c0-18 26-30 52-30s52 12 52 30v154z" strokeWidth={1.6} />
          <path d="M318 214V64c0-10 16-18 34-18s34 8 34 18v150" strokeOpacity={0.45} />
        </g>
        <g {...s} strokeOpacity={0.35}>{floors.map((y) => <path key={y} d={`M300 ${y}h104`} />)}</g>
        <g {...s} strokeOpacity={0.25}><path d="M335 46v168M352 44v170M369 46v168" /></g>
        <g {...solid}><path d="M262 214v-58h38v58M404 214v-74h44v74" /></g>
        <g {...s} strokeOpacity={0.35}><path d="M270 168h22M270 180h22M270 192h22M412 152h28M412 166h28M412 180h28M412 194h28" /></g>
        {trees([248, 462, 486])}
        {ground}
      </>
    );
  } else {
    const fins = Array.from({ length: 7 }, (_, i) => 350 + i * 9);
    const floors = Array.from({ length: 12 }, (_, i) => 50 + i * 12);
    body = (
      <>
        {skyline}
        {/* a rising line behind the buildings */}
        <g {...s} strokeOpacity={0.55} strokeWidth={1.8}><path d="M150 168l40-22 34 10 44-38 40 8 44-42" /><path d="M342 80l10-6-2 12" /></g>
        <g fill="var(--brand)" fillOpacity={0.6}>{[[150, 168], [190, 146], [224, 156], [268, 118], [308, 126]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3" />)}</g>
        {/* the tower */}
        <g {...solid}>
          <path d="M340 214V44l6-14h52l6 14v170z" strokeWidth={1.6} />
          <path d="M352 30l5-12h28l5 12" />
        </g>
        <g {...s} strokeOpacity={0.3}>{floors.map((y) => <path key={y} d={`M340 ${y}h64`} />)}</g>
        <g {...s} strokeOpacity={0.22}>{fins.map((x) => <path key={x} d={`M${x} 44v170`} />)}</g>
        {/* the curved hall in front */}
        <g {...solid}>
          <path d="M226 214v-46c40-34 140-42 214-8v54z" strokeWidth={1.6} />
        </g>
        <g {...s} strokeOpacity={0.4}><path d="M226 182c42-28 140-34 214-2M226 196c44-24 140-30 214-4" /></g>
        <g {...s} strokeOpacity={0.3}><path d="M258 214v-58M292 214v-66M326 214v-70M360 214v-70M394 214v-66M426 214v-56" /></g>
        {trees([214, 456, 480])}
        {ground}
      </>
    );
  }
  return (
    <svg className="h-art" viewBox="0 0 520 224" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}
