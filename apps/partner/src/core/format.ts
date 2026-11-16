/*
 * Display formatting shared by every variant. Pure, no React, no DOM.
 *
 * Dates are calendar dates stored as YYYY-MM-DD and are formatted from their
 * parts, never through `new Date(...)` in the reader's zone: an IPO's dates
 * are facts about Mumbai, not about the reader.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (s?: string | null): [number, number, number] | null => {
  if (!s || s.length < 10) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return y && m && d ? [y, m, d] : null;
};

/** "18 Nov" */
export const dayMon = (s?: string | null): string => {
  const p = parts(s);
  return p ? `${p[2]} ${MON[p[1] - 1]}` : '';
};

/** "Wed 18 Nov" */
export const wdDayMon = (s?: string | null): string => {
  const p = parts(s);
  if (!p) return '';
  const wd = WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  return `${wd} ${p[2]} ${MON[p[1] - 1]}`;
};

/** "18 Nov 2026" */
export const dayMonYear = (s?: string | null): string => {
  const p = parts(s);
  return p ? `${p[2]} ${MON[p[1] - 1]} ${p[0]}` : '';
};

/** "18 – 20 Nov", "28 Sep – 2 Oct" */
export const dateRange = (a?: string | null, b?: string | null): string => {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return dayMon(a) || dayMon(b) || '';
  if (pa[1] === pb[1] && pa[0] === pb[0]) return `${pa[2]} – ${pb[2]} ${MON[pb[1] - 1]}`;
  return `${pa[2]} ${MON[pa[1] - 1]} – ${pb[2]} ${MON[pb[1] - 1]}`;
};

/**
 * Lower-case only the first letter, so a status reads mid-sentence:
 * "Opens Wed 18 Nov" -> "opens Wed 18 Nov". A whole-string toLowerCase()
 * printed "opens wed 18 nov", lowering the weekday and month with it.
 */
export const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export const yearOf =(s?: string | null): number | null => parts(s)?.[0] ?? null;

/** Indian digit grouping: 1,23,45,678 */
export const inr = (n: number): string => Math.round(n).toLocaleString('en-IN');

export const rupees = (n: number | null | undefined): string => (n == null ? '—' : `₹${inr(n)}`);

/** Crore with sensible precision: ₹30,213 Cr · ₹456 Cr · ₹23.5 Cr */
export const crore = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: digits })} Cr`;
};

export const times = (t: number | null | undefined): string =>
  t == null || !Number.isFinite(t) ? '—' : `${t.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

export const priceBand = (lo?: number | null, hi?: number | null): string => {
  if (!lo && !hi) return '—';
  if (!lo || !hi || lo === hi) return rupees(hi || lo || null);
  return `₹${inr(lo)}–${inr(hi)}`;
};

export const initials = (name: string): string =>
  name
    .split(' ')
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '·';

/**
 * Log-scaled bar width. A linear scale makes 2× invisible next to 500×; on a
 * log scale both read, and the order is preserved.
 */
export const logWidth = (t: number | null | undefined, max: number): number => {
  if (!t || t <= 0 || !max || max <= 0) return 0;
  return Math.max(3, Math.min(100, Math.round((Math.log10(1 + t) / Math.log10(1 + max)) * 100)));
};
