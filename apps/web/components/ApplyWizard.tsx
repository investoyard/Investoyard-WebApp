'use client';
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { IpoDetail } from '@/lib/api';
import { inr } from '@/lib/format';
import { CompanyMark } from '@/components/CompanyMark';
import { Icon } from '@/components/Icon';
import { useStore, store, profileReady, Application, InvestorCategory, Profile } from '@/lib/store';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

export function ApplyWizard({ ipo, lang = 'en' }: { ipo: IpoDetail; lang?: Lang }) {
  const sp = useSearchParams();
  const L = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : lang) as Lang;
  const tr = makeT(L);
  const q = L !== 'en' ? `?lang=${L}` : '';

  const mobile = useStore((s) => s.mobile);
  const profiles = useStore((s) => s.profiles);
  const applications = useStore((s) => s.applications);

  // SEBI category & payment thresholds
  const RETAIL_MAX = 200000;    // ≤ ₹2L → Retail (RII)
  const SNII_MAX = 1000000;     // ₹2L–₹10L → Small-NII (sHNI); above → Big-NII (bHNI)
  const UPI_MAX = 500000;       // UPI mandate ≤ ₹5L; above → bank ASBA (prefilled form) only
  const DEMO_MAX = 5000000;     // demo ceiling so the lot stepper stays bounded (₹50L)

  const lotsParam = parseInt(sp.get('lots') ?? '', 10);
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lots, setLots] = useState(Number.isFinite(lotsParam) && lotsParam >= 1 ? lotsParam : 1);
  const [atCutoff, setAtCutoff] = useState(true);
  const [bidPrice, setBidPrice] = useState<number>(ipo.priceBandMax ?? ipo.priceBandMin ?? 0);
  const [method, setMethod] = useState<'upi' | 'pdf'>('upi');
  const [consent, setConsent] = useState({ share: false, selfpan: false, gmp: false });
  const [placed, setPlaced] = useState<Application[] | null>(null);

  // OTP verification on the partner-share consent
  const [otpStage, setOtpStage] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const lotSize = ipo.lotSize ?? 1;
  const bandMin = ipo.priceBandMin ?? 0;
  const bandMax = ipo.priceBandMax ?? bandMin;

  // Cut-off (final issue price) is permitted for Retail only — value at the ceiling must be ≤ ₹2L.
  const canUseCutoff = lots * lotSize * bandMax <= RETAIL_MAX;
  const effectiveCutoff = atCutoff && canUseCutoff;
  const pricePerShare = effectiveCutoff ? bandMax : bidPrice;
  const shares = lots * lotSize;
  const amount = shares * pricePerShare;
  const category: InvestorCategory = amount <= RETAIL_MAX ? 'Retail' : amount <= SNII_MAX ? 'sNII' : 'bNII';
  const canIncrease = (lots + 1) * lotSize * pricePerShare <= DEMO_MAX; // allow > ₹5L (ASBA), bounded for demo

  const selected = useMemo(
    () => profiles.filter((p) => selectedIds.includes(p.id) && profileReady(p)),
    [profiles, selectedIds],
  );
  const hasMinor = selected.some((p) => p.relationship === 'child');     // minors → ASBA (no UPI mandate)
  const upiAllowed = amount <= UPI_MAX && !hasMinor;                      // UPI ≤ ₹5L and no minor applicant
  const effMethod: 'upi' | 'pdf' = upiAllowed ? method : 'pdf';
  const totalAmount = amount * Math.max(1, selected.length);
  const allConsent = consent.share && consent.selfpan && consent.gmp;
  const consentVerified = otpStage === 'verified';
  const otpFull = otp.every((d) => d !== '');

  const stepLabels = [tr('apply.applicant'), 'Bid', 'Consent', tr('apply.method'), 'Done'];

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

  function toggleApplicant(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // One application per PAN per issue — block a duplicate PAN.
      const p = profiles.find((x) => x.id === id);
      if (p?.pan && profiles.some((o) => prev.includes(o.id) && o.pan === p.pan)) return prev;
      return [...prev, id];
    });
  }

  // Above ₹5L: open a prefilled, printable ASBA form to submit to the bank.
  function openAsbaForm(a: Application) {
    const p = profiles.find((x) => x.id === a.profileId);
    const html = asbaFormHtml(a, p, ipo);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  }

  function place() {
    if (!selected.length) return;
    // One application per selected applicant — each with their own PAN/demat/UPI.
    const apps = selected.map((p) =>
      store.placeApplication({
        ipoSymbol: ipo.symbol, ipoName: ipo.name, profileId: p.id, profileName: p.fullName || tr('rel.self'),
        pan: p.pan, depository: p.depository, dpId: p.dpId, clientId: p.clientId, upiId: p.upiId,
        lots, shares, pricePerShare, atCutoff: effectiveCutoff, category, amount, method: effMethod,
      }),
    );
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
          Each applicant approves their own {placed[0].method === 'upi' ? 'UPI mandate' : 'ASBA form'} with their own PAN, demat &amp; bank.
        </p>
        <div className="panel" style={{ marginTop: 22, textAlign: 'left' }}>
          <div className="kv"><span className="k">{ipo.name}</span><span className="v mono">{placed[0].lots} {tr('apply.lots')} · {placed[0].shares} {tr('apply.shares')}</span></div>
          <div className="kv"><span className="k">Category</span><span className="v">{catLabel(placed[0].category)}</span></div>
          <div className="kv"><span className="k">Bid price</span><span className="v mono">{placed[0].atCutoff ? 'Cut-off ' : ''}{inr(placed[0].pricePerShare)}</span></div>
          <div className="kv"><span className="k">Method</span><span className="v">{placed[0].method === 'upi' ? 'UPI / ASBA' : 'Bank ASBA'}</span></div>
          <hr className="rule" style={{ margin: '12px 0' }} />
          {placed.map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="between">
                <span style={{ fontWeight: 600 }}>{a.profileName} <span className="faint mono" style={{ fontWeight: 400 }}>· {a.applicationNumber}</span></span>
                <span className="mono" style={{ fontWeight: 700 }}>{inr(a.amount)}</span>
              </div>
              <div className="faint mono" style={{ fontSize: 12, marginTop: 4 }}>{applicantDetail(a)}</div>
            </div>
          ))}
          <div className="kv"><span className="k"><b>Total to block</b></span><span className="v mono"><b>{inr(placed.reduce((s, a) => s + a.amount, 0))}</b></span></div>
        </div>
        <div className="banner warn" style={{ marginTop: 14, textAlign: 'left' }}>
          {placed[0].method === 'upi'
            ? 'Approve the UPI mandate in each applicant’s UPI app to block the amounts above.'
            : 'Download each applicant’s prefilled ASBA form below, print it, and submit it to the bank — the bank bids & blocks the amount.'}
        </div>
        {placed[0].method === 'pdf' && (
          <div className="stack" style={{ marginTop: 14 }}>
            {placed.map((a) => (
              <button key={a.id} className="btn btn-secondary" onClick={() => openAsbaForm(a)}>
                <Icon name="doc" size={16} /> Download / print ASBA form — {a.profileName}
              </button>
            ))}
          </div>
        )}
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
                    const ready = profileReady(p);
                    if (ready) {
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
                            <span className="s">{tr(`rel.${p.relationship}`)}{p.pan ? ` · ${p.pan}` : ''}</span>
                          </span>
                          {alreadyApplied
                            ? <span className="appstatus info">Already applied</span>
                            : panClash
                              ? <span className="appstatus bad">Same PAN</span>
                              : <span className="appstatus good">{tr('profiles.ready')}</span>}
                        </label>
                      );
                    }
                    return (
                      <div key={p.id} className="choice-card" style={{ cursor: 'default' }}>
                        <span className="grow">
                          <span className="t">{p.fullName || tr(`rel.${p.relationship}`)}</span>
                          <span className="s">Missing PAN / demat / UPI to apply</span>
                        </span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => store.fillSample(p.id)}>
                          Use sample details
                        </button>
                      </div>
                    );
                  })}
                  <a className="linklike" href={`/account${q}`} style={{ fontSize: 14, marginTop: 4 }}>+ {tr('profiles.add')}</a>
                </div>
              )}
              {selected.length > 0 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                  {selected.length} applicant{selected.length > 1 ? 's' : ''} selected · {selected.map((p) => p.fullName.split(' ')[0]).join(', ')}
                  {hasMinor ? ' · includes a minor → bank ASBA' : ''}
                </p>
              )}
              <Nav onNext={() => setStep(2)} nextDisabled={selected.length === 0} tr={tr} />
            </Section>
          )}

          {/* STEP 2 — bid (lots, price-in-band, category & ₹5L cap) */}
          {step === 2 && (
            <Section title="Quantity & price">
              <div className="field">
                <label>{tr('apply.lots')} <span className="hint">· 1 {tr('apply.lots')} = {lotSize} {tr('apply.shares')}</span></label>
                <div className="row">
                  <div className="stepper">
                    <button onClick={() => setLots(Math.max(1, lots - 1))} disabled={lots <= 1}>−</button>
                    <span className="val mono">{lots}</span>
                    <button onClick={() => setLots(lots + 1)} disabled={!canIncrease}>+</button>
                  </div>
                  <span className="muted mono">{shares} {tr('apply.shares')}</span>
                </div>
                {!canIncrease && (
                  <p className="hint" style={{ color: 'var(--warn)' }}>
                    Demo limit {inr(DEMO_MAX)} reached.
                  </p>
                )}
                {amount > UPI_MAX && (
                  <p className="hint" style={{ color: 'var(--warn)' }}>
                    Above {inr(UPI_MAX)} — UPI not allowed; this will apply via <b>bank ASBA</b> (prefilled form).
                  </p>
                )}
              </div>

              <div className="field">
                <label>Bid price <span className="hint">· band {inr(bandMin)}–{inr(bandMax)}</span></label>
                <div className="choice">
                  <label className={`choice-card ${effectiveCutoff ? 'on' : ''}`} style={!canUseCutoff ? { opacity: .55, cursor: 'not-allowed' } : undefined}>
                    <span className="radio" />
                    <input type="radio" hidden disabled={!canUseCutoff} checked={effectiveCutoff} onChange={() => setAtCutoff(true)} />
                    <span className="grow">
                      <span className="t">Cut-off price</span>
                      <span className="s">{canUseCutoff ? 'Apply at the final issue price · Retail only' : `Not available for HNI (> ${inr(RETAIL_MAX)})`}</span>
                    </span>
                    <span className="mono" style={{ fontWeight: 650 }}>{inr(bandMax)}</span>
                  </label>
                  <label className={`choice-card ${!effectiveCutoff ? 'on' : ''}`}>
                    <span className="radio" />
                    <input type="radio" hidden checked={!effectiveCutoff} onChange={() => setAtCutoff(false)} />
                    <span className="grow"><span className="t">Specific price</span><span className="s">Bid your own price within the band</span></span>
                  </label>
                </div>
                {!effectiveCutoff && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <div className="stepper">
                      <button onClick={() => setBidPrice(Math.max(bandMin, bidPrice - 1))} disabled={bidPrice <= bandMin}>−</button>
                      <span className="val mono">{inr(bidPrice)}</span>
                      <button onClick={() => setBidPrice(Math.min(bandMax, bidPrice + 1))} disabled={bidPrice >= bandMax}>+</button>
                    </div>
                    <span className="muted">per share</span>
                  </div>
                )}
              </div>

              {/* live category + amount */}
              <div className="panel-sub">
                <div className="between">
                  <span className="muted">Investor category</span>
                  <span className={`appstatus ${category === 'Retail' ? 'info' : 'wait'}`}>
                    {catLabel(category)}
                  </span>
                </div>
                <div className="between" style={{ marginTop: 10 }}>
                  <span className="muted">Bid amount ({shares} × {inr(pricePerShare)})</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)' }}>{inr(amount)}</span>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  {category === 'Retail'
                    ? `≤ ${inr(RETAIL_MAX)} = Retail (RII). UPI allowed up to ${inr(UPI_MAX)}.`
                    : amount <= UPI_MAX
                      ? `${inr(RETAIL_MAX)}–${inr(SNII_MAX)} = Small-NII. UPI allowed up to ${inr(UPI_MAX)}.`
                      : `Above ${inr(UPI_MAX)} — UPI not permitted; apply via bank ASBA (prefilled form).`}
                </p>
              </div>

              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} tr={tr} />
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

          {/* STEP 4 — method / UPI mandate (UPI ≤ ₹5L, else ASBA) */}
          {step === 4 && (
            <Section title={tr('apply.method')}>
              <div className="choice">
                <label className={`choice-card ${effMethod === 'upi' ? 'on' : ''}`} style={!upiAllowed ? { opacity: .55, cursor: 'not-allowed' } : undefined}>
                  <span className="radio" />
                  <input type="radio" hidden disabled={!upiAllowed} checked={effMethod === 'upi'} onChange={() => setMethod('upi')} />
                  <span className="grow">
                    <span className="t">{tr('apply.method.upi')}</span>
                    <span className="s">{upiAllowed ? `Each applicant approves their own UPI mandate · up to ${inr(UPI_MAX)}` : `Not available above ${inr(UPI_MAX)}`}</span>
                  </span>
                </label>
                <label className={`choice-card ${effMethod === 'pdf' ? 'on' : ''}`}>
                  <span className="radio" />
                  <input type="radio" hidden checked={effMethod === 'pdf'} onChange={() => setMethod('pdf')} />
                  <span className="grow"><span className="t">{tr('apply.method.pdf')}</span><span className="s">Prefilled ASBA form for your bank · no UPI limit</span></span>
                </label>
              </div>
              {!upiAllowed && (
                <div className="banner warn" style={{ marginTop: 14 }}>
                  {hasMinor
                    ? <>A <b>minor</b> applicant is selected — minors apply via <b>bank ASBA</b> (UPI mandate isn’t available). Download the prefilled form and submit it to the bank (guardian-operated).</>
                    : <>Above {inr(UPI_MAX)}, UPI isn’t permitted. Apply via <b>bank ASBA</b> — download the prefilled form, submit it to your bank, and the bank bids &amp; blocks the amount.</>}
                </div>
              )}
              <div className="banner info" style={{ marginTop: 14 }}>
                {selected.length > 1
                  ? `${selected.length} applicants · ${inr(amount)} each · ${inr(totalAmount)} total. Each approves their own ${effMethod === 'upi' ? 'UPI mandate' : 'ASBA form'}.`
                  : effMethod === 'upi'
                    ? `You'll receive a UPI mandate to block ${inr(amount)}. No money moves until shares are allotted.`
                    : `Submit the prefilled ASBA form at your bank to block ${inr(amount)} in your account.`}
              </div>
              <Nav onBack={() => setStep(3)} onNext={place} nextLabel={`${tr('apply.cta')} · ${inr(totalAmount)}`} tr={tr} />
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
          <div className="line"><span className="muted">Category</span><span>{catLabel(category)}</span></div>
          <div className="line"><span className="muted">{tr('apply.lots')}</span><span className="mono">{lots} · {shares} {tr('apply.shares')}</span></div>
          <div className="line"><span className="muted">Price</span><span className="mono">{effectiveCutoff ? 'Cut-off ' : ''}{inr(pricePerShare)}</span></div>
          <div className="line"><span className="muted">Method</span><span>{effMethod === 'upi' ? 'UPI / ASBA' : 'Bank ASBA'}</span></div>
          <div className="line"><span className="muted">Per applicant</span><span className="mono">{inr(amount)}</span></div>
          <div className="line total"><span>Total{selected.length > 1 ? ` (${selected.length})` : ''}</span><span className="mono">{inr(totalAmount)}</span></div>
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

/** Prefilled, printable ASBA form (demo) — for bids above ₹5L that must go via the bank. */
function asbaFormHtml(a: Application, p: Profile | undefined, ipo: IpoDetail): string {
  const row = (k: string, v?: string | number) => `<tr><td class="k">${k}</td><td class="v">${v ?? '—'}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>ASBA Form · ${a.applicationNumber}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;max-width:720px;margin:28px auto;padding:0 22px;}
  h1{font-size:20px;margin:0;} .brand{color:#3c2e7e;} .sub{color:#666;font-size:13px;margin-top:4px;}
  .box{border:1px solid #d2d2d7;border-radius:10px;padding:6px 16px;margin-top:18px;}
  table{width:100%;border-collapse:collapse;} td{padding:9px 4px;border-bottom:1px solid #ececef;font-size:14px;}
  td.k{color:#666;width:46%;} td.v{font-weight:600;} tr:last-child td{border-bottom:0;}
  .note{font-size:12px;color:#555;line-height:1.55;margin-top:16px;}
  button{margin-top:22px;padding:11px 20px;border:0;background:#3c2e7e;color:#fff;border-radius:8px;font-size:14px;cursor:pointer;}
  @media print{button{display:none;}}
</style></head><body>
  <h1><span class="brand">Investoyard</span> · ASBA Application Form</h1>
  <div class="sub">Application No. ${a.applicationNumber} · ${ipo.name} (${ipo.type === 'sme' ? 'SME' : 'Mainboard'}) · for bids above ₹5,00,000 (UPI not permitted)</div>
  <div class="box"><table>
    ${row('Applicant name', p?.fullName)}
    ${row('PAN', p?.pan)}
    ${row('Depository', p?.depository)}
    ${row('DP ID', p?.dpId)}
    ${row('Client ID', p?.clientId)}
    ${row('Bank / UPI', p?.upiId)}
    ${row('Investor category', catLabel(a.category))}
    ${row('Bid price', (a.atCutoff ? 'Cut-off ' : '') + inr(a.pricePerShare))}
    ${row('Lots / Shares', a.lots + ' / ' + a.shares)}
    ${row('Amount to block (ASBA)', inr(a.amount))}
  </table></div>
  <p class="note">${p?.relationship === 'child' ? '<b>Minor applicant</b> — demat/bank account operated by the natural guardian. ' : ''}I/We authorise the Self-Certified Syndicate Bank (SCSB) to block the above amount in my/our own bank account under ASBA for this public issue. The application uses my/our own PAN, demat and bank account (no third party). Submit this form at your bank branch or net-banking ASBA facility; the bank uploads the bid and blocks the funds. Funds remain blocked (not debited) until basis of allotment.</p>
  <button onclick="window.print()">Print this form</button>
</body></html>`;
}
