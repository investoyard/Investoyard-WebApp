'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpoDetail, type IpoFull } from '@/lib/api';
import { inr, priceBand } from '@/lib/format';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { useStore, Profile } from '@/lib/store';
import { getConsumerToken, listProfiles, createApplication, downloadAsbaForm, downloadAsbaForms, type ApiProfile } from '@/lib/consumer-api';
import { makeBidEngine, crToRupees, type BidQuote, type BidEngine } from '@investoyard/shared-types';

/**
 * Print-PDF flow (bank ASBA forms) — separate from the UPI Apply flow:
 * select family members → choose a bid size once (presets / custom by ₹ Cr / by
 * lots, optional shareholder category) → per-member overrides → place `pdf`
 * applications → download the prefilled forms (overlaid on the operator's
 * uploaded blanks: SYMBOL.pdf ≤₹5L · SYMBOL_SA.pdf >₹5L · SYMBOL_SHA.pdf shareholder).
 */

/** One member's choice: the quote + whether it bids under the shareholder quota. */
interface Choice { q: BidQuote; sha: boolean }

const catLabel = (c: Choice) => (c.sha ? 'Shareholder' : c.q.category === 'retail' ? 'Retail' : c.q.category === 'shni' ? 'sHNI' : 'bHNI');
const apiCategory = (c: Choice) => (c.q.category === 'retail' ? 'Retail' : c.q.category === 'shni' ? 'sNII' : 'bNII');

function formBadge(c: Choice, isMainboard: boolean): { label: string; tone: string } {
  if (c.sha) return { label: 'Shareholder form', tone: 'brand' };
  if (!isMainboard) return { label: 'Application form', tone: 'neutral' };
  return c.q.formType === 'syndicate'
    ? { label: 'Syndicate form', tone: 'warn' }
    : { label: 'Normal form', tone: 'neutral' };
}

function applyReady(p: Profile): boolean {
  const dematOk = p.depository === 'CDSL' ? !!p.clientId : !!(p.dpId && p.clientId);
  return Boolean(p.fullName && p.pan && dematOk && p.consent);
}
function missingBits(p: Profile): string {
  const bits: string[] = [];
  if (!p.pan) bits.push('PAN');
  if (p.depository === 'CDSL' ? !p.clientId : !(p.dpId && p.clientId)) bits.push('demat details');
  return bits.join(' & ') || 'details';
}
function mapApiProfile(p: ApiProfile): Profile {
  return {
    id: p.id, relationship: p.relationship as any, fullName: p.fullName, pan: p.pan,
    depository: p.depository as any, dpId: p.dpId, clientId: p.clientId,
    upiId: p.hasUpi ? 'upi-verified' : undefined, bankAccount: p.hasBank ? 'set' : undefined,
    ifsc: p.ifsc, kycStatus: (p.kycStatus as any) ?? 'unverified', consent: true,
  };
}

/* ---------------- quantity picker (master + per-member, one control) ---------------- */

