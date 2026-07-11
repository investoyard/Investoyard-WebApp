'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct (B2C)', partner: 'Partner', branch: 'Branch' };

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 44, height: 24, appearance: 'none', WebkitAppearance: 'none', borderRadius: 999, background: on ? 'var(--brand)' : 'var(--border-2)', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s', outline: 'none' }} />
      <span style={{ position: 'relative', width: 0 }}>
        <span style={{ position: 'absolute', top: -12, left: on ? -22 : -42, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s' }} />
      </span>
    </label>
  );
}

/** One feature's effective value + source + lock controls for the selected tenant. */
function FeatureRow({ slug, feature, r, busy, onSet, onClear }: {
  slug: string; feature: api.Feature; r?: api.ResolvedSetting; busy: boolean;
  onSet: (key: string, value: any, locked: boolean) => void; onClear: (key: string) => void;
}) {
  const value = r?.value;
  const overriddenHere = r?.source === slug;
  const lockedByAncestor = !!r?.locked && r?.source !== slug;
  const [num, setNum] = useState(String(value ?? feature.defaultValue));

  const source = overriddenHere
    ? (r?.locked ? 'Set here · locked for sub-tenants' : 'Set here')
    : lockedByAncestor ? `Locked by "${r?.source}"`
    : r?.source === 'default' ? 'Inherited · platform default' : `Inherited from "${r?.source}"`;

  return (
    <div className="between" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{feature.label} {lockedByAncestor && <span title="Locked by an ancestor">🔒</span>}</div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>{feature.key}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{source}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 10 }}>
          {feature.valueType === 'boolean' ? (
            <Toggle on={!!value} disabled={lockedByAncestor || busy} onChange={(v) => onSet(feature.key, v, overriddenHere ? !!r?.locked : false)} />
          ) : feature.valueType === 'number' ? (
            <>
              <input className="input mono" style={{ width: 90 }} value={num} disabled={lockedByAncestor || busy}
                onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))} />
              <button className="btn btn-sm" disabled={lockedByAncestor || busy || num === String(value)}
                onClick={() => onSet(feature.key, Number(num), overriddenHere ? !!r?.locked : false)}>Save</button>
            </>
          ) : (
            <span className="mono">{String(value)}</span>
          )}
        </div>
        {!lockedByAncestor && (
          <label className="row muted" style={{ gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={overriddenHere && !!r?.locked} disabled={busy}
              onChange={(e) => onSet(feature.key, value ?? feature.defaultValue, e.target.checked)} />
            Lock for sub-tenants
          </label>
        )}
        {overriddenHere && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onClear(feature.key)}>Clear override (inherit)</button>
        )}
      </div>
    </div>
  );
}

export default function AdminTenants() {
  const s = useAdmin((x) => x);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [catalog, setCatalog] = useState<api.Feature[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [resolved, setResolved] = useState<api.Resolved>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refreshTree = useCallback(async () => { setTree(await api.fetchTree()); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, c] = await Promise.all([api.fetchTree(), api.fetchCatalog()]);
        setTree(t); setCatalog(c);
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        if (first) { setSel(first.slug); setResolved((await api.fetchResolved(first.slug)).settings); }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const select = async (slug: string) => {
    setSel(slug); setErr(null);
    try { setResolved((await api.fetchResolved(slug)).settings); } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const run = async (key: string, fn: () => Promise<api.Resolved>) => {
    setBusyKey(key); setErr(null);
    try { setResolved(await fn()); await refreshTree(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusyKey(null); }
  };
  const onSet = (key: string, value: any, locked: boolean) => sel && run(key, () => api.setOverride(sel, key, value, locked));
  const onClear = (key: string) => sel && run(key, () => api.clearOverride(sel, key));

  if (!can(s, 'tenants.manage')) return <NoAccess />;

  const selected = tree.find((t) => t.slug === sel);
  const childrenOf = (pid: string | null) => tree.filter((t) => t.parentId === pid);
  const roots = tree.filter((t) => !t.parentId || !tree.some((x) => x.id === t.parentId));

  const renderNode = (t: api.AdminTenant, depth: number): React.ReactNode => (
    <div key={t.id}>
      <button
        onClick={() => select(t.slug)}
        className="tn-row"
        style={{
          width: '100%', textAlign: 'left', padding: '9px 12px', paddingLeft: 12 + depth * 20,
          border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          background: sel === t.slug ? 'var(--brand-50)' : 'transparent',
          boxShadow: sel === t.slug ? 'inset 0 0 0 1px var(--brand-200)' : 'none',
        }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: t.brandColor ?? 'var(--border-2)', flexShrink: 0 }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
          {t.flags && t.flags.gmpEnabled === false && <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>GMP off</span>}
        </span>
      </button>
      {childrenOf(t.id).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Tenants</h1><p className="muted">White-label channels &amp; the settings cascade — live from the API.</p></div>
      </div>

      {err && <div className="banner warn" style={{ marginBottom: 16 }}>API error: {err}. Make sure the API is running on <span className="mono">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'}</span>.</div>}
      {loading ? <div className="muted">Loading tenants…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tenant tree</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {roots.map((r) => renderNode(r, 0))}
            </div>
          </div>

          <div className="panel">
            {selected ? (
              <>
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.name}</h3>
                    <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                      {TYPE_LABEL[selected.type] ?? selected.type}
                      {selected.customDomain && <> · <span className="mono">{selected.customDomain}</span></>}
                      {selected.type === 'branch' && <> · inherits from parent</>}
                    </div>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Effective feature values for this tenant. Changing one writes an override; locking freezes it for
                  every tenant below in the tree.
                </p>
                <div style={{ marginTop: 6 }}>
                  {catalog.map((f) => (
                    <FeatureRow key={`${sel}:${f.key}:${JSON.stringify(resolved[f.key]?.value)}:${resolved[f.key]?.source}`}
                      slug={selected.slug} feature={f} r={resolved[f.key]} busy={busyKey === f.key} onSet={onSet} onClear={onClear} />
                  ))}
                </div>
              </>
            ) : <div className="muted">Select a tenant.</div>}
          </div>
        </div>
      )}
    </>
  );
}
