'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { IpoDetail } from '@/lib/api';
import { getIpoDetail } from '@/lib/api';
import { inr } from '@/lib/format';
import { CompanyMark } from '@/components/CompanyMark';
import { Icon } from '@/components/Icon';
import { useTenant } from '@/components/TenantProvider';
import { useStore, store, Application, InvestorCategory, Profile } from '@/lib/store';
import { getConsumerToken, listProfiles, createApplication, type ApiProfile } from '@/lib/consumer-api';
import { makeBidEngine, type BidQuote } from '@investoyard/shared-types';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

/**
 * Apply flow — UPI-mandate applications ONLY (the print/bank-ASBA path lives at
 * /print/<symbol>). Category-first bidding per sir's spec: Retail | HNI |
 * Shareholder tabs → fixed dropdown of lot multiples priced at the band ceiling
 * (Retail/Shareholder ≤ ₹2L · HNI ₹2L→UPI cap) + Min/Max-Retail & sHNI quick
 * chips + per-family-member overrides, all driven by the shared bid engine.
 */

type Tab = 'retail' | 'hni' | 'sha';
interface Choice { tab: Tab; q: BidQuote }

const tabCat = (c: Choice): InvestorCategory => (c.tab === 'hni' ? (c.q.category === 'bhni' ? 'bNII' : 'sNII') : 'Retail');
const tabLabel = (c: Choice) => (c.tab === 'sha' ? 'Shareholder' : c.tab === 'hni' ? 'HNI (sNII)' : 'Retail');

/**
 * Can this applicant be selected for the UPI flow? PAN + demat + their OWN UPI
 * are required; minors have no UPI mandate — both route to the Print-PDF flow.
 */
function applyReady(p: Profile): boolean {
  const dematOk = p.depository === 'CDSL' ? !!p.clientId : !!(p.dpId && p.clientId);
  return Boolean(p.fullName && p.pan && dematOk && p.consent);
}
function upiReady(p: Profile): boolean {
  return applyReady(p) && !!p.upiId && p.relationship !== 'child';
}
function missingBits(p: Profile): string {
  const bits: string[] = [];
  if (!p.pan) bits.push('PAN');
  if (p.depository === 'CDSL' ? !p.clientId : !(p.dpId && p.clientId)) bits.push('demat details');
  return bits.join(' & ') || 'details';
}

/** Map a masked API profile into the local Profile shape the wizard already renders. */
function mapApiProfile(p: ApiProfile): Profile {
  return {
    id: p.id,
    relationship: p.relationship as any,
    fullName: p.fullName,
    pan: p.pan,
    depository: p.depository as any,
    dpId: p.dpId,
    clientId: p.clientId,
    upiId: p.hasUpi ? 'upi-verified' : undefined,
    bankAccount: p.hasBank ? 'set' : undefined,
    ifsc: p.ifsc,
    kycStatus: (p.kycStatus as any) ?? 'unverified',
    consent: true,
  };
}

