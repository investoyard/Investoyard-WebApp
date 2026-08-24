/**
 * Mobile display helpers — mirrors apps/web/lib/format.ts + apps/web/lib/catColor.ts
 * so the app and the web front site present identical figures.
 */

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function inr(n?: number): string {
  return n == null ? '—' : '₹' + n.toLocaleString('en-IN');
}

export function priceBand(min?: number, max?: number): string {
  if (min == null) return '—';
  return max != null && max !== min ? `₹${min}–${max}` : `₹${min}`;
}

/** ISO "2026-07-01" → "01 Jul 2026". */
export function fmtDate(s?: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  return `${s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
}

/** ISO open/close → friendly range: "20 Jun – 22 Jun 2026". */
export function fmtRange(open?: string, close?: string): string {
  const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);
  const a = p(open), b = p(close);
  const f = (x: { y: number; m: number; d: number }) => `${String(x.d).padStart(2, '0')} ${MON[x.m]} ${x.y}`;
  if (!a && !b) return '—';
  if (a && b) return `${f(a)} – ${f(b)}`;
  return f(a ?? b!);
}

/** Shares/amount to compact Indian units (L / Cr). */
export function shC(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return Math.round(n).toLocaleString('en-IN');
}

/** Whole days until end of the given date (negative if past). */
export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export function closesInLabel(closeDate?: string): string | null {
  const d = daysUntil(closeDate);
  if (d == null || d < 0) return null;
  if (d === 0) return 'Closes today';
  if (d === 1) return 'Closes tomorrow';
  return `Closes in ${d} days`;
}

/** Consistent investor-category colour system (hex values of the web CSS vars). */
export function catColor(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('qib')) return '#2f66d0';
  if (c.includes('retail') || c.includes('rii')) return '#3c2e7e';
  if (c.includes('b-hni') || c.includes('b_hni') || c.includes('bhni') || c.includes('hni 2') || c.includes('hni2')) return '#7c4dff';
  if (c.includes('hni') || c.includes('nii')) return '#e0a200';
  return '#7565bd';
}
/** Readable text colour on a segment — dark on the light gold band, white elsewhere. */
export function segTextColor(cat: string): string {
  return catColor(cat) === '#e0a200' ? '#4a3600' : '#ffffff';
}
/** Label shown inside a stacked allocation-bar segment (compact = card width). */
export function segLabel(cat: string, pct: number): string {
  if (pct >= 22) return `${cat} ${pct}%`;
  if (pct >= 10) return `${pct}%`;
  return '';
}

/** Relative label for a timeline milestone. */
export function relText(ms: number | null, today: number, done: boolean): string {
  if (done) return 'Done';
  if (ms == null) return 'TBA';
  const d = Math.round((ms - today) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `in ${d} days`;
}

/** Milestone state for a parsed timeline: index < nowIdx = done, === nowIdx = now. */
export function timelineStates<T extends { date?: string }>(items: T[]): { item: T; ms: number | null; state: 'done' | 'now' | '' }[] {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  const parsed = items.map((x) => ({ item: x, ms: /^\d{4}-\d{2}-\d{2}$/.test(x.date ?? '') ? new Date(x.date + 'T00:00:00').getTime() : null }));
  let nowIdx = parsed.findIndex((p) => p.ms == null || (p.ms as number) >= today);
  if (nowIdx === -1) nowIdx = parsed.length;
  return parsed.map((p, i) => ({ ...p, state: i < nowIdx ? 'done' : i === nowIdx ? 'now' : '' }));
}

/** API rich fields may be HTML — reduce to readable paragraphs / bullet lines. */
export function stripHtml(s?: string): string[] {
  if (!s) return [];
  const text = s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/ul|\/ol)\s*\/?\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&(#39|apos);/gi, "'")
    .replace(/&quot;/gi, '"');
  return text
    .split(/\n+/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** "Ramesh Kumar" → "RK" (avatar / logo-fallback initials). */
export function initials(name?: string): string {
  return name ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
}

/** Name casing + the domain vocabulary live in the shared package (web + mobile). */
export { titleCase, LABEL, CATEGORY_LABEL } from '@investoyard/shared-types';
