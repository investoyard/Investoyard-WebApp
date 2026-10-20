'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { inr, priceBand } from '@/lib/format';
import { getIpos, type IpoListItem } from '@/lib/api';
import { CompanyMark } from '@/components/CompanyMark';
import { Icon } from '@/components/Icon';
import { useStore, store, mapApiProfile, Application, AppStatus, InvestorCategory, Profile } from '@/lib/store';
import { changeApplicationUpi, getConsumerToken, listApplications, listProfiles, requestUnblock, type ApiApplication } from '@/lib/consumer-api';
import { makeT, Lang } from '@investoyard/i18n';
import { titleCase, fmtDateTime } from '@investoyard/shared-types';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

/** Map a live API application into the local Application shape the cards render. */
function mapApiApp(v: ApiApplication): Application {
  return {
    id: v.id,
    ipoSymbol: v.ipoSymbol,
    ipoName: v.ipoName,
    profileId: '',
    profileName: v.profileName ?? '',
    lots: v.lots ?? 0,
    shares: v.shares ?? 0,
    pricePerShare: v.shares && v.amount ? Math.round(v.amount / v.shares) : 0,
    atCutoff: false,
    category: (v.category as InvestorCategory) ?? 'Retail',
    amount: v.amount,
    method: v.applyMethod === 'pdf' ? 'pdf' : 'upi',
    status: v.status as AppStatus,
    applicationNumber: v.applicationNumber ?? 'IY' + v.id.replace(/-/g, '').slice(0, 9).toUpperCase(),
    createdAt: v.createdAt ?? new Date().toISOString(),
    amountBlocked: v.amountBlocked,
    amountReleased: v.refundAmount,
    allottedShares: v.allottedShares,
    listingGainPct: v.listingGainPct,
    categorySubscribedTimes: v.categorySubscribedTimes,
    allotmentOddsPct: v.allotmentOddsPct,
    dpVerifiedAt: v.dpVerifiedAt,
    allotmentDate: v.allotmentDate,
    listingDate: v.listingDate,
    missingDetails: v.missingDetails,
    upiStatusText: v.upiStatusText,
    unblockAvailable: v.unblockAvailable,
    unblockReason: v.unblockReason,
    unblockStuckAmount: v.unblockStuckAmount,
    unblockRequestedAt: v.unblockRequestedAt,
    upiStatusAt: v.upiStatusAt,
  };
}

/**
 * The exchange's own sentence about the UPI mandate.
 *
 * Rendered BESIDE `resultText`, never instead of it: our status collapses
 * eleven exchange codes onto five, and the three rejections an investor can act
 * on differently — they declined it, the UPI ID was invalid, the sponsor bank
 * refused — all land on `rejected`.
 *
 * KEEP IN STEP WITH the UPI row in `apps/mobile/app/(tabs)/applications.tsx`:
 * same sentence, same "As of … · from the exchange" wording, same tone rules.
 * One component here because the portfolio renders applications in two places.
 */
