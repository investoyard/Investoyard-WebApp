'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { checkAllotment, type AllotmentCheck } from '@/lib/consumer-api';
import { Icon } from '@/components/Icon';

/**
 * Allotment checker — "Did you get the shares?" Registrar-style lookup:
 * pick the IPO, enter the applicant's PAN, get the platform's answer per
 * application (allotted n shares / not allotted / pending until the
 * allotment date). Compact variant lives on the homepage; the full page
 * adds context and registrar fallbacks.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function AllotmentChecker({ ipos: baked, compact = false }: { ipos?: IpoFull[]; compact?: boolean }) {
  const [ipos, setIpos] = useState<IpoFull[]>(baked ?? []);
  const [ipoId, setIpoId] = useState('');
  const [pan, setPan] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AllotmentCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  // IPOs worth checking: allotment phase first (closed), then listed, newest allotment first
  const options = useMemo(() => {
    return ipos
      .filter((i) => (i.status === 'closed' || i.status === 'listed') && i.allotmentDate)
      .sort((a, b) => (String(b.allotmentDate) < String(a.allotmentDate) ? -1 : 1));
  }, [ipos]);
  useEffect(() => { if (!ipoId && options.length) setIpoId((options[0] as any).id); }, [options, ipoId]);

  const panOk = PAN_RE.test(pan);

  const onCheck = async () => {
    if (!ipoId || !panOk || busy) return;
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await checkAllotment(ipoId, pan)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const fmtD = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

  return (
    <div className={`ac ${compact ? 'compact' : ''}`}>
      <div className="ac-form">
        {compact && (
          <span className="ac-lead">
            <span className="ac-badge"><Icon name="receipt" size={18} /></span>
            <span className="ac-title">Did you get the shares?</span>
          </span>
        )}
        <select className="input ac-sel" value={ipoId} onChange={(e) => { setIpoId(e.target.value); setRes(null); }} aria-label="Select IPO">
          {options.length === 0 && <option value="">No allotments to check yet</option>}
          {options.map((i) => (
            <option key={(i as any).id} value={(i as any).id}>{i.symbol} — {i.name}</option>
          ))}
        </select>
        <input
          className="input mono ac-pan" placeholder="PAN (ABCDE1234F)" maxLength={10}
          value={pan} onChange={(e) => { setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setRes(null); }}
          aria-label="PAN"
        />
        <button className="btn ac-btn" disabled={!ipoId || !panOk || busy} onClick={onCheck}>
          {busy ? 'Checking…' : 'Check allotment'}
        </button>
      </div>
      {pan && !panOk && <p className="hint" style={{ color: 'var(--neg)', marginTop: 6 }}>PAN is 10 characters — e.g. ABCDE1234F.</p>}
      {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}

      {res && (
        <div className="ac-results">
          {!res.found ? (
            <div className="banner info" style={{ margin: 0 }}>
              No application with this PAN for {res.ipo.symbol} on Investoyard. Applied through a bank or another
              platform? Check on the registrar&apos;s website with the same PAN.
            </div>
          ) : res.results.map((r, i) => (
            <div className={`ac-row ${r.status}`} key={i}>
              <span className="grow">
                <span className="t">{r.applicant}</span>
                <span className="s">{r.category}{r.applicantType === 'shareholder' ? ' · Shareholder quota' : ''} · {r.lots} {r.lots === 1 ? 'lot' : 'lots'} bid</span>
              </span>
              {r.status === 'allotted' && (
                <span className="ac-verdict ok"><Icon name="check" size={14} strokeWidth={2.6} /> Allotted{r.allottedShares ? ` · ${r.allottedShares.toLocaleString('en-IN')} shares` : ''}</span>
              )}
              {r.status === 'not_allotted' && <span className="ac-verdict no">Not allotted — block releases automatically</span>}
              {r.status === 'processing' && <span className="ac-verdict wait">Allotment out — status updating shortly</span>}
              {r.status === 'pending' && (
                <span className="ac-verdict wait">Pending{res.ipo.allotmentDate ? ` — expected ${fmtD(res.ipo.allotmentDate)}` : ''}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
