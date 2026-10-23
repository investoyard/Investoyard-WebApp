'use client';
import { useState } from 'react';
import { dayValue, dayWiseRows, hasAppFigures, type DayEntry, type HourEntry } from '@investoyard/shared-types';

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

/** Applications for one category at one point in time: `n` received, `x` the
 *  by-applications multiple. Absent entirely on a record the exchange sent no
 *  bid counts for, and on every entry logged before 2026-09-30. */
interface AppCell { n?: number | null; x?: number | null }

/* `DayEntry` / `HourEntry` and the derivation below come from shared-types,
   so mobile draws the same days from the same rules in the shape a phone
   has room for. See packages/shared-types/src/dayWise.ts. */

type View = 'shares' | 'apps';

const fmtDay = (d?: string) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d ?? '—';

const tx = (v?: number | null) => (v != null ? `${v}×` : '—');

/**
 * One cell in the APPLICATIONS view — the multiple over the count received.
 * Both, because they answer different questions: the multiple says how
 * oversubscribed by applications, the count says how many people actually
 * applied, and the live Application-wise panel already shows the pair.
 */
function AppCellView({ c }: { c?: AppCell | null }) {
  if (!c || (c.x == null && c.n == null)) return <>—</>;
  return (
    <>
      {c.x != null ? `${c.x}×` : '—'}
      {c.n != null && (
        <span className="dws-apps"> {c.n.toLocaleString('en-IN')}</span>
      )}
    </>
  );
}

export function DayWiseSubscription({
  subLog, subLogHour, closeDate, bare,
}: {
  subLog: DayEntry[];
  subLogHour: HourEntry[];
  /** The issue's close date — the row carrying it is flagged as the last day. */
  closeDate?: string;
  /** Drop the `.panel` shell and the heading — for the /subscription modal,
   *  whose own title bar already says whose day-wise this is and how to use it. */
  bare?: boolean;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [view, setView] = useState<View>('shares');
  /* The toggle appears only when there is something behind it. Application
     figures reach the log from 2026-09-30 and CANNOT be backfilled, so every
     day logged before then — and every issue that closed before then — has
     none, and offering an empty view would be worse than not offering it. */
  const hasApps = hasAppFigures(subLog, subLogHour);
  const shown: View = hasApps ? view : 'shares';
  const cell = (e: DayEntry, key: string, sharesVal?: number | null) =>
    (shown === 'apps' ? <AppCellView c={e.apps?.[key]} /> : <>{tx(sharesVal)}</>);
  /* Day numbering, ordering and the hourly grouping are `dayWiseRows` —
     newest first, numbered by POSITION in the ascending log so a window
     straddling a weekend cannot number its three bidding days 1, 4, 5. */
  const rows = dayWiseRows(subLog, subLogHour, closeDate);

  return (
    <div className={bare ? undefined : 'panel'} style={bare ? undefined : { marginTop: 14 }}>
      {!bare && (
        <div className="between"><h3>Day-wise subscription</h3><span className="muted" style={{ fontSize: 12 }}>Click a day to see hourly snapshots</span></div>
      )}
      {/* A TOGGLE rather than more columns: the table already carries six with
          bHNI/sHNI nested under NII, and the same component renders inside the
          /subscription modal, where eleven would not fit. Share-wise and
          Application-wise are two readings of one thing — the live panels above
          present them the same way. */}
      {hasApps && (
        <div className="seg" style={{ marginTop: bare ? 0 : 10 }} role="group" aria-label="Day-wise measure">
          <button type="button" className={shown === 'shares' ? 'on' : ''}
            aria-pressed={shown === 'shares'} onClick={() => setView('shares')}>Share-wise</button>
          <button type="button" className={shown === 'apps' ? 'on' : ''}
            aria-pressed={shown === 'apps'} onClick={() => setView('apps')}>Application-wise</button>
        </div>
      )}
      <div className="fin-scroll" style={{ marginTop: bare ? 0 : 10 }}>
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
            {rows.map((row) => {
              const e = row.entry;
              const hourly = row.hours;
              const hasHourly = hourly.length > 0;
              const isOpen = openDay === row.d;
              return (
                <>
                  <tr
                    key={e.d}
                    onClick={() => hasHourly && setOpenDay(isOpen ? null : row.d)}
                    style={{ cursor: hasHourly ? 'pointer' : 'default', background: isOpen ? 'var(--bg-subtle)' : undefined }}
                  >
                    <td style={{ color: hasHourly ? 'var(--brand-500)' : 'var(--muted)', fontSize: 14, textAlign: 'center' }}>
                      {hasHourly ? (isOpen ? '▾' : '▸') : '·'}
                    </td>
                    <td>
                      <b className="dws-day">
                        Day {row.dayNo}{row.isLast ? ' (Last)' : ''}
                      </b>
                      <span className="dws-date">{fmtDay(e.d)}</span>
                    </td>
                    <td className="mono">{cell(e, 'qib', e.qib)}</td>
                    <td className="mono">{cell(e, 'hni', dayValue(e, 'hni'))}</td>
                    <td className="mono">{cell(e, 'hni2', e.hni2)}</td>
                    <td className="mono">{cell(e, 'retail', e.retail)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{cell(e, 'total', e.total)}</td>
                  </tr>
                  {isOpen && hourly.map((h) => (
                    <tr key={`${h.d}-${h.t}`} style={{ background: 'var(--bg-subtle)', fontSize: 12 }}>
                      <td></td>
                      <td style={{ color: 'var(--muted)', paddingLeft: 20 }}>{h.t ?? '—'}</td>
                      <td className="mono">{cell(h, 'qib', h.qib)}</td>
                      <td className="mono">{cell(h, 'hni', dayValue(h, 'hni'))}</td>
                      <td className="mono">{cell(h, 'hni2', h.hni2)}</td>
                      <td className="mono">{cell(h, 'retail', h.retail)}</td>
                      <td className="mono">{cell(h, 'total', h.total)}</td>
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
