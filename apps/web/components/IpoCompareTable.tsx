'use client';
import { Fragment, useMemo, useState } from 'react';
import type { IpoFull } from '@/lib/api';
import { priceBand } from '@/lib/format';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { statusChip, demandLabel, TopicPanel } from '@/components/IpoCard';
import { useTenant } from '@/components/TenantProvider';
import { LABEL, titleCase, shortName, stageOf } from '@investoyard/shared-types';

/**
 * Desktop comparison table — every issue on one sortable screen.
 * This is the view a researcher wants (and the one a phone can't give): all the
 * decision numbers side by side, sortable, scannable in a single pass. The card
 * grid stays the default on narrow screens; the toggle lives in IpoExplorer.
 */

// Min Application is gone: Offer Price and Lot Size sit side by side here, so
// the figure is derivable in place, and ten columns was one too many.
type SortKey = 'name' | 'status' | 'price' | 'lot' | 'size' | 'gmp' | 'sub' | 'close';
type Dir = 'asc' | 'desc';

/** ₹ value behind an issue-size label ("₹850.50 Cr" → 8.5e9) for sorting. */
function issueValue(s?: string): number {
  if (!s) return 0;
  const clean = s.replace(/,/g, '');
  const cr = clean.match(/([\d.]+)\s*Cr/i);
  if (cr) return parseFloat(cr[1]) * 1e7;
  const n = clean.replace(/[^\d.]/g, '');
  return n ? parseFloat(n) : 0;
}

/** Lifecycle order so "Status" sorts live-first rather than alphabetically. */
const PHASE_RANK: Record<string, number> = { open: 0, upcoming: 1, closed: 2, listed: 3, withdrawn: 4 };

/**
 * @param shortNames drop the trailing "Limited" — the /home2 layout under review.
 * @param archive    the /ipos/archive variant: short names always, and the close
 *   date moves under the company name beside the symbol instead of taking its
 *   own column. Carrying it in both places would just say the same thing twice.
 */
