'use client';
import { useState } from 'react';

/** Reusable column sorting: returns `apply` (sorts an array) and `Th` (a clickable sortable header). */
export function useSort<T>(getVal: (row: T, key: string) => string | number) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const toggle = (k: string) => setSort((s) => (s?.k === k ? { k, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { k, dir: 1 }));
  const apply = (rows: T[]): T[] => (sort ? [...rows].sort((a, b) => { const va = getVal(a, sort.k), vb = getVal(b, sort.k); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; }) : rows);
  const Th = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
    <th className={`th-sort ${sort?.k === k ? 'on' : ''}`} style={right ? { textAlign: 'right' } : undefined} onClick={() => toggle(k)}>
      {label}<span className="arrow">{sort?.k === k ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
    </th>
  );
  return { apply, Th };
}
