'use client';
import { useState } from 'react';

/**
 * Day-wise + hourly subscription table.
 *
 * Two data sources on the same IPO record:
 *   - `subLog`      — one entry per DAY (final EOD snapshot, 14-day cap)
 *   - `subLogHour`  — rolling window of hourly snapshots (72 entries =
 *                     3 days × 24 hours; the last poll before each hour
 *                     rollover wins). Populated 2026-09-22.
 *
 * Each day row is a click-target — expand to reveal that day's hourly
 * snapshots. Days without hourly data still render, just without a
 * chevron and disabled expand (typical for records polled BEFORE
 * subLogHour was introduced).
 *
 * Column format matches the operator's reference (2026-09-22):
 *   Date | QIB | NII (bHNI + sHNI) | Retail | Total
 *
 * The Date cell carries the bidding day alongside the date — "Day 2 · 23 Sept",
 * and "Day 3 (Last) · 24 Sept" on the close date (operator ask, 2026-09-23).
 */

interface DayEntry {
  d?: string; qib?: number | null; nii?: number | null; retail?: number | null;
  hni?: number | null; hni2?: number | null; employee?: number | null;
  shareholder?: number | null; total?: number | null;
}
interface HourEntry extends DayEntry { t?: string }

const fmtDay = (d?: string) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d ?? '—';

const tx = (v?: number | null) => (v != null ? `${v}×` : '—');

export function DayWiseSubscription({
  subLog, subLogHour, closeDate,
}: {
  subLog: DayEntry[];
  subLogHour: HourEntry[];
  /** The issue's close date — the row carrying it is flagged as the last day. */
  closeDate?: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Day numbers come from the row's POSITION in the ascending log, not from a
  // date subtraction: a window that straddles a weekend (Fri close → Tue) would
  // number its three bidding days 1, 4, 5. The poller writes one entry per open
  // day, so position is the bidding day (operator ask, 2026-09-23).
  const dayNo = new Map<string, number>();
  subLog.forEach((e, i) => { if (e.d) dayNo.set(e.d, i + 1); });
  const days = [...subLog].reverse();
  // group hourly by day for O(1) lookup
  const byDay = new Map<string, HourEntry[]>();
  for (const h of subLogHour) {
    if (!h?.d) continue;
    const arr = byDay.get(h.d) ?? [];
    arr.push(h);
    byDay.set(h.d, arr);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => String(a.t).localeCompare(String(b.t)));

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="between"><h3>Day-wise subscription</h3><span className="muted" style={{ fontSize: 12 }}>Click a day to see hourly snapshots</span></div>
      <div className="fin-scroll" style={{ marginTop: 10 }}>
        <table className="fin-tab day-wise-sub">
          <thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: 'bottom', width: 28 }}></th>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Date</th>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>QIB</th>
              <th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--border)' }}>NII</th>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Retail</th>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Total</th>
            </tr>
            {/* bHNI / sHNI sub-headers use the SAME typography as the top-row
                headers (no fontSize/muted overrides) so the value cells line
                up under them and the column widths look like the rest of the
                table (operator report 2026-09-22: bHNI value was floating
                left of its header because the sub-header font was smaller). */}
            <tr>
              <th>bHNI</th>
              <th>sHNI</th>
            </tr>
          </thead>
          <tbody>
            {days.map((e) => {
              const hourly = e.d ? byDay.get(e.d) ?? [] : [];
              const hasHourly = hourly.length > 0;
              const isOpen = openDay === e.d;
              return (
                <>
                  <tr
                    key={e.d}
                    onClick={() => hasHourly && e.d && setOpenDay(isOpen ? null : e.d)}
                    style={{ cursor: hasHourly ? 'pointer' : 'default', background: isOpen ? 'var(--bg-subtle)' : undefined }}
                  >
                    <td style={{ color: hasHourly ? 'var(--brand-500)' : 'var(--muted)', fontSize: 14, textAlign: 'center' }}>
                      {hasHourly ? (isOpen ? '▾' : '▸') : '·'}
                    </td>
                    <td>
                      <b className="dws-day">
                        Day {dayNo.get(e.d ?? '') ?? '—'}{e.d && e.d === closeDate ? ' (Last)' : ''}
                      </b>
                      <span className="dws-date">{fmtDay(e.d)}</span>
                    </td>
                    <td className="mono">{tx(e.qib)}</td>
                    <td className="mono">{tx(e.hni ?? e.nii)}</td>
                    <td className="mono">{tx(e.hni2)}</td>
                    <td className="mono">{tx(e.retail)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{tx(e.total)}</td>
                  </tr>
                  {isOpen && hourly.map((h) => (
                    <tr key={`${h.d}-${h.t}`} style={{ background: 'var(--bg-subtle)', fontSize: 12 }}>
                      <td></td>
                      <td style={{ color: 'var(--muted)', paddingLeft: 20 }}>{h.t ?? '—'}</td>
                      <td className="mono">{tx(h.qib)}</td>
                      <td className="mono">{tx(h.hni ?? h.nii)}</td>
                      <td className="mono">{tx(h.hni2)}</td>
                      <td className="mono">{tx(h.retail)}</td>
                      <td className="mono">{tx(h.total)}</td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
