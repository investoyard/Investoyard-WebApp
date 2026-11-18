'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * The IPO page's client pieces, kept in one file: the pinned section tabs,
 * the read-more clamp, the financials chart with its metric tabs, and share.
 * Everything else on the page is server-rendered.
 */

/* Section tabs pinned under the header; the section being read is marked from positions read on scroll. */
export function Tabs({ tabs }: { tabs: [string, string][] }) {
  const [active, setActive] = useState(tabs[0]?.[0] || '');
  /* A clicked tab holds until the scroll it started has finished. Two columns put side-column cards level with main-column
     ones, so reading positions mid-scroll would light the neighbour of the tab the reader chose. */
  const lock = useRef(0);
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      last = Date.now();
      if (Date.now() < lock.current) return;
      const bar = document.querySelector('.b-dtabs-bar');
      const line = (bar ? bar.getBoundingClientRect().bottom : 130) + 24;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const tops = tabs.map(([id]) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top ?? Infinity })).filter((t) => Number.isFinite(t.top));
      if (!tops.length) return;
      if (atEnd) { setActive(tops.reduce((a, b) => (b.top > a.top ? b : a)).id); return; }
      const passed = tops.filter((t) => t.top <= line);
      setActive(passed.length ? passed.reduce((a, b) => (b.top > a.top ? b : a)).id : tabs[0][0]);
    };
    const onScroll = () => { if (Date.now() < lock.current) { lock.current = Date.now() + 160; return; } if (Date.now() - last > 100) read(); else if (!timer) timer = setTimeout(() => { timer = null; read(); }, 110); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (timer) clearTimeout(timer); };
  }, [tabs]);
  return (
    <nav className="b-dtabs-bar" aria-label="Sections">
      <div className="b-wrap">
        <div className="b-dtabs">
          {tabs.map(([id, l]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined} onClick={() => { setActive(id); lock.current = Date.now() + 700; }}>{l}</a>)}
        </div>
      </div>
    </nav>
  );
}

/* Long company text: in the HTML in full, held to a few lines until asked for. */
export function ReadMore({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`b-rm${open ? ' open' : ''}`}>
      <div className="b-prose b-rm-body" dangerouslySetInnerHTML={{ __html: html }} />
      <button type="button" className="b-link b-link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>
    </div>
  );
}

type Fin = { cols: string[]; rows: { label: string; values: (number | null)[] }[] };

/* Financials as bars for the chosen line item, oldest period on the left, with the full table beside it. */
export function FinChart({ fin }: { fin: Fin }) {
  const [k, setK] = useState(0);
  const row = fin.rows[k];
  /* The operator's table runs newest first; a chart reads left to right in time. */
  const pts = fin.cols.map((c, i) => ({ c, v: row.values[i] })).reverse();
  const vals = pts.map((p) => p.v ?? 0);
  const max = Math.max(...vals.map(Math.abs), 1) * 1.15;
  const W = 420, H = 230, L = 46, R = 8, T = 24, B = 28;
  const gw = (W - L - R) / pts.length;
  const bw = Math.min(46, gw * 0.56);
  const y = (v: number) => T + (1 - Math.max(v, 0) / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (
    <div className="b-fin">
      <div className="b-fin-tabs" role="tablist" aria-label="Line item">
        {fin.rows.slice(0, 5).map((r, i) => <button key={r.label} type="button" role="tab" aria-selected={k === i} onClick={() => setK(i)}>{r.label}</button>)}
      </div>
      <div className="b-fin-body">
        <svg className="b-fin-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${row.label}: ${pts.map((p) => `${p.c} ${p.v == null ? 'not stated' : fmt(p.v)}`).join(', ')}`}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="b-axis">{t >= 1000 ? Math.round(t).toLocaleString('en-IN') : t < 10 ? t.toFixed(1) : Math.round(t)}</text></g>)}
          {pts.map((p, i) => {
            const x = L + i * gw + (gw - bw) / 2;
            return (
              <g key={p.c}>
                {p.v != null ? <><rect x={x} y={y(p.v)} width={bw} height={Math.max(1, H - B - y(p.v))} rx="4" fill="var(--brand)" fillOpacity={0.55 + (0.45 * i) / Math.max(1, pts.length - 1)} /><text x={x + bw / 2} y={y(p.v) - 6} textAnchor="middle" className="b-bar-v">{fmt(p.v)}</text></> : null}
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="b-axis">{p.c}</text>
              </g>
            );
          })}
        </svg>
        <div className="b-tbl-wrap">
          <table className="b-mini b-fin-t">
            <thead><tr><th>Particulars (₹ Cr)</th>{fin.cols.map((c) => <th key={c} className="r">{c}</th>)}</tr></thead>
            <tbody>{fin.rows.map((r, i) => <tr key={r.label} className={i === k ? 'is-sel' : undefined}><td>{r.label}</td>{r.values.map((v, j) => <td key={j} className="r num">{v == null ? '—' : fmt(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Share the page: the system share sheet where there is one, otherwise copy the link. */
export function Share({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  const go = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch { /* the reader cancelled */ }
  };
  return (
    <button type="button" className="b-iconbtn" onClick={go} aria-label={done ? 'Link copied' : 'Share this IPO'} title={done ? 'Link copied' : 'Share'}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={done ? 'M5 12.5l4.5 4.5L19 7.5' : 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'} /></svg>
    </button>
  );
}