function QuantityPicker({ engine, choice, onChange, allowShareholder, compact }: {
  engine: BidEngine;
  choice: Choice;
  onChange: (c: Choice) => void;
  allowShareholder: boolean;
  compact?: boolean;
}) {
  const [customOn, setCustomOn] = useState(false); // "Custom" tile → shows the by-amount / by-lots controls
  const [mode, setMode] = useState<'amount' | 'lots'>('amount');
  const [crText, setCrText] = useState('');
  const [lotsText, setLotsText] = useState('');

  const { presets, rules } = engine;
  const setQuote = (q: BidQuote | null) => { if (q) onChange({ ...choice, q }); };
  // shareholder quota is retail-capped — flipping it on clamps the current pick
  const setSha = (sha: boolean) => {
    const q = sha && choice.q.amount > rules.retailCap ? (presets.maxRetail ?? choice.q) : choice.q;
    onChange({ sha, q });
  };

  const chips: { key: string; label: string; q: BidQuote | null; hidden?: boolean }[] = [
    { key: 'minR', label: 'Min Retail', q: presets.minRetail },
    { key: 'maxR', label: 'Max Retail', q: presets.maxRetail },
    { key: 'shni', label: 'sHNI', q: presets.sHni, hidden: choice.sha },
    { key: 'bhni', label: 'bHNI', q: presets.bHni, hidden: choice.sha },
  ];

  const cr = parseFloat(crText);
  const suggestion = mode === 'amount' && Number.isFinite(cr) && cr > 0 ? engine.suggestByAmount(crToRupees(cr)) : null;
  const sugRows = suggestion
    ? ([['Below', suggestion.below], ['Exact', suggestion.exact], ['Above', suggestion.above]] as const).filter(([, q]) => q)
    : [];
  // shareholder picks stay within the retail cap
  const pickable = (q: BidQuote) => !(choice.sha && q.amount > rules.retailCap);

  const lotsN = parseInt(lotsText, 10);
  const lotsQuote = mode === 'lots' && Number.isFinite(lotsN) && lotsN >= 1 ? engine.quote(lotsN) : null;

  return (
    <div className={`qp ${compact ? 'compact' : ''}`}>
      <div className="qp-chips">
        {chips.filter((c) => !c.hidden && c.q).map((c) => (
          <button
            key={c.key} type="button"
            className={`qp-chip ${!customOn && choice.q.lots === c.q!.lots ? 'on' : ''}`}
            onClick={() => { setCustomOn(false); setQuote(c.q); }}
          >
            <b>{c.label}</b>
            <span>{c.q!.lots} {c.q!.lots === 1 ? 'lot' : 'lots'} · {inr(c.q!.amount)}</span>
          </button>
        ))}
        {/* Custom is a tile like the presets — its controls open below when selected */}
        <button type="button" className={`qp-chip ${customOn ? 'on' : ''}`} onClick={() => setCustomOn(true)}>
          <b>Custom</b>
          <span>by amount / lots</span>
        </button>
      </div>

      {customOn && (
        <div className="qp-custom">
          <div className="qp-modes">
            <button type="button" className={`qp-mode ${mode === 'amount' ? 'on' : ''}`} onClick={() => setMode('amount')}>By amount (₹ Cr)</button>
            <button type="button" className={`qp-mode ${mode === 'lots' ? 'on' : ''}`} onClick={() => setMode('lots')}>By lots</button>
          </div>
          {mode === 'amount' ? (
            <div className="qp-customrow" style={{ alignItems: 'flex-start' }}>
              <input
                className="input" inputMode="decimal" placeholder="e.g. 0.50 Cr"
                value={crText} onChange={(e) => setCrText(e.target.value.replace(/[^\d.]/g, ''))}
                style={{ maxWidth: 130 }}
              />
              {/* Below / Exact / Above stack vertically BESIDE the box — each row one line */}
              {sugRows.length > 0 && (
                <div className="qp-suggest" style={{ marginTop: 0, flex: 1, minWidth: 230 }}>
                  {sugRows.map(([tag, q]) => (
                    <button
                      key={tag} type="button" disabled={!pickable(q!)}
                      className={`qp-sug ${choice.q.lots === q!.lots ? 'on' : ''}`}
                      onClick={() => setQuote(q!)}
                    >
                      <span className="tag">{tag}</span>
                      <span className="mono">{q!.lots.toLocaleString('en-IN')} lots · {q!.shares.toLocaleString('en-IN')} sh</span>
                      <b className="mono">{inr(q!.amount)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="qp-customrow">
              <input
                className="input" inputMode="numeric" placeholder="Lots"
                value={lotsText} onChange={(e) => setLotsText(e.target.value.replace(/\D/g, ''))}
                style={{ maxWidth: 110 }}
              />
              {/* one single-line strip — click to apply (no "Use" word) */}
              {lotsQuote && (
                <button
                  type="button" disabled={!pickable(lotsQuote)}
                  className={`qp-sug ${choice.q.lots === lotsQuote.lots ? 'on' : ''}`}
                  onClick={() => setQuote(lotsQuote)}
                >
                  <span className="mono">{lotsQuote.lots.toLocaleString('en-IN')} lots · {lotsQuote.shares.toLocaleString('en-IN')} sh</span>
                  <b className="mono">{inr(lotsQuote.amount)}</b>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {allowShareholder && (
        <label className="qp-sha">
          <input type="checkbox" checked={choice.sha} onChange={(e) => setSha(e.target.checked)} />
          <span>Shareholder category <small className="muted">(reserved quota · max ₹2,00,000)</small></span>
        </label>
      )}
    </div>
  );
}

/* ---------------- the flow ---------------- */

export function PrintFlow({ ipo: baked }: { ipo: IpoFull }) {
  const mobile = useStore((s) => s.mobile);
  const hasToken = typeof window !== 'undefined' && !!getConsumerToken();

  const [live, setLive] = useState<IpoFull | null>(null);
  const [gates, setGates] = useState<{ bid: boolean; print: boolean } | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const ipo = live ?? baked;

  useEffect(() => {
    getIpoDetail(baked.symbol).then((d) => {
      if (d) setLive(d as IpoFull);
      const ex: any = (d as any)?.extra ?? (baked as any).extra ?? {};
      setGates({ bid: ex.startBid === true, print: ex.startPrint === true });
    }).catch(() => {
      const ex: any = (baked as any).extra ?? {};
      setGates({ bid: ex.startBid === true, print: ex.startPrint === true });
    });
    if (getConsumerToken()) listProfiles().then((rows) => setProfiles(rows.map(mapApiProfile))).catch(() => setProfiles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveId = (live as any)?.live && live?.id ? live.id : null;
  const isMainboard = ipo.type === 'mainboard';
  const allowShareholder = ((live ?? baked).reservations ?? []).includes('shareholder');
  const engine = useMemo(
    () => makeBidEngine({ lotSize: ipo.lotSize, priceBandMax: ipo.priceBandMax ?? ipo.priceBandMin }),
    [ipo.lotSize, ipo.priceBandMax, ipo.priceBandMin],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [master, setMaster] = useState<Choice | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Choice>>({});
  const [editing, setEditing] = useState<string | null>(null); // profileId with an open per-member picker
  // ONE checkbox covers both consents (itemized in its label).
  const [consentAll, setConsentAll] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; profile: Profile; choice: Choice }[] | null>(null);
  const [formBusy, setFormBusy] = useState<string | null>(null);

  // default master pick = min retail, once the engine is ready
  useEffect(() => {
    if (engine && !master && engine.presets.minRetail) setMaster({ q: engine.presets.minRetail, sha: false });
  }, [engine, master]);

  const selected = useMemo(
    () => (profiles ?? []).filter((p) => selectedIds.includes(p.id) && applyReady(p)),
    [profiles, selectedIds],
  );
  const choiceFor = (p: Profile): Choice | null => overrides[p.id] ?? master;
  const total = selected.reduce((s, p) => s + (choiceFor(p)?.q.amount ?? 0), 0);

  function toggleApplicant(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const p = (profiles ?? []).find((x) => x.id === id);
      if (p?.pan && (profiles ?? []).some((o) => prev.includes(o.id) && o.pan === p.pan)) return prev;
      return [...prev, id];
    });
  }

  async function placeAndPrint() {
    if (!liveId || !master || !selected.length || placing) return;
    setPlacing(true); setPlaceErr(null);
    try {
      const out: { id: string; profile: Profile; choice: Choice }[] = [];
      for (const p of selected) {
        const c = choiceFor(p)!;
        const retailish = c.sha || c.q.category === 'retail';
        const res = await createApplication({
          investorProfileId: p.id,
          ipoId: liveId,
          category: apiCategory(c),
          lots: c.q.lots,
          atCutoff: retailish,                                     // cut-off is Retail-only
          bidPrice: retailish ? undefined : (ipo.priceBandMax ?? ipo.priceBandMin),
          applyMethod: 'pdf',
          applicantType: c.sha ? 'shareholder' : 'individual',
          dataSharingConsent: true,
          consentNoticeVersion: 'ds-rail-v1',
        });
        out.push({ id: String(res.application.id), profile: p, choice: c });
      }
      setPlaced(out);
    } catch (e: any) {
      setPlaceErr(String(e?.message ?? e));
    } finally {
      setPlacing(false);
    }
  }

  async function download(id: string | 'all') {
    if (!placed) return;
    setFormBusy(id); setPlaceErr(null);
    try { id === 'all' ? await downloadAsbaForms(placed.map((a) => a.id)) : await downloadAsbaForm(id); }
    catch (e: any) { setPlaceErr(String(e?.message ?? e)); }
    finally { setFormBusy(null); }
  }

  /* ---------------- gates & shells ---------------- */

  // No own .container/padding — the site chrome already provides it (matches the Apply page).
  const shell = (children: React.ReactNode) => (
    <div className="fade-up pf" style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* back = wherever the user came from (home card, detail, calendar…);
          direct/shared links (no same-origin history) fall back to the IPO page */}
      <a
        href={`/ipos/${ipo.symbol}`}
        className="back-link"
        onClick={(e) => {
          if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
            e.preventDefault();
            window.history.back();
          }
        }}
      >
        ← Back
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0 18px' }}>
        <IpoLogo logo={(ipo as any).logo} name={ipo.name} size={48} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, letterSpacing: '-.02em' }}>Print ASBA forms</h1>
          <p className="muted" style={{ fontSize: 13.5 }}>{ipo.name} · {priceBand(ipo.priceBandMin, ipo.priceBandMax)}{ipo.lotSize ? ` · lot ${ipo.lotSize}` : ''}</p>
        </div>
      </div>
      {children}
    </div>
  );

  if (!mobile && !hasToken) {
    return shell(
      <div className="empty fade-up">
        <div className="emoji">🔐</div>
        <h3>Sign in to print application forms</h3>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/print/${ipo.symbol}`)}`} style={{ marginTop: 14 }}>Sign in</a>
      </div>,
    );
  }
  if (gates && !gates.print) {
    return shell(
      <div className="empty fade-up">
        <div className="emoji">🖨️</div>
        <h3>Form printing hasn&apos;t started yet</h3>
        <p className="muted">Prefilled ASBA forms for {ipo.name} will be available shortly — check back soon.</p>
        <a className="btn" href={`/ipos/${ipo.symbol}`} style={{ marginTop: 14 }}>View IPO details</a>
      </div>,
    );
  }
  if (gates && !liveId) {
    return shell(
      <div className="empty fade-up">
        <div className="emoji">🖨️</div>
        <h3>Printing is available on live issues only</h3>
        <p className="muted">This demo listing has no live catalog entry to print against.</p>
      </div>,
    );
  }
  if (!engine) {
    return shell(<div className="panel" style={{ padding: 24, textAlign: 'center' }} ><p className="muted">Price band / lot size not announced yet — printing opens once the issue is priced.</p></div>);
  }

  /* ---------------- done ---------------- */

  if (placed) {
    return shell(
      <div className="fade-up">
        <div className="panel" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--pos-soft)', color: 'var(--pos)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={18} strokeWidth={2.6} /></span>
            <div>
              <b>{placed.length} {placed.length === 1 ? 'form' : 'forms'} ready to print</b>
              <div className="muted" style={{ fontSize: 12.5 }}>Print each form, sign it, and submit it at the applicant&apos;s bank branch before close.</div>
            </div>
          </div>
          {placed.map((a) => {
            const badge = formBadge(a.choice, isMainboard);
            return (
              <div key={a.id} className="pf-row">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t">{a.profile.fullName}</span>
                  <span className="s">{a.choice.q.lots} {a.choice.q.lots === 1 ? 'lot' : 'lots'} · {inr(a.choice.q.amount)} · {catLabel(a.choice)}</span>
                </span>
                <span className={`pf-badge ${badge.tone}`}>{badge.label}</span>
                <button className="btn btn-secondary btn-sm" disabled={formBusy != null} onClick={() => download(a.id)}>
                  {formBusy === a.id ? 'Preparing…' : <><Icon name="download" size={14} /> Form</>}
                </button>
              </div>
            );
          })}
          <button className="btn btn-block" style={{ marginTop: 14 }} disabled={formBusy != null} onClick={() => download('all')}>
            {formBusy === 'all' ? 'Preparing…' : <><Icon name="download" size={16} /> Download all forms (one PDF)</>}
          </button>
          {placeErr && <p className="form-err" style={{ marginTop: 10 }}>{placeErr}</p>}
        </div>
        <p className="disclaimer" style={{ marginTop: 12 }}>Each application uses that person&apos;s own PAN, demat and bank account — funds are blocked in the applicant&apos;s own account (ASBA).</p>
      </div>,
    );
  }

  /* ---------------- main flow ---------------- */

  const ready = (profiles ?? []).filter(applyReady);
  const notReady = (profiles ?? []).filter((p) => !applyReady(p));

  return shell(
    <div className="fade-up">
      {/* 1 · applicants */}
      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <div className="pf-sec"><span className="pf-n">1</span> Who is applying?</div>
        {profiles === null ? (
          <p className="muted" style={{ padding: '12px 0' }}>Loading family members…</p>
        ) : ready.length === 0 ? (
          <p className="muted" style={{ padding: '12px 0' }}>
            No applicants with complete details yet. <a className="linklike" href="/account">Add family members →</a>
          </p>
        ) : (
          <div className="choice-list" style={{ marginTop: 10 }}>
            {ready.map((p) => {
              const isSel = selectedIds.includes(p.id);
              const blocked = !isSel && !!p.pan && ready.some((o) => selectedIds.includes(o.id) && o.pan === p.pan);
              return (
                <label key={p.id} className={`choice-card ${isSel ? 'on' : ''}`} style={blocked ? { opacity: .55, cursor: 'not-allowed' } : undefined}>
                  <span className="checkbox" />
                  <input type="checkbox" hidden disabled={blocked} checked={isSel} onChange={() => toggleApplicant(p.id)} />
                  <span className="grow">
                    <span className="t">{p.fullName}</span>
                    <span className="s">{p.relationship}{p.pan ? ` · ${p.pan}` : ''}</span>
                  </span>
                </label>
              );
            })}
            {notReady.map((p) => (
              <div key={p.id} className="choice-card" style={{ opacity: .55 }}>
                <span className="grow">
                  <span className="t">{p.fullName || 'Family member'}</span>
                  <span className="s">Missing {missingBits(p)} — <a className="linklike" href="/account">complete profile</a></span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2 · bid size (master) */}
      <div className="panel" style={{ padding: 20, marginBottom: 16, opacity: selected.length ? 1 : .55 }}>
        <div className="pf-sec"><span className="pf-n">2</span> How much per applicant?</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
          This sets every selected member; fine-tune anyone below. Prices use the band ceiling ({inr(ipo.priceBandMax ?? ipo.priceBandMin)}/share).
        </p>
        {master && (
          <QuantityPicker engine={engine} choice={master} allowShareholder={allowShareholder}
            onChange={(c) => { setMaster(c); setOverrides({}); setEditing(null); }} />
        )}

        {/* per-member overrides */}
        {selected.length > 0 && master && (
          <div style={{ marginTop: 16 }}>
            {selected.map((p) => {
              const c = choiceFor(p)!;
              const badge = formBadge(c, isMainboard);
              const overridden = !!overrides[p.id];
              return (
                <div key={p.id}>
                  <div className="pf-row">
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="t">{p.fullName}{overridden && <em className="pf-own">custom</em>}</span>
                      <span className="s mono">{c.q.lots} {c.q.lots === 1 ? 'lot' : 'lots'} · {c.q.shares.toLocaleString('en-IN')} sh · {inr(c.q.amount)} · {catLabel(c)}</span>
                    </span>
                    <span className={`pf-badge ${badge.tone}`}>{badge.label}</span>
                    <button type="button" className="icon-btn pf-editbtn" title={editing === p.id ? 'Close' : 'Change bid'}
                      aria-label={editing === p.id ? 'Close' : `Change bid for ${p.fullName}`}
                      onClick={() => setEditing(editing === p.id ? null : p.id)}>
                      <Icon name={editing === p.id ? 'x' : 'edit'} size={14} />
                    </button>
                  </div>
                  {editing === p.id && (
                    <div className="pf-edit">
                      <QuantityPicker engine={engine} compact choice={c} allowShareholder={allowShareholder}
                        onChange={(nc) => setOverrides((o) => ({ ...o, [p.id]: nc }))} />
                      {overridden && (
                        <button type="button" className="btn btn-sm pf-reset"
                          onClick={() => { setOverrides((o) => { const { [p.id]: _, ...rest } = o; return rest; }); setEditing(null); }}>
                          Reset to main selection <Icon name="refresh" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="kv" style={{ marginTop: 12 }}><span className="k">Total across {selected.length} {selected.length === 1 ? 'applicant' : 'applicants'}</span><span className="v mono">{inr(total)}</span></div>
          </div>
        )}
      </div>

      {/* 3 · consent + place */}
      <div className="panel" style={{ padding: 20, opacity: selected.length ? 1 : .55 }}>
        <div className="pf-sec"><span className="pf-n">3</span> Confirm &amp; print</div>
        <label className="pf-consent">
          <input type="checkbox" checked={consentAll} onChange={(e) => setConsentAll(e.target.checked)} />
          <span>
            I agree to all of the following:
            <span style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)' }}>• I consent to sharing each applicant&apos;s details with the exchange / partner for this application (DPDP).</span>
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>• Each application uses that person&apos;s own PAN, demat and bank account.</span>
          </span>
        </label>
        {placeErr && <p className="form-err" style={{ marginTop: 10 }}>{placeErr}</p>}
        <button className="btn btn-block btn-lg" style={{ marginTop: 14 }}
          disabled={!selected.length || !consentAll || placing}
          onClick={placeAndPrint}>
          {placing ? 'Creating applications…' : <><Icon name="doc" size={17} /> Create {selected.length || ''} {selected.length === 1 ? 'application & print form' : 'applications & print forms'}</>}
        </button>
      </div>
    </div>,
  );
}
