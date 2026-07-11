/** Shared display helpers for IPO detail panels — one source of truth so the
    listing card and the detail page use the exact same colour system & formats. */

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Consistent investor-category colour system used across all detail panels. */
export function catColor(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('qib')) return 'var(--c-qib)';
  if (c.includes('retail') || c.includes('rii')) return 'var(--c-retail)';
  if (c.includes('b-hni') || c.includes('b_hni') || c.includes('bhni') || c.includes('hni 2') || c.includes('hni2')) return 'var(--c-hni2)';
  if (c.includes('hni') || c.includes('nii')) return 'var(--c-hni1)';
  if (c.includes('emp')) return 'var(--brand-400)';
  return 'var(--brand-400)';
}

/** Label shown inside a stacked allocation-bar segment. Shows "Cat 50%" when the
    segment is wide enough, just "50%" when medium, nothing when too narrow — so it
    never clips. `compact` = the narrow listing card; false = the wider detail page. */
export function segLabel(cat: string, pct: number, compact: boolean): string {
  const nameThresh = compact ? 22 : 12;
  const pctThresh = compact ? 10 : 5;
  if (pct >= nameThresh) return `${cat} ${pct}%`;
  if (pct >= pctThresh) return `${pct}%`;
  return '';
}
/** Readable text colour on a segment — dark on the light gold band, white elsewhere. */
export function segTextColor(cat: string): string {
  return catColor(cat) === 'var(--c-hni1)' ? '#4a3600' : '#fff';
}

/** Shares/amount to compact Indian units (L / Cr). */
export function shC(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return Math.round(n).toLocaleString('en-IN');
}

/** ISO "2026-07-01" → "01 Jul 2026". */
export function fmtDate(s?: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  return `${s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
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
