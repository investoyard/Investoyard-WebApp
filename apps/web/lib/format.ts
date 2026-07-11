export function inr(n?: number): string {
  return n == null ? '—' : '₹' + n.toLocaleString('en-IN');
}

export function priceBand(min?: number, max?: number): string {
  if (min == null) return '—';
  return max != null && max !== min ? `₹${min}–${max}` : `₹${min}`;
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
