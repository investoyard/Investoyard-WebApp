'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { Toasts, useToast } from '@/components/ui/Toast';
import { titleCase } from '@investoyard/shared-types';
import * as api from '@/lib/tenants-admin';

/**
 * GMP feed — link, preview, sync.
 *
 * The feed can only ever SUGGEST a match: company names are not identifiers,
 * and hanging the wrong company's premium on an IPO is worse than showing
 * none. So the screen is built around one human decision — confirm the link —
 * and everything after that runs on the stored id.
 *
 * Preview writes nothing. It is the whole point of the page: an operator
 * should be able to see what a third-party feed is about to do to the catalog
 * before it does it, without reading a log.
 */
export default function GmpFeedPage() {
  const me = useOperator();
  const { toasts, push: toast } = useToast();
  const [rep, setRep] = useState<api.GmpFeedReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    api.fetchGmpFeedPreview().then(setRep).catch((e) => { setErr(String(e?.message ?? e)); setRep(null); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.fetchGmpFeedConfig()
      .then((c) => { setSavedUrl(c.url); setFeedUrl(c.url ?? ''); })
      .catch(() => { /* the page still works on the built-in default */ });
  }, []);

  const saveUrl = async () => {
    setSavingUrl(true);
    try {
      const r = await api.saveGmpFeedConfig(feedUrl.trim());
      setSavedUrl(r.url);
      toast(r.url ? 'Source URL saved' : 'Reverted to the built-in default', 'ok');
      load();
    } catch (e: any) { toast(String(e?.message ?? e), 'err'); }
    finally { setSavingUrl(false); }
  };

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');

  const link = async (symbol: string, sourceId: string | null) => {
    setBusy(symbol);
    try {
      const r = await api.linkGmpFeed(symbol, sourceId);
      if (r.error) toast(r.error, 'err');
      else toast(sourceId ? `${symbol} linked` : `${symbol} unlinked`, 'ok');
      load();
    } catch (e: any) { toast(String(e?.message ?? e), 'err'); }
    finally { setBusy(null); }
  };

  const sync = async () => {
    setBusy('*');
    try {
      const r = await api.runGmpFeedSync();
      toast(r.changes.length ? `Updated ${r.changes.length} IPO${r.changes.length === 1 ? '' : 's'}` : 'Nothing to update', 'ok');
      setRep({ ...r, dryRun: true });
      load();
    } catch (e: any) { toast(String(e?.message ?? e), 'err'); }
    finally { setBusy(null); }
  };

  return (
    <>
      <Toasts toasts={toasts} />
      <PageHead
        title="GMP Feed"
        sub="Link each IPO to its row in the upstream report once. After that the poller fills GMP and any dates, lot size or issue size our record is missing."
      />

      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      {/* Where the rows come from. Editable because the upstream report id and
          month are part of the URL — when they change this should be a settings
          edit, not a deploy. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Source</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {savedUrl ? 'Custom URL' : 'Using the built-in default'} · the page number and cache-buster are set per request
          </span>
        </div>
        <div className="gf-url">
          <input className="input mono" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://…/report/data-read/331/1/8/2026/2026-27/0/all?search=&v=13-49" spellCheck={false} />
          <button className="btn btn-secondary" onClick={saveUrl}
            disabled={savingUrl || !canManage || feedUrl.trim() === (savedUrl ?? '')}>
            {savingUrl ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="gf-stats">
        <div className="gf-stat"><b>{rep ? rep.fetched : '—'}</b><span>Rows in the feed</span></div>
        <div className="gf-stat"><b>{rep ? rep.linked.length : '—'}</b><span>Linked IPOs</span></div>
        <div className="gf-stat"><b>{rep ? rep.suggestions.length : '—'}</b><span>Awaiting your review</span></div>
        <div className="gf-stat"><b>{rep ? rep.changes.length : '—'}</b><span>Pending changes</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: 12.5, maxWidth: 520 }}>
            Existing figures are never overwritten — only empty fields are filled, and a
            value entered by a person today always wins.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={!!busy}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
            {canManage && (
              <button className="btn btn-sm" onClick={sync} disabled={!!busy || !rep?.changes.length}>
                {busy === '*' ? 'Syncing…' : `Apply ${rep?.changes.length ?? 0} change${rep?.changes.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* what a sync WOULD do — linked IPOs only */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Pending changes</h3></div>
        {!rep ? <Loader /> : rep.changes.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing to apply. Changes appear here once an IPO below is linked and the feed has
            something our record is missing.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>IPO</th><th>Feed row</th><th>GMP</th><th>Fields to fill</th></tr></thead>
              <tbody>
                {rep.changes.map((c) => (
                  <tr key={c.symbol}>
                    <td style={{ fontWeight: 600 }}>{c.symbol}</td>
                    <td className="muted">{c.from}</td>
                    <td className="mono">{c.gmp != null ? `₹${c.gmp}` : <span className="muted">—</span>}
                      {c.skippedManual && <i className="muted" style={{ fontSize: 11 }}> · held: entered by hand today</i>}</td>
                    <td>{c.filled.length
                      ? c.filled.map((f) => <span key={f} className="st brand" style={{ marginRight: 5 }}>{f}</span>)
                      : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* every confirmed link, whether or not it has anything pending — a wrong
          link with nothing to write would otherwise be invisible and stuck */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Linked</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>These poll by id. Unlink to stop the feed touching an IPO.</span>
        </div>
        {!rep ? <Loader /> : rep.linked.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing linked yet — the feed is doing nothing until something is.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Our IPO</th><th>Their row</th><th className="r">GMP</th><th /></tr></thead>
              <tbody>
                {rep.linked.map((l) => (
                  <tr key={l.symbol}>
                    <td>
                      <b>{l.symbol}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{titleCase(l.ourName)}</div>
                    </td>
                    <td>
                      {l.theirName}
                      <div className="muted mono" style={{ fontSize: 11.5 }}>id {l.sourceId}</div>
                    </td>
                    <td className="r mono">{l.gmp != null ? `₹${l.gmp}` : '—'}</td>
                    <td className="r">
                      {canManage && (
                        <button className="btn btn-secondary btn-sm" disabled={busy === l.symbol}
                          onClick={() => link(l.symbol, null)}>
                          {busy === l.symbol ? '…' : 'Unlink'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* the one human decision on this page */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Suggested links</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Matched on company name. <b>Dates agree</b> means the open and close dates match too —
            check the rest against the feed before linking.
          </span>
        </div>
        {!rep ? <Loader /> : rep.suggestions.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>No unlinked matches in this month&apos;s report.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr><th>Our IPO</th><th>Their row</th><th>Corroboration</th><th className="r">GMP</th><th /></tr>
              </thead>
              <tbody>
                {rep.suggestions.map((s) => (
                  <tr key={s.symbol}>
                    <td>
                      <b>{s.symbol}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{titleCase(s.ourName)}</div>
                    </td>
                    <td>
                      {s.theirName}
                      <div className="muted mono" style={{ fontSize: 11.5 }}>id {s.sourceId}</div>
                    </td>
                    <td>
                      {s.datesAgree
                        ? <span className="st ok">Dates agree</span>
                        : <span className="st warn">Name only</span>}
                    </td>
                    <td className="r mono">{s.gmp != null ? `₹${s.gmp}` : '—'}</td>
                    <td className="r">
                      {canManage && (
                        <button className="btn btn-sm" disabled={busy === s.symbol}
                          onClick={() => link(s.symbol, s.sourceId)}>
                          {busy === s.symbol ? '…' : 'Link'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