export function IpoCompareTable({ ipos, lang = 'en', shortNames = false, archive = false }: {
  ipos: IpoFull[]; lang?: string; shortNames?: boolean; archive?: boolean;
}) {
  const brief = shortNames || archive;
  const tenant = useTenant();
  const showGmp = tenant.flags.gmpEnabled;
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const [sort, setSort] = useState<SortKey>('status');
  const [dir, setDir] = useState<Dir>('asc');

  /** One row open at a time — matches how the card's topic panels behave, and
   *  keeps the table short enough to still scan. Sorting closes it: the row
   *  would otherwise move out from under its own panel. */
  const [openRow, setOpenRow] = useState<string | null>(null);

  const toggle = (k: SortKey) => {
    setOpenRow(null);
    if (k === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'name' ? 'asc' : 'desc'); }
  };

  const rows = useMemo(() => {
    const val = (i: IpoFull): number | string => {
      switch (sort) {
        case 'name': return titleCase(i.name).toLowerCase();
        case 'status': return PHASE_RANK[i.status] ?? 9;
        case 'price': return i.priceBandMax ?? i.priceBandMin ?? 0;
        case 'lot': return i.lotSize ?? 0;
          case 'size': return issueValue(i.issueSize);
        case 'gmp': return i.gmp ?? -Infinity;
        case 'sub': return i.subscriptionTimes ?? -Infinity;
        case 'close': return i.closeDate ?? '';
        default: return 0;
      }
    };
    const sorted = [...ipos].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y));
      return x - y;
    });
    // 'status' ascending means live-first; everything else respects the arrow
    return dir === 'asc' ? sorted : sorted.reverse();
  }, [ipos, sort, dir]);

  const Th = ({ k, children, align = 'left' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <th className={`ct-th ${align === 'right' ? 'r' : ''} ${sort === k ? 'on' : ''}`}>
      <button type="button" onClick={() => toggle(k)} aria-label={`Sort by ${String(children)}`}>
        {children}
        <span className="ct-arrow">{sort === k ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="ct-wrap">
      <table className="ct">
        <thead>
          <tr>
            <Th k="name">IPO</Th>
            <Th k="status">Status</Th>
            <Th k="price" align="right">{LABEL.offerPrice}</Th>
            <Th k="lot" align="right">{LABEL.lotSize}</Th>
            <Th k="size" align="right">{LABEL.issueSize}</Th>
            {showGmp && <Th k="gmp" align="right">{LABEL.gmp}</Th>}
            <Th k="sub" align="right">{LABEL.subscribed}</Th>
            {!archive && <Th k="close">Closes</Th>}
            <th className="ct-th" />
            <th className="ct-th" />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const chip = statusChip(i);
            const band = i.priceBandMax ?? i.priceBandMin;
            const gainPct = i.gmp != null && band ? (i.gmpPct ?? Math.round((i.gmp / band) * 1000) / 10) : null;
            const subX = i.subscriptionTimes;
            const dm = subX != null ? demandLabel(subX, i.type === 'sme') : null;
            const canApply = (i.status === 'open' || i.status === 'upcoming') && (i as any).extra?.startBid === true;
            const href = lang === 'en' ? `/ipos/${i.symbol}` : `/${lang}/ipos/${i.symbol}`;
            return (
              <Fragment key={i.id}>
              <tr
                className={`ct-row st-${i.status}${openRow === i.id ? ' on' : ''}`}
                onClick={() => setOpenRow(openRow === i.id ? null : i.id)}
                aria-expanded={openRow === i.id}
              >
                <td className="ct-name">
                  <a href={href} onClick={(e) => e.stopPropagation()}>
                    <IpoLogo logo={i.logo} name={i.name} size={30} />
                    <span className="ct-nm">
                      <span className="t" title={titleCase(i.name)}>{brief ? shortName(i.name) : titleCase(i.name)}</span>
                      <span className="s">
                        <span className={`ct-board ${i.type === 'sme' ? 'sme' : 'mb'}`}>{i.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                        {i.symbol}
                        {archive && i.closeDate && (
                          <span className="ct-closes">Closes {new Date(`${i.closeDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        )}
                      </span>
                    </span>
                  </a>
                </td>
                <td><span className={`ic-status ${chip.cls}`}>{chip.pulse && <span className="pd" />}{chip.label}</span></td>
                <td className="r mono">{priceBand(i.priceBandMin, i.priceBandMax)}</td>
                <td className="r mono">{i.lotSize ?? '—'}</td>
                <td className="r mono">{i.issueSize ?? '—'}</td>
                {showGmp && (
                  <td className="r mono">
                    {i.gmp != null ? (
                      <span className={`ct-gmp ${i.gmp >= 0 ? 'up' : 'down'}`}>
                        {i.gmp >= 0 ? '+' : '−'}₹{Math.abs(i.gmp)}
                        {gainPct != null && <em>{gainPct >= 0 ? '+' : ''}{gainPct}%</em>}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                )}
                <td className="r mono">
                  {subX != null ? (
                    <span className={`ct-sub ${dm?.cls ?? ''}`}>{subX}×<em>{dm?.label}</em></span>
                  ) : <span className="muted">—</span>}
                </td>
                {!archive && <td className="mono ct-date">{i.closeDate ? new Date(`${i.closeDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>}
                <td className="r">
                  {canApply ? (
                    <a className="ct-cta" href={`/apply/${i.symbol}${q}`}>
                      {i.status === 'upcoming' ? LABEL.preApply : LABEL.applyNow}
                    </a>
                  ) : stageOf(i as any) === 'allotmentout' ? (
                    <a className="ct-cta allot" href={`/allotment${q}`}>{LABEL.checkAllotment}</a>
                  ) : (
                    <a className="ct-cta ghost" href={href}>Details <Icon name="arrow-right" size={13} /></a>
                  )}
                </td>
                <td className="r ct-exp">
                  <Icon name="chevron-right" size={16} />
                </td>
              </tr>
              {openRow === i.id && (
                <tr className="ct-detail">
                  {/* colSpan spans a table that scrolls sideways, so the panel
                      is pinned to the left edge of the viewport — otherwise its
                      content sits off-screen whenever the reader has scrolled
                      right to reach the later columns. */}
                  <td colSpan={(showGmp ? 10 : 9) - (archive ? 1 : 0)}>
                    <div className="ct-detail-in">
                      {/* only what the ROW does not already carry — price band,
                          lot, size, GMP and subscription are two inches above */}
                      {/* v2 carries the "For 1×" line in the lot ladder, which is a
                          /home2 addition — shortNames is this table's v2 flag. */}
                      {(['reservation', 'lot', 'timeline'] as const).map((k) => (
                        <TopicPanel key={k} k={k} ipo={i} tr={(x: string) => x} v2={shortNames} />
                      ))}
                      <a className="ct-detail-cta" href={href}>
                        View full details <Icon name="arrow-right" size={14} />
                      </a>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {showGmp && (
        <p className="ct-note">
          GMP is an unofficial, unregulated grey-market indication — shown as information, never investment advice.
        </p>
      )}
    </div>
  );
}
