'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { inr, priceBand } from '@/lib/format';
import { mockIpoBySymbol, type IpoDetail } from '@/lib/api';
import { CompanyMark } from '@/components/CompanyMark';
import { Icon } from '@/components/Icon';
import { useStore, store, Application, AppStatus, Profile } from '@/lib/store';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

const STATUS_CLASS: Record<AppStatus, string> = {
  draft: 'wait', submitted: 'info', dp_verified: 'info', dp_failed: 'bad',
  mandate_pending: 'wait', upi_blocked: 'info', confirmed: 'info',
  allotted: 'good', not_allotted: 'bad', released: 'info', rejected: 'bad', failed: 'bad',
};

// distributor lifecycle stages (what WE drive vs. what bank/registrar do)
const STAGES = ['Sent to exchange', 'DP & PAN verified', 'Funds blocked', 'Allotment', 'Refund / Listing'];
const catShort = (c: Application['category']) =>
  c === 'Retail' ? 'Retail' : c === 'sNII' ? 'Small-NII' : 'Big-NII';

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
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

/** Live status derived from the IPO's real dates + time since bid (no manual buttons). */
function deriveLifecycle(a: Application, ipo?: IpoDetail): Application {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const created = Date.parse(a.createdAt) || now;
  const age = (now - created) / 1000; // seconds since bid placed
  const allotted = hashStr(a.id) % 2 === 0;            // demo "draw of lots" (deterministic)
  const gain = (hashStr(a.id + 'L') % 41) - 12;        // demo listing gain
  const { closeDate, allotmentDate, listingDate } = ipo ?? {};

  // After allotment date → registrar result (file/API)
  if (allotmentDate && today >= allotmentDate) {
    if (allotted) {
      return { ...a, status: 'allotted', allottedShares: a.shares, amountBlocked: a.amount, amountReleased: 0,
        listingGainPct: listingDate && today >= listingDate ? gain : undefined };
    }
    return { ...a, status: 'not_allotted', allottedShares: 0, amountBlocked: 0, amountReleased: a.amount };
  }
  // Closed, awaiting allotment → funds blocked
  if (closeDate && today >= closeDate) return { ...a, status: 'upi_blocked', amountBlocked: a.amount };
  // Still open → early pipeline by time-since-bid (sent → DP verified → mandate → blocked)
  if (age < 20) return { ...a, status: 'submitted' };
  if (age < 45) return { ...a, status: 'dp_verified' };
  if (age < 75 && a.method === 'upi') return { ...a, status: 'mandate_pending' };
  return { ...a, status: 'upi_blocked', amountBlocked: a.amount };
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
    case 'submitted': return 'Bid pushed to NSE / BSE — awaiting depository (DP) verification.';
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
  const applications = useStore((s) => s.applications);
  const profiles = useStore((s) => s.profiles);
  const watchlist = useStore((s) => s.watchlist);
  const [tab, setTab] = useState<'apps' | 'check' | 'watch'>('apps');

  // My Applications filters + paging
  const [fIpo, setFIpo] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const resetPage = () => setPage(1);

  // gentle tick so the early pipeline (sent → DP verified → mandate → blocked) advances live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 12000);
    return () => clearInterval(id);
  }, []);

  if (!mobile) {
    return (
      <div className="empty fade-up">
        <div className="emoji">🔐</div>
        <h3>{tr('apply.loginRequired')}</h3>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/portfolio${q}`)}`} style={{ marginTop: 14 }}>{tr('login.title')}</a>
      </div>
    );
  }

  const live = applications.map((a) => {
    const ipo = mockIpoBySymbol(a.ipoSymbol);
    return { d: deriveLifecycle(a, ipo), ipo, raw: a };
  });
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
        applications.length === 0 ? (
          <Empty emoji="📄" title={tr('apps.empty')} cta={<a className="btn" href={`/${q}`}>Explore IPOs</a>} />
        ) : (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
              <Icon name="bolt" size={14} style={{ verticalAlign: '-2px' }} /> Status updates automatically — bid &amp; status via the <b>NSE e-IPO / BSE iBBS</b> webhook; allotment from the <b>registrar</b> file/API. The bank blocks the funds.
            </p>

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
              {pageItems.map(({ d, ipo }) => <AppCard key={d.id} a={d} ipo={ipo} detail={applicantLine(d, profiles)} q={q} tr={tr} />)}
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
              const ipo = mockIpoBySymbol(sym);
              if (!ipo) return null;
              return (
                <div className="card" key={sym}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
                      <CompanyMark name={ipo.name} symbol={sym} size="md" />
                      <div>
                        <a className="linklike" href={`/ipos/${sym}${q}`}><h3>{ipo.name}</h3></a>
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

function AppCard({ a, ipo, detail, q, tr }: { a: Application; ipo?: IpoDetail; detail?: string; q: string; tr: (k: string) => string }) {
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
      {ipo && (
        <div className="muted mono" style={{ fontSize: 12, marginBottom: 10 }}>
          Allotment {ipo.allotmentDate ?? '—'} · Listing {ipo.listingDate ?? '—'}
        </div>
      )}

      <div className="panel-sub">
        <div className="between">
          <span className="muted mono" style={{ fontSize: 13 }}>{a.applicationNumber} · {a.profileName}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{inr(a.amount)}</span>
        </div>
        {detail && <div className="faint mono" style={{ fontSize: 12, marginTop: 5 }}>{detail}</div>}
        <div style={{ marginTop: 8, fontSize: 14 }}>{resultText(a)}</div>
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
                const a = deriveLifecycle(raw, mockIpoBySymbol(raw.ipoSymbol));
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
                    <div className="faint mono" style={{ fontSize: 12, marginTop: 8 }}>{applicantLine(a, profiles)}</div>
                    <div style={{ marginTop: 8, fontSize: 14 }}>{resultText(a)}</div>
                  </div>
                );
              })}
            </div>
          )
        )}
        <p className="disclaimer" style={{ marginTop: 14 }}>Demo: searches your own applications. Production checks the registrar (KFin / Link Intime / Bigshare) by PAN.</p>
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
