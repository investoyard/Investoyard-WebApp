'use client';

const PALETTE = ['#3c2e7e', '#ffcb32', '#12925a', '#d8412a', '#0e7c8b', '#9c2f7a', '#7565bd', '#b07d00'];

/* ---- Bar chart (CSS columns) ---- */
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-bars">
      {data.map((d, i) => (
        <div className="col" key={d.label + i}>
          <span className="v mono">{d.value}</span>
          <div className="bar" style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }} />
          <span className="l">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Donut chart (SVG) ---- */
export function DonutChart({ data, size = 168 }: { data: { label: string; value: number; color?: string }[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = 60, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-2)" strokeWidth="20" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const seg = (
            <circle key={d.label} cx="80" cy="80" r={r} fill="none"
              stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth="20"
              strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-offset * c}
              transform="rotate(-90 80 80)" strokeLinecap="butt" />
          );
          offset += frac;
          return seg;
        })}
        <text x="80" y="76" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="26" fill="var(--text)">{total}</text>
        <text x="80" y="96" textAnchor="middle" fontSize="11" fill="var(--text-muted)">total</text>
      </svg>
      <div className="legend">
        {data.map((d, i) => (
          <span className="li" key={d.label}>
            <span className="dot" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
            {d.label} <b className="mono">{d.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---- Area / line chart (SVG) ---- */
export function AreaChart({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const W = 320, H = height, pad = 6;
  const vals = data.map((d) => d.value);
  const max = Math.max(1, ...vals);
  const pts = data.map((d, i) => {
    const x = pad + (i * (W - 2 * pad)) / Math.max(1, data.length - 1);
    const y = H - pad - (d.value / max) * (H - 2 * pad - 8);
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#areaG)" />
        <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        {data.map((d) => <span key={d.label} className="faint" style={{ fontSize: 11 }}>{d.label}</span>)}
      </div>
    </div>
  );
}