export function ApplyWizard({ ipo, lang = 'en' }: { ipo: IpoDetail; lang?: Lang }) {
  const sp = useSearchParams();
  const L = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : lang) as Lang;
  const tr = makeT(L);
  const q = L !== 'en' ? `?lang=${L}` : '';

  const tenant = useTenant();
  const mobile = useStore((s) => s.mobile);
  const storeProfiles = useStore((s) => s.profiles);
  const applications = useStore((s) => s.applications);
  const relL = (r: string) => { const k = `rel.${r}`; const v = tr(k); return v === k ? String(r).charAt(0).toUpperCase() + String(r).slice(1) : v; };

  // Live mode: a real logged-in session + a real catalog IPO (server UUID id) → submit to the API.
  const [apiProfiles, setApiProfiles] = useState<Profile[] | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveDetail, setLiveDetail] = useState<IpoDetail | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  const hasToken = typeof window !== 'undefined' && !!getConsumerToken();
  // Operator gates (IPO form → Start Bid / Start Printing) — from the LIVE detail.
  const [gates, setGates] = useState<{ bid: boolean; print: boolean } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (getConsumerToken()) listProfiles().then((rows) => setApiProfiles(rows.map(mapApiProfile))).catch(() => setApiProfiles([]));
    // Fetch the live catalog detail client-side to get the real server id (the baked prop may be MOCK).
    getIpoDetail(ipo.symbol).then((d) => {
      if (d?.live && d.id) { setLiveId(d.id); setLiveDetail(d); }
      const ex: any = (d as any)?.extra ?? (ipo as any).extra ?? {};
      setGates({ bid: ex.startBid === true, print: ex.startPrint === true });
    }).catch(() => {
      const ex: any = (ipo as any).extra ?? {};
      setGates({ bid: ex.startBid === true, print: ex.startPrint === true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canPrint = gates?.print === true;
  const liveMode = !!liveId && hasToken;
  const profiles = liveMode ? (apiProfiles ?? []) : storeProfiles;
  const eff = liveDetail ?? ipo;

  // The shared bid engine, with the operator's UPI cap (admin setting via tenant flags).
  const upiCap = tenant.flags.upiCap;
  const engine = useMemo(
    () => makeBidEngine({ lotSize: eff.lotSize, priceBandMax: eff.priceBandMax ?? eff.priceBandMin }, { upiCap }),
    [eff.lotSize, eff.priceBandMax, eff.priceBandMin, upiCap],
  );
  const allowShareholder = ((eff as any).reservations ?? []).includes('shareholder');
  const bandMax = eff.priceBandMax ?? eff.priceBandMin ?? 0;

  const lotsParam = parseInt(sp.get('lots') ?? '', 10);
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [master, setMaster] = useState<Choice | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Choice>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [consent, setConsent] = useState({ share: false, selfpan: false, gmp: false });
  const [placed, setPlaced] = useState<Application[] | null>(null);

  // OTP verification on the partner-share consent
  const [otpStage, setOtpStage] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // default master = ?lots= (from the detail-page calculator) if valid & UPI-payable, else min retail
  useEffect(() => {
    if (!engine || master) return;
    const fromParam = Number.isFinite(lotsParam) && lotsParam >= 1 ? engine.quote(lotsParam) : null;
    if (fromParam && fromParam.amount <= engine.rules.upiCap) {
      setMaster({ tab: fromParam.category === 'retail' ? 'retail' : 'hni', q: fromParam });
    } else if (engine.presets.minRetail) {
      setMaster({ tab: 'retail', q: engine.presets.minRetail });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, master]);

  const selected = useMemo(
    () => profiles.filter((p) => selectedIds.includes(p.id) && upiReady(p)),
    [profiles, selectedIds],
  );
  const choiceFor = (p: Profile): Choice | null => overrides[p.id] ?? master;
  const totalAmount = selected.reduce((s, p) => s + (choiceFor(p)?.q.amount ?? 0), 0);
  const uniform = selected.length > 0 && selected.every((p) => {
    const c = choiceFor(p); const m = choiceFor(selected[0]);
    return c && m && c.q.lots === m.q.lots && c.tab === m.tab;
  });

  const allConsent = consent.share && consent.selfpan && consent.gmp;
  const consentVerified = otpStage === 'verified';
  const otpFull = otp.every((d) => d !== '');

  const stepLabels = [tr('apply.applicant'), 'Bid', 'Consent', 'UPI mandate', 'Done'];

  /* ----- auth gate ----- */
  if (!mobile) {
    return (
      <div className="empty fade-up">
        <div className="emoji">🔐</div>
        <h3>{tr('apply.loginRequired')}</h3>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/apply/${ipo.symbol}${q}`)}`} style={{ marginTop: 14 }}>
          {tr('login.title')}
        </a>
      </div>
    );
  }

  /* ----- operator "Start Bid" gate ----- */
  if ((ipo.status === 'open' || ipo.status === 'upcoming') && gates && !gates.bid) {
    return (
      <div className="empty fade-up">
        <div className="emoji">⏳</div>
        <h3>Bidding hasn&apos;t started yet</h3>
        <p className="muted">Applications for {ipo.name} will open shortly — check back soon.</p>
        <a className="btn" href={`/ipos/${ipo.symbol}${q}`} style={{ marginTop: 14 }}>View IPO details</a>
      </div>
    );
  }

  function toggleApplicant(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // One application per PAN per issue — block a duplicate PAN.
      const p = profiles.find((x) => x.id === id);
      if (p?.pan && profiles.some((o) => prev.includes(o.id) && o.pan === p.pan)) return prev;
      return [...prev, id];
    });
  }

  /** Build a local Application (for the confirmation screen) from a server response. */
  function toLocalApp(res: any, p: Profile, c: Choice): Application {
    const app = res?.application ?? {};
    const idStr = String(app.id ?? '');
    return {
      id: idStr || Math.random().toString(36).slice(2),
      ipoSymbol: ipo.symbol, ipoName: ipo.name, profileId: p.id, profileName: p.fullName || tr('rel.self'),
      pan: p.pan, depository: p.depository, dpId: p.dpId, clientId: p.clientId, upiId: p.upiId,
      lots: c.q.lots, shares: c.q.shares, pricePerShare: bandMax, atCutoff: c.tab !== 'hni',
      category: tabCat(c), amount: c.q.amount, method: 'upi',
      status: 'mandate_pending',
      applicationNumber: idStr ? `IY${idStr.replace(/-/g, '').slice(0, 9).toUpperCase()}` : 'IY' + Math.floor(1e8 + Math.random() * 9e8),
      createdAt: app.createdAt ?? new Date().toISOString(),
    };
  }

  async function place() {
    if (!selected.length || placing || !master) return;

    // LIVE: real logged-in user + real catalog IPO → create real applications in the DB.
    if (liveMode && liveId) {
      setPlacing(true); setPlaceErr(null);
      try {
        const results: Application[] = [];
        for (const p of selected) {
          const c = choiceFor(p)!;
          const res = await createApplication({
            investorProfileId: p.id,
            ipoId: liveId,
            category: tabCat(c),
            lots: c.q.lots,
            atCutoff: c.tab !== 'hni',                 // cut-off is Retail/Shareholder-only
            bidPrice: c.tab !== 'hni' ? undefined : bandMax,
            applyMethod: 'native',
            applicantType: c.tab === 'sha' ? 'shareholder' : 'individual',
            dataSharingConsent: true,
            consentNoticeVersion: 'ds-rail-v1',
          });
          results.push(toLocalApp(res, p, c));
        }
        setPlaced(results);
        setStep(5);
      } catch (e: any) {
        setPlaceErr(String(e?.message ?? e));
      } finally {
        setPlacing(false);
      }
      return;
    }

    // DEMO: no live IPO / not signed in against the API → walk the flow on the local store.
    const apps = selected.map((p) => {
      const c = choiceFor(p)!;
      return store.placeApplication({
        ipoSymbol: ipo.symbol, ipoName: ipo.name, profileId: p.id, profileName: p.fullName || tr('rel.self'),
        pan: p.pan, depository: p.depository, dpId: p.dpId, clientId: p.clientId, upiId: p.upiId,
        lots: c.q.lots, shares: c.q.shares, pricePerShare: bandMax, atCutoff: c.tab !== 'hni',
        category: tabCat(c), amount: c.q.amount, method: 'upi',
      });
    });
    setPlaced(apps);
    setStep(5);
  }

  // Ticking the partner-share consent sends an OTP to the registered mobile.
  function toggleShare(checked: boolean) {
    setConsent((c) => ({ ...c, share: checked }));
    setOtp(['', '', '', '', '', '']);
    setOtpStage(checked ? 'sent' : 'idle');
  }
  function setOtpDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    setOtp((prev) => { const n = [...prev]; n[i] = d; return n; });
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function otpKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  /* ----- confirmation ----- */
  if (placed) {
    return (
      <div className="fade-up" style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, margin: '0 auto', borderRadius: '50%', background: 'var(--pos-soft)', color: 'var(--pos)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={34} strokeWidth={2.5} />
        </div>
        <h1 style={{ marginTop: 16 }}>{placed.length > 1 ? `${placed.length} applications placed` : 'Application placed'}</h1>
        <p className="lead" style={{ margin: '0 auto' }}>
          Each applicant approves their own UPI mandate with their own PAN, demat &amp; bank.
        </p>
        <div className="panel" style={{ marginTop: 22, textAlign: 'left' }}>
          {placed.map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="between">
                <span style={{ fontWeight: 600 }}>{a.profileName} <span className="faint mono" style={{ fontWeight: 400 }}>· {a.applicationNumber}</span></span>
                <span className="mono" style={{ fontWeight: 700 }}>{inr(a.amount)}</span>
              </div>
              <div className="faint mono" style={{ fontSize: 12, marginTop: 4 }}>
                {a.lots} {tr('apply.lots')} · {a.shares} {tr('apply.shares')} · {catLabel(a.category)}{a.atCutoff ? ' · cut-off' : ` · @ ${inr(a.pricePerShare)}`}
              </div>
              <div className="faint mono" style={{ fontSize: 12, marginTop: 2 }}>{applicantDetail(a)}</div>
            </div>
          ))}
          <div className="kv"><span className="k"><b>Total to block</b></span><span className="v mono"><b>{inr(placed.reduce((s, a) => s + a.amount, 0))}</b></span></div>
        </div>
        <div className="banner warn" style={{ marginTop: 14, textAlign: 'left' }}>
          Approve the UPI mandate in each applicant&apos;s UPI app to block the amounts above. No money moves until shares are allotted.
        </div>
        {placeErr && <div className="banner warn" style={{ marginTop: 10, textAlign: 'left' }}>{placeErr}</div>}
        <p className="disclaimer" style={{ marginTop: 14 }}>
          Bid{placed.length > 1 ? 's' : ''} routed via <b>NSE e-IPO / BSE iBBS</b> · DP &amp; UPI status update automatically via the exchange webhook. Track in your Portfolio.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <a className="btn btn-secondary" href={`/${q}`}>Explore more</a>
          <a className="btn" href={`/portfolio${q}`}>{tr('apps.title')}</a>
        </div>
      </div>
    );
  }

  /* ----- the quantity picker (master + per-member overrides use the same control) ----- */
  function BidPicker({ choice, onChange, compact }: { choice: Choice; onChange: (c: Choice) => void; compact?: boolean }) {
    if (!engine) return null;
    const options = choice.tab === 'hni' ? engine.hniUpiOptions() : engine.retailOptions();
    const tabs: { key: Tab; label: string; hidden?: boolean }[] = [
      { key: 'retail', label: 'Retail' },
      { key: 'hni', label: 'HNI' },
      { key: 'sha', label: 'Shareholder', hidden: !allowShareholder },
    ];
    const switchTab = (t: Tab) => {
      if (t === choice.tab) return;
      const opts = t === 'hni' ? engine.hniUpiOptions() : engine.retailOptions();
      const q0 = t === 'hni' ? opts[0] : (engine.presets.minRetail ?? opts[0]);
      if (q0) onChange({ tab: t, q: q0 });
      else onChange({ ...choice, tab: t });
    };
    const chips: { label: string; q: BidQuote | null; tab: Tab; hidden?: boolean }[] = [
      { label: 'Min Retail', q: engine.presets.minRetail, tab: choice.tab === 'sha' ? 'sha' : 'retail' },
      { label: 'Max Retail', q: engine.presets.maxRetail, tab: choice.tab === 'sha' ? 'sha' : 'retail' },
      { label: 'sHNI', q: engine.presets.sHni, tab: 'hni', hidden: choice.tab === 'sha' || engine.presets.sHni.amount > engine.rules.upiCap },
    ];
    return (
      <div className={compact ? 'bp compact' : 'bp'}>
        <div className="bp-tabs" role="tablist">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={choice.tab === t.key}
              className={`bp-tab ${choice.tab === t.key ? 'on' : ''}`} onClick={() => switchTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {options.length === 0 ? (
          <div className="banner warn" style={{ marginTop: 12 }}>
            {choice.tab === 'hni'
              ? <>No HNI sizes fit under the {inr(engine.rules.upiCap)} UPI-mandate cap for this lot size — use <a href={`/print/${ipo.symbol}${q}`}>Print PDF</a> (bank ASBA) instead.</>
              : 'One lot already exceeds the ₹2,00,000 retail cap for this issue.'}
          </div>
        ) : (
          <>
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label>
                Bid size
                <span className="hint"> · {choice.tab === 'hni' ? `${inr(engine.rules.retailCap)}–${inr(engine.rules.upiCap)}` : `up to ${inr(engine.rules.retailCap)}`} · shares × {inr(bandMax)} = total</span>
              </label>
              <select
                className="input mono"
                value={options.some((o) => o.lots === choice.q.lots) ? choice.q.lots : ''}
                onChange={(e) => { const o = options.find((x) => x.lots === Number(e.target.value)); if (o) onChange({ ...choice, q: o }); }}
              >
                {!options.some((o) => o.lots === choice.q.lots) && <option value="" disabled>Select…</option>}
                {options.map((o) => (
                  <option key={o.lots} value={o.lots}>
                    {o.lots} {o.lots === 1 ? 'lot' : 'lots'} — {o.shares.toLocaleString('en-IN')} sh × ₹{bandMax} = {inr(o.amount)}
                  </option>
                ))}
              </select>
            </div>
            <div className="bp-chips">
              {chips.filter((c) => !c.hidden && c.q).map((c) => (
                <button key={c.label} type="button"
                  className={`bp-chip ${choice.q.lots === c.q!.lots && ((c.tab === 'hni') === (choice.tab === 'hni')) ? 'on' : ''}`}
                  onClick={() => onChange({ tab: c.tab, q: c.q! })}>
                  {c.label} · {inr(c.q!.amount)}
                </button>
              ))}
            </div>
          </>
        )}
        {choice.tab === 'sha' && (
          <p className="hint" style={{ marginTop: 8 }}>Shareholder reserved quota — for existing shareholders of the parent/promoter company · max {inr(engine.rules.retailCap)}.</p>
        )}
        {choice.tab === 'hni' && (
          <p className="hint" style={{ marginTop: 8 }}>
            HNI bids carry no cut-off — priced at the band ceiling. Above {inr(engine.rules.upiCap)} (UPI-mandate cap)? <a href={`/print/${ipo.symbol}${q}`}>Print PDF</a> for bank ASBA.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="fade-up">
      <a href={`/ipos/${ipo.symbol}${q}`} className="back-link">← {ipo.name}</a>
      <h1 style={{ marginTop: 10 }}>{tr('apply.title')}</h1>

      {/* progress */}
      <div className="steps">
        {stepLabels.map((lbl, i) => {
          const n = i + 1;
          return (
            <div key={lbl} className={`step ${step === n ? 'active' : step > n ? 'done' : ''}`}>
              <span className="num">{step > n ? '✓' : n}</span>
              <span className="lbl">{lbl}</span>
              {i < stepLabels.length - 1 && <span className="bar" />}
            </div>
          );
        })}
      </div>

      <div className="apply-layout">
        <div>
          {/* STEP 1 — applicant */}
          {step === 1 && (
            <Section title={tr('apply.applicant')} hint="Select one or more — each applicant applies with their own PAN, demat & UPI.">
              {profiles.length === 0 ? (
                <Prompt tr={tr} q={q} />
              ) : (
                <div className="choice">
                  {profiles.map((p) => {
                    if (upiReady(p)) {
                      const isSel = selectedIds.includes(p.id);
                      const alreadyApplied = applications.some((a) => a.ipoSymbol === ipo.symbol && a.profileId === p.id);
                      const panClash = !isSel && selected.some((s) => s.pan && s.pan === p.pan);
                      const blocked = alreadyApplied || panClash;
                      return (
                        <label key={p.id} className={`choice-card ${isSel ? 'on' : ''}`} style={blocked ? { opacity: .55, cursor: 'not-allowed' } : undefined}>
                          <span className="checkbox" />
                          <input type="checkbox" hidden disabled={blocked}
                            checked={isSel} onChange={() => toggleApplicant(p.id)} />
                          <span className="grow">
                            <span className="t">{p.fullName || tr('profile.new')}</span>
                            <span className="s">{relL(p.relationship)}{p.pan ? ` · ${p.pan}` : ''}</span>
                          </span>
                          {alreadyApplied
                            ? <span className="appstatus info">Already applied</span>
                            : panClash
                              ? <span className="appstatus bad">Same PAN</span>
                              : <span className="appstatus good">{tr('profiles.ready')}</span>}
                        </label>
                      );
                    }
                    // Not eligible for the UPI flow — minors & no-UPI route to Print PDF.
                    const reason = !applyReady(p)
                      ? `Missing ${missingBits(p)} to apply`
                      : p.relationship === 'child'
                        ? 'Minor — no UPI mandate; use Print PDF (bank ASBA)'
                        : 'No UPI ID saved — add it, or use Print PDF (bank ASBA)';
                    return (
                      <div key={p.id} className="choice-card" style={{ cursor: 'default', opacity: .8 }}>
                        <span className="grow">
                          <span className="t">{p.fullName || relL(p.relationship)}</span>
                          <span className="s">{reason}</span>
                        </span>
                        {!applyReady(p) ? (
                          liveMode
                            ? <a className="btn btn-secondary btn-sm" href={`/account${q}`}>Complete details</a>
                            : <button type="button" className="btn btn-secondary btn-sm" onClick={() => store.fillSample(p.id)}>Use sample details</button>
                        ) : (
                          <a className="btn btn-secondary btn-sm" href={`/print/${ipo.symbol}${q}`}>Print PDF</a>
                        )}
                      </div>
                    );
                  })}
                  <a className="linklike" href={`/account${q}`} style={{ fontSize: 14, marginTop: 4 }}>+ {tr('profiles.add')}</a>
                </div>
              )}
              {selected.length > 0 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                  {selected.length} applicant{selected.length > 1 ? 's' : ''} selected · {selected.map((p) => p.fullName.split(' ')[0]).join(', ')}
                </p>
              )}
              <Nav onNext={() => setStep(2)} nextDisabled={selected.length === 0} tr={tr} />
            </Section>
          )}

          {/* STEP 2 — bid: category tabs + fixed dropdown + quick chips + per-member overrides */}
          {step === 2 && engine && master && (
            <Section title="Category & bid size" hint={`Sets every selected applicant — fine-tune anyone below. Prices at the band ceiling (${inr(bandMax)}/share); retail bids at cut-off.`}>
              <BidPicker choice={master} onChange={(c) => { setMaster(c); setOverrides({}); setEditing(null); }} />

              {/* per-member overrides */}
              <div style={{ marginTop: 18 }}>
                {selected.map((p) => {
                  const c = choiceFor(p)!;
                  const overridden = !!overrides[p.id];
                  return (
                    <div key={p.id}>
                      <div className="pf-row">
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="t">{p.fullName}{overridden && <em className="pf-own">custom</em>}</span>
                          <span className="s mono">{c.q.lots} {c.q.lots === 1 ? 'lot' : 'lots'} · {c.q.shares.toLocaleString('en-IN')} sh · {inr(c.q.amount)}</span>
                        </span>
                        <span className="pf-badge neutral">{tabLabel(c)}</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                          {editing === p.id ? 'Close' : 'Change'}
                        </button>
                      </div>
                      {editing === p.id && (
                        <div className="pf-edit">
                          <BidPicker compact choice={c} onChange={(nc) => setOverrides((o) => ({ ...o, [p.id]: nc }))} />
                          {overridden && (
                            <button type="button" className="linklike" style={{ fontSize: 12.5, marginTop: 8 }}
                              onClick={() => { setOverrides((o) => { const { [p.id]: _, ...rest } = o; return rest; }); setEditing(null); }}>
                              Reset to main selection
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="kv" style={{ marginTop: 12 }}>
                  <span className="k">Total to block ({selected.length} {selected.length === 1 ? 'applicant' : 'applicants'})</span>
                  <span className="v mono">{inr(totalAmount)}</span>
                </div>
              </div>

              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={selected.some((p) => !choiceFor(p))} tr={tr} />
            </Section>
          )}
          {step === 2 && !engine && (
            <Section title="Category & bid size">
              <div className="banner warn">Price band / lot size not announced yet — bidding opens once the issue is priced.</div>
              <Nav onBack={() => setStep(1)} onNext={() => {}} nextDisabled tr={tr} />
            </Section>
          )}

          {/* STEP 3 — consent (DPDP itemized) + OTP verification on partner-share consent */}
          {step === 3 && (
            <Section title="Consent" hint="Explicit, itemized — per DPDP. Collected just-in-time at apply.">
              <div className="stack">
                <label className="consent">
                  <input type="checkbox" checked={consent.share} onChange={(e) => toggleShare(e.target.checked)} />
                  <span>{tr('profile.consent')}</span>
                </label>
                <label className="consent">
                  <input type="checkbox" checked={consent.selfpan} onChange={(e) => setConsent({ ...consent, selfpan: e.target.checked })} />
                  <span>{tr('apply.selfPan')}</span>
                </label>
                <label className="consent">
                  <input type="checkbox" checked={consent.gmp} onChange={(e) => setConsent({ ...consent, gmp: e.target.checked })} />
                  <span>{tr('detail.disclaimer')}</span>
                </label>
              </div>

              {/* OTP verification — triggered by ticking the partner-share consent */}
              {otpStage !== 'idle' && (
                <div className="panel-sub" style={{ marginTop: 16 }}>
                  {otpStage === 'verified' ? (
                    <div className="banner ok" style={{ margin: 0 }}>
                      <Icon name="check" size={18} /> Mobile verified — consent confirmed for +91 {mobile}.
                    </div>
                  ) : (
                    <>
                      <div className="between">
                        <strong>Verify your consent</strong>
                        <span className="muted" style={{ fontSize: 13 }}>OTP sent to +91 {mobile}</span>
                      </div>
                      <div className="otp" style={{ marginTop: 14 }}>
                        {otp.map((d, i) => (
                          <input
                            key={i} ref={(el) => { otpRefs.current[i] = el; }}
                            className="mono" inputMode="numeric" maxLength={1} value={d}
                            onChange={(e) => setOtpDigit(i, e.target.value)}
                            onKeyDown={(e) => otpKey(i, e)} autoFocus={i === 0}
                          />
                        ))}
                      </div>
                      <div className="row" style={{ marginTop: 14, gap: 16 }}>
                        <button className="btn btn-sm" disabled={!otpFull} onClick={() => setOtpStage('verified')}>
                          {tr('login.verify')}
                        </button>
                        <span className="linklike" onClick={() => { setOtp(['', '', '', '', '', '']); setOtpStage('sent'); }}>
                          {tr('login.resend')}
                        </span>
                      </div>
                      <div className="banner info" style={{ marginTop: 12 }}>Demo: enter any 6 digits to verify.</div>
                    </>
                  )}
                </div>
              )}

              {/* footer — Continue appears only after OTP is verified and all consents are ticked */}
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                {allConsent && consentVerified ? (
                  <button className="btn" onClick={() => setStep(4)}>{tr('apply.cta')}</button>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>
                    {!consent.share
                      ? 'Tick the consent to receive an OTP'
                      : !consentVerified
                        ? 'Verify the OTP to continue'
                        : 'Tick all consents to proceed'}
                  </span>
                )}
              </div>
            </Section>
          )}

          {/* STEP 4 — UPI mandate review (the print/bank path lives at /print) */}
          {step === 4 && (
            <Section title="UPI mandate" hint="Each applicant approves their own UPI mandate — their own bank blocks the amount (ASBA).">
              <div className="panel-sub">
                {selected.map((p) => {
                  const c = choiceFor(p)!;
                  return (
                    <div className="between" key={p.id} style={{ padding: '7px 0' }}>
                      <span className="muted">{p.fullName} <span className="faint">· {tabLabel(c)}</span></span>
                      <span className="mono" style={{ fontWeight: 650 }}>{inr(c.q.amount)}</span>
                    </div>
                  );
                })}
                <div className="between" style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600 }}>Total to block</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)' }}>{inr(totalAmount)}</span>
                </div>
              </div>
              <div className="banner info" style={{ marginTop: 14 }}>
                {selected.length > 1
                  ? `Each of the ${selected.length} applicants receives a UPI mandate request in their own UPI app. No money moves until allotment.`
                  : `You'll receive a UPI mandate to block ${inr(totalAmount)}. No money moves until shares are allotted.`}
              </div>
              {canPrint && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  Prefer a printed bank form instead? <a className="linklike" href={`/print/${ipo.symbol}${q}`}>Print PDF (bank ASBA)</a>
                </p>
              )}
              {liveMode && <div className="banner ok" style={{ marginTop: 14 }}><Icon name="check" size={15} /> Live — this application will be placed on the exchange rail.</div>}
              {placeErr && <div className="banner warn" style={{ marginTop: 14 }}>{placeErr}</div>}
              <Nav onBack={() => setStep(3)} onNext={place} nextLabel={placing ? 'Placing…' : `${tr('apply.cta')} · ${inr(totalAmount)}`} nextDisabled={placing} tr={tr} />
            </Section>
          )}
        </div>

        {/* sticky summary */}
        <aside className="panel summary">
          <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            <CompanyMark name={ipo.name} symbol={ipo.symbol} size="md" />
            <div>
              <div className="eyebrow">{ipo.type === 'sme' ? 'SME' : 'Mainboard'} IPO</div>
              <h3 style={{ marginTop: 3 }}>{ipo.name}</h3>
            </div>
          </div>
          <hr className="rule" style={{ margin: '16px 0' }} />
          <div className="line"><span className="muted">Applicants</span><span>{selected.length || '—'}</span></div>
          <div className="line"><span className="muted">Category</span><span>{selected.length && master ? (uniform ? tabLabel(choiceFor(selected[0])!) : 'Mixed') : master ? tabLabel(master) : '—'}</span></div>
          <div className="line"><span className="muted">{tr('apply.lots')}</span><span className="mono">{selected.length && uniform ? `${choiceFor(selected[0])!.q.lots} · ${choiceFor(selected[0])!.q.shares} ${tr('apply.shares')}` : selected.length ? 'per member' : master ? `${master.q.lots} · ${master.q.shares} ${tr('apply.shares')}` : '—'}</span></div>
          <div className="line"><span className="muted">Price</span><span className="mono">{inr(bandMax)}</span></div>
          <div className="line"><span className="muted">Method</span><span>UPI mandate</span></div>
          <div className="line total"><span>Total{selected.length > 1 ? ` (${selected.length})` : ''}</span><span className="mono">{inr(totalAmount || master?.q.amount || 0)}</span></div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {hint && <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>{hint}</p>}
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, nextDisabled, tr }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; tr: (k: string) => string;
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
      {onBack ? <button className="btn btn-secondary" onClick={onBack}>Back</button> : <span />}
      <button className="btn" onClick={onNext} disabled={nextDisabled}>{nextLabel ?? tr('apply.cta')}</button>
    </div>
  );
}

function Prompt({ tr, q }: { tr: (k: string) => string; q: string }) {
  return (
    <div className="banner warn">
      {tr('apply.noApplicant')} <a className="linklike" href={`/account${q}`}>{tr('profiles.add')} →</a>
    </div>
  );
}

export function catLabel(c: InvestorCategory): string {
  return c === 'Retail' ? 'Retail (RII)' : c === 'sNII' ? 'Small-NII (sHNI)' : 'Big-NII (bHNI)';
}

/** Applied PAN · Demat · UPI for cross-check on the confirmation. */
function applicantDetail(a: Application): string {
  const parts: string[] = [];
  if (a.pan) parts.push(`PAN ${a.pan}`);
  if (a.depository && a.dpId) parts.push(`${a.depository} ${a.dpId}${a.clientId ? `/${a.clientId}` : ''}`);
  if (a.method === 'upi' && a.upiId) parts.push(a.upiId);
  return parts.join('  ·  ');
}
