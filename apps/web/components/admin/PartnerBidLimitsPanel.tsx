'use client';
import { useEffect, useState } from 'react';
import { Loader } from '@/components/ui/Loader';
import * as api from '@/lib/tenants-admin';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Live bidding for this partner (Phase 3 pilot). Platform operators only — the
 * API refuses anyone else — because this is what lets a partner send real bids
 * under our exchange membership.
 *
 * Every limit is explicit: an empty IPO list allows nothing, and switching on
 * without a list and every cap is refused, so "on" can never mean "unlimited".
 * The global switch (PARTNER_BIDS_LIVE on the server) must also be on.
 */
export function PartnerBidLimitsPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<api.PartnerBidLimitsView | null>(null);
  const [form, setForm] = useState({ enabled: false, ipoSymbols: '', maxAmountPerBid: '', maxBidsPerDay: '', maxAmountPerDay: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string; problems?: string[] } | null>(null);

  const fill = (d: api.PartnerBidLimitsView) => {
    setData(d);
    setForm({
      enabled: d.enabled, ipoSymbols: d.ipoSymbols.join(', '),
      maxAmountPerBid: d.maxAmountPerBid ? String(d.maxAmountPerBid) : '',
      maxBidsPerDay: d.maxBidsPerDay ? String(d.maxBidsPerDay) : '',
      maxAmountPerDay: d.maxAmountPerDay ? String(d.maxAmountPerDay) : '',
    });
  };
  useEffect(() => {
    api.fetchPartnerBidLimits(tenantId).then(fill).catch((e) => setMsg({ tone: 'warn', text: String(e?.message ?? e) }));
  }, [tenantId]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const d = await api.savePartnerBidLimits(tenantId, {
        enabled: form.enabled,
        ipoSymbols: form.ipoSymbols.split(/[\s,]+/).filter(Boolean),
        maxAmountPerBid: Number(form.maxAmountPerBid || 0),
        maxBidsPerDay: Number(form.maxBidsPerDay || 0),
        maxAmountPerDay: Number(form.maxAmountPerDay || 0),
      });
      fill(d);
      setMsg({ tone: 'ok', text: d.enabled ? 'Saved. Live bidding is on for this partner within these limits.' : 'Saved. Live bidding is off for this partner.' });
    } catch (e: any) {
      setMsg({ tone: 'warn', text: String(e?.message ?? e), problems: e?.problems });
    } finally { setBusy(false); }
  };

  const num = (k: 'maxAmountPerBid' | 'maxBidsPerDay' | 'maxAmountPerDay') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^\d]/g, '') }));

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="fs-head" style={{ marginBottom: 6 }}>
        <div className="t">Live bidding (pilot)</div>
        <div className="d">
          Whether this partner may send <b>real</b> bids through the API, on which IPOs and how much. Test keys are not affected —
          they always go to the simulator. Only platform operators can change this.
        </div>
      </div>
      {data === null && !msg ? <Loader /> : (
        <>
          {data && !data.liveOpen && (
            <div className="banner warn" style={{ margin: '10px 0' }}>
              Live partner bidding is switched off for the whole platform, so nothing here takes effect until it is switched on.
            </div>
          )}
          {msg && (
            <div className={`banner ${msg.tone}`} style={{ margin: '10px 0' }}>
              {msg.text}
              {msg.problems?.length ? <ul style={{ margin: '6px 0 0 18px' }}>{msg.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
            </div>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 14px', cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            <span>Allow live bids from this partner</span>
          </label>
          <div className="form-grid">
            <div className="field">
              <label>IPOs</label>
              <input className="input mono" value={form.ipoSymbols} placeholder="e.g. JPL" onChange={(e) => setForm((f) => ({ ...f, ipoSymbols: e.target.value }))} />
              <div className="hint">Symbols, separated by commas. Only these. An empty list allows none.</div>
            </div>
            <div className="field">
              <label>Most per bid (₹)</label>
              <input className="input mono" inputMode="numeric" value={form.maxAmountPerBid} onChange={num('maxAmountPerBid')} placeholder="50000" />
              <div className="hint">At most ₹5,00,000, the UPI mandate cap.</div>
            </div>
            <div className="field">
              <label>Bids per day</label>
              <input className="input mono" inputMode="numeric" value={form.maxBidsPerDay} onChange={num('maxBidsPerDay')} placeholder="20" />
              <div className="hint">Live bids per India day, across every IPO.</div>
            </div>
            <div className="field">
              <label>Rupees per day (₹)</label>
              <input className="input mono" inputMode="numeric" value={form.maxAmountPerDay} onChange={num('maxAmountPerDay')} placeholder="500000" />
              <div className="hint">Total of live bids per India day.</div>
            </div>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save limits'}</button>
            {data && (
              <span className="muted" style={{ fontSize: 12.5 }}>
                Used today: {data.usedToday.bids} live bid{data.usedToday.bids === 1 ? '' : 's'}, {inr(data.usedToday.amount)}.
              </span>
            )}
          </div>
        </>
      )}
    </div></div>
  );
}
