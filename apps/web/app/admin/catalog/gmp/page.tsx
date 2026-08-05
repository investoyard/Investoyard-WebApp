'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Panel, Field } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/** GMP & Listing — per-IPO grey-market premium + listing-day outcomes (opened from the catalog row icon). */
export default function GmpListingPage() {
  const me = useOperator();
  const [id, setId] = useState<string | null>(null);
  const [ipo, setIpo] = useState<api.AdminIpoDetail | null>(null);
  const [gmp, setGmp] = useState('');
  const [gainPct, setGainPct] = useState('');
  const [bse, setBse] = useState('');
  const [nse, setNse] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  useEffect(() => {
    if (!id) return;
    api.fetchIpo(id).then((d) => {
      setIpo(d);
      setGmp(d.gmp != null ? String(d.gmp) : '');
      setGainPct(d.listingGainPct != null ? String(d.listingGainPct) : '');
      const ex: any = d.extra ?? {};
      setBse(ex.bseListingPrice != null ? String(ex.bseListingPrice) : '');
      setNse(ex.nseListingPrice != null ? String(ex.nseListingPrice) : '');
    }).catch((e) => setErr(String(e?.message ?? e)));
  }, [id]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.manage')) return <NoAccess />;

  const save = async () => {
    if (!id || !ipo) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
      // Merge into the existing extra so other operator-entered fields survive.
      await api.updateIpo(id, {
        gmp: num(gmp), listingGainPct: num(gainPct),
        extra: { ...(ipo.extra ?? {}), bseListingPrice: bse, nseListingPrice: nse },
      });
      setMsg('Saved.');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead
        title={ipo ? `GMP & Listing — ${ipo.symbol}` : 'GMP & Listing'}
        sub="Grey-market premium (unofficial — shown with the disclaimer) and listing-day outcomes."
        actions={<a className="btn btn-secondary" href="/admin/catalog"><Icon name="arrow-right" size={14} style={{ transform: 'rotate(180deg)' }} /> Back to catalog</a>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {!ipo ? <Loader /> : (
        <Panel title={`${ipo.name}`} desc={`Symbol ${ipo.symbol} · status ${ipo.status}`}>
          <div className="form-grid">
            <Field label="GMP (₹)" hint="grey-market premium per share"><input className="input mono" value={gmp} onChange={(e) => setGmp(e.target.value)} /></Field>
            <Field label="Listing gain (%)"><input className="input mono" value={gainPct} onChange={(e) => setGainPct(e.target.value)} /></Field>
            <Field label="BSE Listing Price (₹)"><input className="input mono" value={bse} onChange={(e) => setBse(e.target.value)} placeholder="0.00" /></Field>
            <Field label="NSE Listing Price (₹)"><input className="input mono" value={nse} onChange={(e) => setNse(e.target.value)} placeholder="0.00" /></Field>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Panel>
      )}
    </>
  );
}