function UpiStatusLine({ a }: { a: Application }) {
  if (!a.upiStatusText) return null;
  // Tone off the STATUS, never off reading the sentence.
  const tone =
    a.status === 'rejected' || a.status === 'dp_failed' || a.status === 'failed' ? 'bad'
    : a.status === 'upi_blocked' || a.status === 'confirmed' || a.status === 'allotted' ? 'good'
    : a.status === 'released' || a.status === 'not_allotted' ? 'neutral'
    : 'wait';
  return (
    <div className={`upi-line ${tone}`}>
      <span className="upi-dot" />
      <span>
        {a.upiStatusText}
        {a.upiStatusAt && (
          <span className="faint" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
            As of {fmtDateTime(a.upiStatusAt)} · from the exchange
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Statuses where offering a UPI change makes sense.
 *
 * Deliberately NOT `upi_blocked` / `confirmed`: the block sits in the account
 * behind the OLD UPI ID and the exchange cannot move it, so the server refuses
 * those (`mayChangeUpi`), and a button that can only fail is worse than none.
 * `rejected` IS here — a rejected mandate is the main reason to need this.
 * KEEP IN STEP WITH `UPI_CHANGEABLE` in apps/mobile/app/(tabs)/applications.tsx.
 */
const UPI_CHANGEABLE: string[] = ['draft', 'submitted', 'dp_verified', 'mandate_pending', 'rejected'];

/**
 * On-the-spot UPI ID change (sir's requirement 2).
 *
 * Self-contained state so the portfolio's two render sites can both mount it
 * without threading an edit buffer through either of them.
 *
 * The server's own `note` is what gets shown on success, not wording composed
 * here: the UPI ID lives on the APPLICANT, so a change can restate several of
 * that applicant's bids, and only the server knows how many. The refusal
 * message is the server's too — "the funds are already blocked …" carries the
 * alternative, and a generic failure line would throw that away.
 */
function UpiChangeControl({ a, onSaved }: { a: Application; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (a.method !== 'upi' || !UPI_CHANGEABLE.includes(a.status)) return null;

  const save = async () => {
    if (!val.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await changeApplicationUpi(a.id, val.trim());
      setNote(res.upiChange?.note ?? 'Saved.');
      setOpen(false); setVal('');
      onSaved?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 9 }}>
      {open ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input
            className="input"
            style={{ maxWidth: 240 }}
            value={val}
            placeholder="name@okaxis"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
          <button className="btn btn-sm" disabled={busy || !val.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save UPI ID'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setVal(''); setErr(null); }}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setErr(null); }}>
          Change UPI ID
        </button>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--neg)' }}>{err}</div>}
      {note && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--pos-ink)' }}>{note}</div>}
    </div>
  );
}

/**
 * "My money wasn't unblocked" → email the issue's sponsor bank(s).
 *
 * Shown only when the SERVER says the request would succeed (`unblockAvailable`
 * from `mayRequestUnblock`), and the server's own reason is shown when there is
 * money outstanding but it is too early or the cooldown is running. The UI does
 * not re-derive "is the bank late yet" — a second opinion on a 24-hour grace
 * period is how a button that can only fail appears.
 *
 * KEEP IN STEP WITH the unblock block in apps/mobile/app/(tabs)/applications.tsx.
 */
function UnblockControl({ a, onSaved }: { a: Application; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!a.unblockAvailable && !a.unblockReason) return null;

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await requestUnblock(a.id);
      setNote(r.note);
      onSaved?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const amt = a.unblockStuckAmount != null ? inr(a.unblockStuckAmount) : null;
  return (
    <div style={{ marginTop: 9 }}>
      {a.unblockAvailable ? (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            {amt ? <><b>{amt}</b> has not come back from the bank.</> : 'Blocked funds have not come back from the bank.'}
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={go}>
            {busy ? 'Sending…' : 'Ask the bank to release it'}
          </button>
        </>
      ) : (
        <div className="faint" style={{ fontSize: 13 }}>
          {amt && <><b>{amt}</b> pending release. </>}{a.unblockReason}
        </div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--neg)' }}>{err}</div>}
      {note && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--pos-ink)' }}>{note}</div>}
    </div>
  );
}

const STATUS_CLASS: Record<AppStatus, string> = {
  draft: 'wait', submitted: 'info', dp_verified: 'info', dp_failed: 'bad',
  mandate_pending: 'wait', upi_blocked: 'info', confirmed: 'info',
  allotted: 'good', not_allotted: 'bad', released: 'info', rejected: 'bad', failed: 'bad',
};

// distributor lifecycle stages (what WE drive vs. what bank/registrar do)
const STAGES = ['Sent to exchange', 'DP & PAN verified', 'Funds blocked', 'Allotment', 'Refund / Listing'];
const catShort = (c: Application['category']) =>
  c === 'Retail' ? 'Retail' : c === 'sNII' ? 'Small-NII' : 'Big-NII';

/**
 * "Verified" beside the applied PAN and demat — sir's point 5.
 *
 * THE SIGNAL IS THE EXCHANGE'S, and only the exchange's. `/appdpstatus` is the
 * depository confirming that this PAN owns this demat account; nothing else on
 * the platform establishes that. In particular `InvestorProfile.kycStatus` is
 * NOT it: that column has only ever been written 'unverified', so rendering it
 * would have been a tick with nothing behind it.
 *
 * IT READS A TIMESTAMP, NOT THE STATUS. `status` holds only the CURRENT value,
 * so an application that has moved on to mandate_pending or allotted no longer
 * says dp_verified — while the verification plainly did happen. `dpVerifiedAt`
 * comes from the status-event log, which records when.
 *
 * ONE CHIP FOR BOTH, because it is one event: the depository verified the pair.
 * Two separate ticks would imply two separate confirmations.
 */
function VerifiedMark({ a }: { a: Application }) {
  if (!a.dpVerifiedAt) return null;
  return (
    <span className="st vfy" style={{ marginLeft: 8, verticalAlign: 'middle' }}
          title={`Demat and PAN confirmed by the depository on ${fmtDateTime(a.dpVerifiedAt)}`}>
      <Icon name="check" size={12} strokeWidth={3} /> Verified
    </span>
  );
}

/** Applied PAN · Demat · UPI for cross-check (snapshot on the application, profile as fallback). */
function applicantLine(a: Application, profiles: Profile[]): string {
  const p = profiles.find((x) => x.id === a.profileId);
  const pan = a.pan ?? p?.pan;
  const dep = a.depository ?? p?.depository;
  const dp = a.dpId ?? p?.dpId;
  const cl = a.clientId ?? p?.clientId;
  const upi = a.method === 'upi' ? (a.upiId ?? p?.upiId) : null;
  const parts: string[] = [];
  if (pan) parts.push(`PAN ${pan}`);
  if (dep && dp) parts.push(`${dep} ${dp}${cl ? `/${cl}` : ''}`);
  if (upi) parts.push(upi);
  return parts.join('  ·  ');
}

function stageOf(a: Application): number {
  switch (a.status) {
    case 'submitted': return 1;
    case 'dp_verified': case 'mandate_pending': return 2;
    case 'upi_blocked': return 3;
    case 'allotted': return a.listingGainPct != null ? 5 : 4;
    case 'not_allotted': case 'released': return 5;
    default: return 1;
  }
}

function resultText(a: Application): string {
  switch (a.status) {
    case 'submitted': return 'Application received — queued for exchange submission.';
    case 'dp_verified': return `DP & PAN verified · awaiting ${a.method === 'upi' ? 'UPI mandate approval' : 'ASBA submission'}.`;
    case 'mandate_pending':
      return a.method === 'upi' ? `Approve the UPI mandate in your UPI app to block ${inr(a.amount)}.` : `Submit the ASBA form at your bank to block ${inr(a.amount)}.`;
    case 'upi_blocked':
      return `${inr(a.amountBlocked ?? a.amount)} blocked by your bank (${a.method === 'upi' ? 'UPI-ASBA' : 'ASBA'}) — confirmed via exchange webhook. Awaiting allotment.`;
    case 'allotted': return `Allotted ${a.allottedShares ?? a.shares} shares · ${inr(a.amountBlocked ?? a.amount)} debited (registrar file).`;
    case 'not_allotted':
    case 'released': return `Not allotted · ${inr(a.amountReleased ?? a.amount)} released back to your bank.`;
    default: return '';
  }
}

export function Portfolio() {
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';

  const mobile = useStore((s) => s.mobile);
  /* Applications and applicants come from the API. They used to fall back to a
     localStorage mock whose lifecycle was walked by `deriveLifecycle` — a
     coin-flip allotment and an invented listing gain, keyed on a hash of the
     application id, shown in the same cards as real registrar results. */
  const [profiles, setProfiles] = useState<Profile[]>([]);
  /**
   * The catalogue, for the Watchlist tab.
   *
   * WHY IT IS FETCHED. That tab looked up each starred symbol with
   * `mockIpoBySymbol()`, which has returned `undefined` unconditionally since
   * the mock catalogue was deleted — so every card hit `if (!ipo) return null`
   * and the tab was EMPTY for everyone who had ever starred anything, while the
   * server held their list perfectly well. One list call fills it.
   */
  const [catalog, setCatalog] = useState<Map<string, IpoListItem> | null>(null);
  const watchlist = useStore((s) => s.watchlist);
  const [tab, setTab] = useState<'apps' | 'check' | 'watch'>('apps');

  // Live mode: signed in against the API → real applications history from GET /applications.
  const useApi = typeof window !== 'undefined' && !!getConsumerToken();
  const [apiApps, setApiApps] = useState<Application[] | null>(null);
  // Named so an in-place action (the UPI change) can pull fresh rows without
  // a page reload; the effect just calls it once.
  const reloadApps = () =>
    listApplications().then((rows) => setApiApps(rows.map(mapApiApp))).catch(() => setApiApps([]));
  useEffect(() => {
    if (!useApi) return;
    reloadApps();
    /* The applicants are needed for the PAN cross-check line under each card
       and for the PAN lookup on the Check-status tab. */
    listProfiles()
      .then((rows) => setProfiles(rows.map(mapApiProfile)))
      .catch(() => setProfiles([]));
    store.syncWatchlist();
  }, [useApi]);

  /* Only when the tab is actually opened — the catalogue is a large payload and
     most visits never look at the watchlist. */
  useEffect(() => {
    if (tab !== 'watch' || catalog) return;
    getIpos()
      .then((rows) => setCatalog(new Map(rows.map((r) => [r.symbol, r]))))
      .catch(() => setCatalog(new Map()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const loadingApps = useApi && apiApps === null;
  const applications = apiApps ?? [];

  // My Applications filters + paging
  const [fIpo, setFIpo] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const resetPage = () => setPage(1);

  /* There was a 12-second tick here, whose only job was to advance the
     simulated pipeline so a demo application appeared to progress. Real status
     changes arrive from the exchange and are read on load. */


  if (!mobile) {
    return (
      <div className="empty fade-up">
        <div className="emoji">🔐</div>
        <h3>{tr('apply.loginRequired')}</h3>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/portfolio${q}`)}`} style={{ marginTop: 14 }}>{tr('login.title')}</a>
      </div>
    );
  }

  /* Status is the server's, from the rail and the registrar. Nothing is derived. */
  const live = applications.map((a) => ({ d: a, raw: a }));
  const blocked = live.reduce((s, { d }) => s + (d.amountBlocked ?? 0), 0);
  const allottedN = live.filter(({ d }) => d.status === 'allotted').length;
  const notN = live.filter(({ d }) => d.status === 'not_allotted').length;

  // filters for the My Applications list
  const ipoOptions = Array.from(new Map(applications.map((a) => [a.ipoSymbol, a.ipoName])).entries());
  const STATUS_FILTERS: AppStatus[] = ['submitted', 'dp_verified', 'mandate_pending', 'upi_blocked', 'allotted', 'not_allotted'];
  const filtered = live.filter(({ d, raw }) => {
    if (fIpo !== 'all' && raw.ipoSymbol !== fIpo) return false;
    if (fStatus !== 'all' && d.status !== fStatus) return false;
    const day = raw.createdAt.slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const hasFilter = fIpo !== 'all' || fStatus !== 'all' || !!fFrom || !!fTo;

  return (
    <div className="fade-up">
      <h1>Portfolio</h1>

      {applications.length > 0 && (
        <div className="metrics" style={{ marginTop: 6 }}>
          <div className="metric"><div className="k">Applications</div><div className="v mono">{applications.length}</div></div>
          <div className="metric"><div className="k">Funds blocked</div><div className="v mono">{inr(blocked)}</div></div>
          <div className="metric"><div className="k">Allotted</div><div className="v mono">{allottedN}</div></div>
          <div className="metric"><div className="k">Not allotted</div><div className="v mono">{notN}</div></div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'apps' ? 'active' : ''}`} onClick={() => setTab('apps')}>
          {tr('apps.title')} {applications.length > 0 && `(${applications.length})`}
        </button>
        <button className={`tab ${tab === 'check' ? 'active' : ''}`} onClick={() => setTab('check')}>Check allotment</button>
        <button className={`tab ${tab === 'watch' ? 'active' : ''}`} onClick={() => setTab('watch')}>
          Watchlist {watchlist.length > 0 && `(${watchlist.length})`}
        </button>
      </div>

      {tab === 'apps' && (
        loadingApps ? (
          <div className="muted" style={{ padding: 16 }}>Loading your applications…</div>
        ) : applications.length === 0 ? (
          <Empty emoji="📄" title={tr('apps.empty')} cta={<a className="btn" href={`/${q}`}>Explore IPOs</a>} />
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="filters">
              <div className="fg">
                <label>IPO</label>
                <select className="input" value={fIpo} onChange={(e) => { setFIpo(e.target.value); resetPage(); }}>
                  <option value="all">All IPOs</option>
                  {ipoOptions.map(([sym, name]) => <option key={sym} value={sym}>{name}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>From</label>
                <input type="date" className="input" value={fFrom} onChange={(e) => { setFFrom(e.target.value); resetPage(); }} />
              </div>
              <div className="fg">
                <label>To</label>
                <input type="date" className="input" value={fTo} onChange={(e) => { setFTo(e.target.value); resetPage(); }} />
              </div>
              <div className="fg">
                <label>Status</label>
                <select className="input" value={fStatus} onChange={(e) => { setFStatus(e.target.value); resetPage(); }}>
                  <option value="all">All statuses</option>
                  {STATUS_FILTERS.map((s) => <option key={s} value={s}>{tr(`appStatus.${s}`)}</option>)}
                </select>
              </div>
              {hasFilter && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setFIpo('all'); setFStatus('all'); setFFrom(''); setFTo(''); resetPage(); }}>
                  Clear
                </button>
              )}
            </div>

            <p className="count-note">
              {filtered.length === 0
                ? 'No applications match the filters.'
                : `Showing ${(curPage - 1) * PAGE_SIZE + 1}–${Math.min(curPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </p>

            <div style={{ marginTop: 10 }}>
              {pageItems.map(({ d }) => <AppCard key={d.id} a={d} detail={applicantLine(d, profiles)} q={q} tr={tr} onSaved={reloadApps} />)}
            </div>

            {totalPages > 1 && (
              <div className="pager">
                <button className="btn btn-secondary btn-sm" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>← Prev</button>
                <span className="pinfo">Page {curPage} of {totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>Next →</button>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'check' && <Checker applications={applications} profiles={profiles} q={q} tr={tr} />}

      {tab === 'watch' && (
        watchlist.length === 0 ? (
          <Empty emoji="☆" title="Your watchlist is empty" cta={<a className="btn" href={`/${q}`}>Browse IPOs</a>} />
        ) : (
          <div className="grid-cards" style={{ marginTop: 16 }}>
            {watchlist.map((sym) => {
              const ipo = catalog?.get(sym);
              /* Still loading, or an IPO we no longer carry. Name the symbol
                 either way: a starred row that renders nothing reads as the
                 star having been lost. */
              if (!ipo) return (
                <div className="card" key={sym}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
                      <CompanyMark name={sym} symbol={sym} size="md" />
                      <div>
                        <a className="linklike" href={`/ipos/${sym}${q}`}><h3>{sym}</h3></a>
                        <div className="meta" style={{ marginTop: 5 }}>
                          <span className="muted">{catalog ? 'Not in the current list' : 'Loading…'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => store.toggleWatch(sym)}>Remove</button>
                  </div>
                </div>
              );
              return (
                <div className="card" key={sym}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
                      <CompanyMark name={ipo.name} symbol={sym} size="md" />
                      <div>
                        <a className="linklike" href={`/ipos/${sym}${q}`}><h3>{titleCase(ipo.name)}</h3></a>
                        <div className="meta" style={{ marginTop: 5 }}>
                          <span className="chip">{ipo.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                          <span className="muted mono">{priceBand(ipo.priceBandMin, ipo.priceBandMax)}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`status ${ipo.status}`}>{tr(`status.${ipo.status}`)}</span>
                  </div>
                  <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => store.toggleWatch(sym)}>Remove</button>
                    {(ipo.status === 'open' || ipo.status === 'upcoming') && (
                      <a className="btn btn-sm" href={`/apply/${sym}${q}`}>{tr('detail.apply')}</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function AppCard({ a, detail, q, tr, onSaved }: { a: Application; detail?: string; q: string; tr: (k: string) => string; onSaved?: () => void }) {
  const stage = stageOf(a);
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
          <CompanyMark name={a.ipoName} symbol={a.ipoSymbol} size="md" />
          <div>
            <a className="linklike" href={`/ipos/${a.ipoSymbol}${q}`}><h3>{a.ipoName}</h3></a>
            <div className="meta" style={{ marginTop: 5 }}>
              <span className="chip">{catShort(a.category)}</span>
              <span className="muted mono">{a.lots} {tr('apply.lots')} · {a.shares} {tr('apply.shares')} · {a.method === 'upi' ? 'UPI' : 'ASBA'}</span>
            </div>
          </div>
        </div>
        <span className={`appstatus ${STATUS_CLASS[a.status]}`}>{tr(`appStatus.${a.status}`)}</span>
      </div>

      <div className="steps" style={{ marginTop: 18, marginBottom: 4 }}>
        {STAGES.map((lbl, i) => (
          <div key={lbl} className={`step ${i + 1 < stage ? 'done' : ''} ${i + 1 === stage ? 'active' : ''}`}>
            <span className="num">{i + 1 < stage ? '✓' : i + 1}</span>
            <span className="lbl">{lbl}</span>
            {i < STAGES.length - 1 && <span className="bar" />}
          </div>
        ))}
      </div>
      {/* The dates now ride on the application itself. They used to come from a
          catalogue lookup that always returned undefined, so this line never
          appeared; it is only rendered when at least one date is known. */}
      {(a.allotmentDate || a.listingDate) && (
        <div className="muted mono" style={{ fontSize: 12, marginBottom: 10 }}>
          Allotment {a.allotmentDate ?? '—'} · Listing {a.listingDate ?? '—'}
        </div>
      )}

      <div className="panel-sub">
        <div className="between">
          <span className="muted mono" style={{ fontSize: 13 }}>{a.applicationNumber} · {a.profileName}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{inr(a.amount)}</span>
        </div>
        {detail && <div className="faint mono" style={{ fontSize: 12, marginTop: 5 }}>{detail}<VerifiedMark a={a} /></div>}
        <div style={{ marginTop: 8, fontSize: 14 }}>{resultText(a)}</div>
        <UpiStatusLine a={a} />
        <UpiChangeControl a={a} onSaved={onSaved} />
        <UnblockControl a={a} onSaved={onSaved} />
        {(a.missingDetails ?? []).map((m) => (
          <div key={m} style={{ marginTop: 6, fontSize: 13, color: 'var(--warn, #b45309)' }}>
            ⚠ {m} — <a href="/account" style={{ color: 'inherit', textDecoration: 'underline' }}>fix on the account page</a>
          </div>
        ))}
        {(a.categorySubscribedTimes != null || a.allotmentOddsPct != null) && (
          <div className="between" style={{ marginTop: 8 }}>
            <span className="muted">{catShort(a.category)} subscription (live)</span>
            <span className="mono" style={{ fontWeight: 700 }}>
              {a.categorySubscribedTimes != null ? `${a.categorySubscribedTimes}x` : '—'}
              {a.allotmentOddsPct != null ? ` · ~${a.allotmentOddsPct}% allotment odds` : ''}
            </span>
          </div>
        )}
        {a.status === 'allotted' && a.listingGainPct != null && (
          <div className="between" style={{ marginTop: 8 }}>
            <span className="muted">Listing gain (est.)</span>
            <span className={`mono ${a.listingGainPct >= 0 ? 'gmp-pos' : 'gmp-neg'}`} style={{ fontWeight: 700 }}>
              {a.listingGainPct >= 0 ? '+' : ''}{a.listingGainPct}% · {inr(Math.round(a.amount * (1 + a.listingGainPct / 100)))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Checker({ applications, profiles, q, tr }: {
  applications: Application[]; profiles: Profile[]; q: string; tr: (k: string) => string;
}) {
  const [query, setQuery] = useState('');
  const [done, setDone] = useState(false);

  const results = useMemo(() => {
    const Q = query.trim().toUpperCase();
    if (!Q) return [];
    const byNo = applications.filter((a) => a.applicationNumber.toUpperCase() === Q);
    if (byNo.length) return byNo;
    const ids = profiles.filter((p) => p.pan && p.pan.toUpperCase() === Q).map((p) => p.id);
    return applications.filter((a) => ids.includes(a.profileId));
  }, [query, applications, profiles]);

  return (
    <div style={{ marginTop: 16, maxWidth: 560 }}>
      <div className="panel">
        <h2>Check allotment status</h2>
        <p className="muted" style={{ marginTop: -2 }}>Enter your <b>PAN</b> or <b>application number</b> to see the result.</p>
        <div className="field" style={{ marginTop: 6 }}>
          <label>PAN or Application No.</label>
          <input
            className="input mono" value={query} placeholder="ABCDE1234F  or  IY123456789"
            onChange={(e) => { setQuery(e.target.value); setDone(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') setDone(true); }}
          />
        </div>
        <button className="btn" disabled={!query.trim()} onClick={() => setDone(true)}>
          <Icon name="search" size={16} /> Check status
        </button>

        {done && (
          results.length === 0 ? (
            <div className="banner warn" style={{ marginTop: 16 }}>No application found for “{query.trim()}”. Check the PAN or application number.</div>
          ) : (
            <div className="stack" style={{ marginTop: 16 }}>
              {results.map((raw) => {
                const a = raw;   // the server's status, not a simulated one
                return (
                  <div className="panel-sub" key={a.id}>
                    <div className="between">
                      <div className="row" style={{ gap: 11, flexWrap: 'nowrap' }}>
                        <CompanyMark name={a.ipoName} symbol={a.ipoSymbol} size="sm" />
                        <div>
                          <a className="linklike" href={`/ipos/${a.ipoSymbol}${q}`} style={{ fontWeight: 650 }}>{a.ipoName}</a>
                          <div className="faint mono" style={{ fontSize: 12 }}>{a.applicationNumber} · {a.profileName}</div>
                        </div>
                      </div>
                      <span className={`appstatus ${STATUS_CLASS[a.status]}`}>{tr(`appStatus.${a.status}`)}</span>
                    </div>
                    <div className="faint mono" style={{ fontSize: 12, marginTop: 8 }}>{applicantLine(a, profiles)}<VerifiedMark a={a} /></div>
                    <div style={{ marginTop: 8, fontSize: 14 }}>{resultText(a)}</div>
                    <UpiStatusLine a={a} />
                    {(a.missingDetails ?? []).map((m) => (
                      <div key={m} style={{ marginTop: 6, fontSize: 13, color: 'var(--warn, #b45309)' }}>
                        ⚠ {m} — <a href="/account" style={{ color: 'inherit', textDecoration: 'underline' }}>fix on the account page</a>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Empty({ emoji, title, cta }: { emoji: string; title: string; cta: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <h3>{title}</h3>
      <div style={{ marginTop: 14 }}>{cta}</div>
    </div>
  );
}
