import type { AdminApplication } from '@/lib/tenants-admin';

/** Client-side filter model shared by Applications and Reports. */
export interface AppFilter { ipo: string; status: string; from: string; to: string }
export const emptyFilter = (): AppFilter => ({ ipo: '', status: '', from: '', to: '' });

export function filterApps(rows: AdminApplication[], f: AppFilter): AdminApplication[] {
  return rows.filter((r) =>
    (!f.ipo || r.ipoSymbol === f.ipo) &&
    (!f.status || r.status === f.status) &&
    (!f.from || r.appliedAt >= f.from) &&
    (!f.to || r.appliedAt <= f.to));
}

/** Distinct sorted IPO symbols / statuses present in the rows (for the filter dropdowns). */
export function distinct(rows: AdminApplication[], key: 'ipoSymbol' | 'status'): string[] {
  return Array.from(new Set(rows.map((r) => r[key]).filter(Boolean) as string[])).sort();
}

export interface PartnerAgg { code: string; name: string; applications: number; amount: number; allotted: number; commission: number }
export interface Aggregate {
  applications: number; amount: number;
  byStatus: Record<string, number>;
  allotted: number; notAllotted: number; allotmentRate: number | null;
  totalRefund: number; totalCommission: number;
  byIpo: { symbol: string; name: string; applications: number; amount: number; allotted: number }[];
  byPartner: PartnerAgg[];
}

/** Compute the same aggregate the server report returns, but from raw (filtered) rows. */
export function aggregate(rows: AdminApplication[]): Aggregate {
  const byStatus: Record<string, number> = {};
  const byIpo = new Map<string, { symbol: string; name: string; applications: number; amount: number; allotted: number }>();
  const byPartner = new Map<string, PartnerAgg>();
  let amount = 0, allotted = 0, notAllotted = 0, totalRefund = 0, totalCommission = 0;
  for (const a of rows) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    amount += a.amount;
    if (a.status === 'allotted') allotted++;
    else if (a.status === 'not_allotted') notAllotted++;
    totalRefund += a.refundAmount ?? 0;
    totalCommission += a.commissionAmount ?? 0;
    const key = a.ipoSymbol ?? '—';
    const row = byIpo.get(key) ?? { symbol: key, name: a.ipoName ?? '', applications: 0, amount: 0, allotted: 0 };
    row.applications++; row.amount += a.amount;
    if (a.status === 'allotted') row.allotted++;
    byIpo.set(key, row);
    const pk = a.partnerCode ?? '—';
    const p = byPartner.get(pk) ?? { code: pk, name: a.tenantName ?? a.tenantSlug ?? '—', applications: 0, amount: 0, allotted: 0, commission: 0 };
    p.applications++; p.amount += a.amount; p.commission += a.commissionAmount ?? 0;
    if (a.status === 'allotted') p.allotted++;
    byPartner.set(pk, p);
  }
  const decided = allotted + notAllotted;
  return {
    applications: rows.length, amount, byStatus, allotted, notAllotted,
    allotmentRate: decided ? Math.round((allotted / decided) * 1000) / 10 : null,
    totalRefund, totalCommission,
    byIpo: [...byIpo.values()].sort((a, b) => b.amount - a.amount),
    byPartner: [...byPartner.values()].sort((a, b) => b.commission - a.commission),
  };
}

/** Serialise filtered rows to CSV (client-side export). */
export function appsToCsv(rows: AdminApplication[]): string {
  const headers = ['IPO', 'IPO name', 'Applicant', 'Mobile', 'Category', 'Applicant type', 'Lots', 'Amount', 'Status', 'Allotted lots', 'Refund', 'Applied', 'Tenant'];
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([r.ipoSymbol, r.ipoName, r.applicantName, r.mobileMasked, r.category, r.applicantType,
      r.lots, r.amount, r.status, r.allottedLots ?? '', r.refundAmount ?? '', r.appliedAt, r.tenantSlug].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
