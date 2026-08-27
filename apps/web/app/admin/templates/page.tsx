'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { Field, FormActions } from '@/components/ui/Form';
import { RichText } from '@/components/ui/RichText';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

type Scope = { slug: string; label: string; platform: boolean };
type Channel = 'sms' | 'email' | 'whatsapp';
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'sms', label: 'SMS' }, { key: 'email', label: 'Email' }, { key: 'whatsapp', label: 'WhatsApp' },
];
const LOCALES = [
  { code: 'en', label: 'EN' }, { code: 'hi', label: 'हिं' }, { code: 'ta', label: 'த' },
  { code: 'te', label: 'తె' }, { code: 'bn', label: 'বা' }, { code: 'mr', label: 'म' },
];
const blankType = { channel: 'sms', key: '', label: '', description: '', vars: '' };

/** Strip tags for the card's one-line preview. */
const previewText = (t?: api.MessageTemplate | null): string => {
  if (!t) return '';
  const raw = t.subject || t.body || t.bodyHtml || (t.dltTemplateId ? `DLT ${t.dltTemplateId}` : '');
  return String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
};

export default function TemplatesPage() {
  const me = useOperator();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [scope, setScope] = useState<string>('');
  const [keys, setKeys] = useState<api.MessageKeySpec[]>([]);
  const [rows, setRows] = useState<Record<string, api.MessageTemplate>>({}); // `${channel}:${key}:${locale}`
  const [tab, setTab] = useState<Channel>('sms');
  const [q, setQ] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  // "Send test" target — proving a template works without waiting for a real event
  const [test, setTest] = useState<{ channel: string; key: string; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // content editor modal
  const [edit, setEdit] = useState<null | { spec: api.MessageKeySpec; locale: string; draft: Partial<api.MessageTemplate>; busy?: boolean; err?: string | null }>(null);
  // type catalog modal (superadmin)
  const [typeModal, setTypeModal] = useState<null | { id?: string; form: typeof blankType }>(null);
  const [typeErr, setTypeErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const loadCatalog = useCallback(async () => { setKeys((await api.fetchTemplateCatalog()).keys); }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const list: Scope[] = [];
        if (me.isSuperAdmin) {
          list.push({ slug: me.homeTenant.slug, label: 'Platform (default)', platform: true });
          const tenants = await api.fetchTenants().catch(() => []);
          for (const t of tenants) if (t.whitelabel) list.push({ slug: t.slug, label: t.name, platform: false });
        } else {
          list.push({ slug: me.homeTenant.slug, label: me.homeTenant.name, platform: me.homeTenant.type === 'platform' });
        }
        setScopes(list);
        setScope(list[0]?.slug ?? '');
        await loadCatalog();
      } catch (e: any) { setErr(String(e?.message ?? e)); }
    })();
  }, [me, loadCatalog]);

  const load = useCallback(async () => {
    if (!scope) return;
    setLoading(true); setErr(null);
    try {
      const list = await api.fetchTenantTemplates(scope);
      const byKey: Record<string, api.MessageTemplate> = {};
      for (const t of list) byKey[`${t.channel}:${t.key}:${t.locale ?? 'en'}`] = t;
      setRows(byKey);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const isPlatform = useMemo(() => scopes.find((s) => s.slug === scope)?.platform ?? false, [scopes, scope]);
  const canManageTypes = !!me?.isSuperAdmin;

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return keys
      .filter((k) => k.channel === tab)
      .filter((k) => !ql || `${k.label} ${k.key} ${k.description ?? ''}`.toLowerCase().includes(ql))
      .filter((k) => !missingOnly || !LOCALES.some((l) => rows[`${k.channel}:${k.key}:${l.code}`]));
  }, [keys, tab, q, missingOnly, rows]);

  const openEdit = (spec: api.MessageKeySpec, locale = 'en') => {
    const row = rows[`${spec.channel}:${spec.key}:${locale}`];
    setEdit({ spec, locale, draft: { dltTemplateId: row?.dltTemplateId ?? '', senderId: row?.senderId ?? '', body: row?.body ?? '', subject: row?.subject ?? '', bodyHtml: row?.bodyHtml ?? '' } });
  };
  const switchLocale = (locale: string) => { if (edit) { const { spec } = edit; setEdit(null); setTimeout(() => openEdit(spec, locale), 0); } };

  /** Pull the platform's content for this key/locale into the draft (partner scopes). */
  const copyFromPlatform = async () => {
    if (!edit) return;
    setEdit((e) => e && { ...e, busy: true, err: null });
    try {
      const p = await api.fetchPlatformTemplate(edit.spec.channel, edit.spec.key, edit.locale);
      if (!p) { setEdit((x) => x && { ...x, busy: false, err: 'The platform has no content for this template/language yet.' }); return; }
      setEdit((x) => x && {
        ...x, busy: false,
        draft: { dltTemplateId: p.dltTemplateId ?? '', senderId: p.senderId ?? '', body: p.body ?? '', subject: p.subject ?? '', bodyHtml: p.bodyHtml ?? '' },
      });
    } catch (e: any) { setEdit((x) => x && { ...x, busy: false, err: String(e?.message ?? e) }); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setEdit((e) => e && { ...e, busy: true, err: null });
    try {
      await api.saveTenantTemplate(scope, { channel: edit.spec.channel, key: edit.spec.key, locale: edit.locale, enabled: true, ...edit.draft } as any);
      setEdit(null); setMsg(`Saved ${edit.spec.label} (${edit.locale}).`);
      await load();
    } catch (e: any) { setEdit((x) => x && { ...x, busy: false, err: String(e?.message ?? e) }); }
  };

  const resetLocale = (spec: api.MessageKeySpec, locale: string) => {
    setConfirm({
      title: isPlatform ? `Delete the ${locale} version of "${spec.label}"?` : `Reset "${spec.label}" (${locale}) to the platform default?`,
      danger: true, confirmLabel: isPlatform ? 'Delete' : 'Reset',
      message: isPlatform ? <>This language version is removed{spec.system && locale === 'en' ? ' (the built-in default re-seeds on the next API restart)' : ''}.</> : <>The partner’s override is removed — messages fall back to the platform default.</>,
      onConfirm: async () => {
        try { await api.deleteTenantTemplate(scope, { channel: spec.channel, key: spec.key, locale }); setEdit(null); await load(); setMsg('Removed.'); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
      },
    });
  };

  // type catalog (superadmin)
  const saveType = async () => {
    if (!typeModal) return;
    const f = typeModal.form;
    const vars = f.vars.split(',').map((v) => v.trim()).filter(Boolean);
    setTypeErr(null);
    try {
      if (typeModal.id) await api.updateMessageType(typeModal.id, { label: f.label, description: f.description || undefined, vars });
      else await api.createMessageType({ channel: f.channel, key: f.key, label: f.label, description: f.description || undefined, vars });
      setTypeModal(null); await loadCatalog(); await load();
    } catch (e: any) { setTypeErr(String(e?.message ?? e)); }
  };
  const removeType = (t: api.MessageKeySpec) =>
    setConfirm({
      title: `Delete template type "${t.label}"?`, danger: true, confirmLabel: 'Delete',
      message: <>Removes this message type and its content for the platform <b>and every partner</b>.</>,
      onConfirm: async () => {
        try { await api.deleteMessageType(t.id!); await loadCatalog(); await load(); setMsg(`Deleted ${t.label}.`); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
      },
    });

  if (!me) return <Loader />;
  if (!operatorCan(me, 'providers.manage')) return <NoAccess />;

  const counts = Object.fromEntries(CHANNELS.map((c) => [c.key, keys.filter((k) => k.channel === c.key).length]));

  return (
    <>
      <div className="between" style={{ marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Message templates</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            SMS, email &amp; WhatsApp content per message type and language. Partners override the platform default; anything blank inherits it.
          </p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {scopes.length > 1 && (
            <select className="input" style={{ width: 210 }} value={scope} onChange={(e) => setScope(e.target.value)} title="Partner scope">
              {scopes.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          )}
          {canManageTypes && <button className="btn" onClick={() => { setTypeErr(null); setTypeModal({ form: { ...blankType, channel: tab } }); }}>＋ Add template type</button>}
        </div>
      </div>

      {err && <div className="banner warn" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="tabs-bar" style={{ marginBottom: 14 }}>
        {CHANNELS.map((c) => (
          <button key={c.key} className={`tab${tab === c.key ? ' on' : ''}`} onClick={() => setTab(c.key)}>
            {c.label}<span className="tab-count">{counts[c.key]}</span>
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
          <input className="input" style={{ width: 200 }} placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="row" style={{ gap: 6, fontSize: 12.5, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> Missing content
          </label>
        </span>
      </div>

      {loading ? <Loader /> : visible.length === 0 ? (
        <div className="muted" style={{ padding: '32px 0', textAlign: 'center', fontSize: 13.5 }}>
          {q || missingOnly ? 'No templates match.' : `No ${tab.toUpperCase()} templates yet${canManageTypes ? ' — click ＋ Add template type.' : '.'}`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
          {visible.map((spec) => {
            const enRow = rows[`${spec.channel}:${spec.key}:en`];
            const hasAny = LOCALES.some((l) => rows[`${spec.channel}:${spec.key}:${l.code}`]);
            const preview = previewText(enRow);
            return (
              <div key={`${spec.channel}:${spec.key}`} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '13px 15px 11px', flex: 1 }}>
                  <div className="between" style={{ alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{spec.label}</div>
                      <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{spec.key}{spec.system ? ' · built-in' : ''}</div>
                    </div>
                    <span className={`st ${hasAny ? 'ok' : 'mut'}`} style={{ flexShrink: 0 }}>
                      {isPlatform ? (hasAny ? 'set' : 'empty') : (hasAny ? 'overridden' : 'inherits')}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 8, minHeight: 30, overflow: 'hidden' }}>
                    {preview || <i>{isPlatform ? 'No content yet.' : 'Inherits the platform default.'}</i>}
                  </div>
                  <div className="row" style={{ gap: 4, marginTop: 8 }}>
                    {LOCALES.map((l) => {
                      const has = !!rows[`${spec.channel}:${spec.key}:${l.code}`];
                      return (
                        <button key={l.code} type="button" onClick={() => openEdit(spec, l.code)} title={`${l.code} — ${has ? 'edit' : 'add'}`}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${has ? 'var(--brand)' : 'var(--border)'}`, background: has ? 'var(--brand)' : 'transparent', color: has ? '#fff' : 'var(--text-faint)' }}>
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="row" style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(spec, 'en')}><Icon name="edit" size={13} /> Edit</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTest({ channel: spec.channel, key: spec.key, label: spec.label })} title="Send this template to a number or address you choose"><Icon name="bolt" size={13} /> Test</button>
                  {hasAny && !(isPlatform && spec.system) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => resetLocale(spec, 'en')} title={isPlatform ? 'Delete content' : 'Reset override'}>
                      {isPlatform ? 'Delete' : 'Reset'}
                    </button>
                  )}
                  {canManageTypes && (
                    <span className="row-actions">
                      <button className="icon-btn" title="Edit type (label / variables)" onClick={() => setTypeModal({ id: spec.id, form: { channel: spec.channel, key: spec.key, label: spec.label, description: spec.description ?? '', vars: (spec.vars ?? []).join(', ') } })}><Icon name="settings" size={14} /></button>
                      {!spec.system && <button className="icon-btn danger" title="Delete type" onClick={() => removeType(spec)}><Icon name="trash" size={14} /></button>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* content editor modal */}
      {edit && (
        <Modal title={`${edit.spec.label}`} sub={`${edit.spec.channel.toUpperCase()} · ${scopes.find((s) => s.slug === scope)?.label ?? ''} — variables: ${edit.spec.vars?.length ? edit.spec.vars.map((v) => `{{${v}}}`).join(' ') : '—'}`} onClose={() => setEdit(null)} wide>
        {edit.err && <div className="banner warn" style={{ marginBottom: 12 }}>{edit.err}</div>}
          <div className="row" style={{ gap: 6, marginBottom: 14 }}>
            {LOCALES.map((l) => {
              const has = !!rows[`${edit.spec.channel}:${edit.spec.key}:${l.code}`];
              const on = edit.locale === l.code;
              return (
                <button key={l.code} type="button" className={`btn btn-sm ${on ? '' : 'btn-secondary'}`} onClick={() => switchLocale(l.code)}>
                  {l.label}{has ? ' ●' : ''}
                </button>
              );
            })}
          </div>
          {edit.spec.channel === 'email' ? (
            <div className="form-grid">
              <Field label="Subject" span={3}><input className="input" value={edit.draft.subject ?? ''} onChange={(e) => setEdit((x) => x && { ...x, draft: { ...x.draft, subject: e.target.value } })} /></Field>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Body</label>
                <RichText value={edit.draft.bodyHtml ?? ''} onChange={(html) => setEdit((x) => x && { ...x, draft: { ...x.draft, bodyHtml: html } })} minHeight={180} />
              </div>
            </div>
          ) : (
            <div className="form-grid">
              {edit.spec.channel === 'sms' && <>
                <Field label="DLT template ID"><input className="input mono" value={edit.draft.dltTemplateId ?? ''} onChange={(e) => setEdit((x) => x && { ...x, draft: { ...x.draft, dltTemplateId: e.target.value } })} placeholder="registered DLT id" /></Field>
                <Field label="Sender ID"><input className="input mono" value={edit.draft.senderId ?? ''} onChange={(e) => setEdit((x) => x && { ...x, draft: { ...x.draft, senderId: e.target.value } })} placeholder="e.g. INVYRD" /></Field>
              </>}
              <Field label="Message text" span={3}><textarea className="input" rows={4} value={edit.draft.body ?? ''} onChange={(e) => setEdit((x) => x && { ...x, draft: { ...x.draft, body: e.target.value } })} placeholder="Your OTP is {{otp}} …" /></Field>
            </div>
          )}
          <FormActions>
            <button className="btn" disabled={!!edit.busy} onClick={saveEdit}>{edit.busy ? 'Saving…' : 'Save'}</button>
            {!isPlatform && (
              <button className="btn btn-secondary" disabled={!!edit.busy} onClick={copyFromPlatform} title="Fill the fields with the platform's content, then adjust and save">
                <Icon name="copy" size={13} /> Copy from platform
              </button>
            )}
            {!!rows[`${edit.spec.channel}:${edit.spec.key}:${edit.locale}`] && !(isPlatform && edit.spec.system && edit.locale === 'en') && (
              <button className="btn btn-secondary" onClick={() => resetLocale(edit.spec, edit.locale)}>{isPlatform ? `Delete ${edit.locale}` : 'Reset to platform'}</button>
            )}
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}

      {/* type catalog modal (superadmin) */}
      {typeModal && (
        <Modal
          title={typeModal.id ? 'Edit template type' : 'Add a template type'}
          sub={typeModal.id ? 'Rename or change the variables. Key and channel are fixed.' : 'Defines a new message type — it appears for the platform and every partner.'}
          onClose={() => setTypeModal(null)}
        >
          {typeErr && <div className="banner warn" style={{ marginBottom: 14 }}>{typeErr}</div>}
          <div className="form-grid">
            <Field label="Channel"><select className="input" disabled={!!typeModal.id} value={typeModal.form.channel} onChange={(e) => setTypeModal((m) => m && { ...m, form: { ...m.form, channel: e.target.value } })}><option value="sms">SMS</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
            <Field label="Key" required hint="lowercase, e.g. allotment_result"><input className="input mono" disabled={!!typeModal.id} value={typeModal.form.key} onChange={(e) => setTypeModal((m) => m && { ...m, form: { ...m.form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } })} placeholder="allotment_result" /></Field>
            <Field label="Label" required span={2}><input className="input" value={typeModal.form.label} onChange={(e) => setTypeModal((m) => m && { ...m, form: { ...m.form, label: e.target.value } })} placeholder="Allotment result alert" /></Field>
            <Field label="Description" span={3}><input className="input" value={typeModal.form.description} onChange={(e) => setTypeModal((m) => m && { ...m, form: { ...m.form, description: e.target.value } })} /></Field>
            <Field label="Variables" span={3} hint="Comma-separated names usable as {{var}}"><input className="input mono" value={typeModal.form.vars} onChange={(e) => setTypeModal((m) => m && { ...m, form: { ...m.form, vars: e.target.value } })} placeholder="name, symbol, lots" /></Field>
          </div>
          <FormActions>
            <button className="btn" onClick={saveType} disabled={!typeModal.form.label.trim() || (!typeModal.id && !typeModal.form.key.trim())}>{typeModal.id ? 'Save changes' : 'Add type'}</button>
            <button className="btn btn-secondary" onClick={() => setTypeModal(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {test && <TestSendDialog spec={test} onClose={() => setTest(null)} />}
    </>
  );
}

/**
 * Send one template to a recipient the operator names.
 *
 * Shows the RENDERED body beside the provider's answer: a DLT rejection is
 * almost always a text mismatch against the registered template, and seeing
 * exactly what went out is the quickest way to spot it. Every test send is
 * tagged `test` in the Message Log.
 */
function TestSendDialog({ spec, onClose }: { spec: { channel: string; key: string; label: string }; onClose: () => void }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const isEmail = spec.channel === 'email';

  const send = async () => {
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await api.sendTemplateTest({ channel: spec.channel, key: spec.key, to })); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Test — ${spec.label}`} sub={`${spec.channel.toUpperCase()} · ${spec.key}`} onClose={onClose}>
      <div className="field">
        <label>{isEmail ? 'Send to (email)' : 'Send to (mobile)'}</label>
        <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)}
          placeholder={isEmail ? 'you@company.com' : spec.channel === 'whatsapp' ? '919876543210' : '9876543210'} />
        <span className="hint">Placeholders are filled with sample values — OTP 123456 and the like.</span>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 12 }}>{err}</div>}
      {res && (
        <div className={`banner ${res.sent ? 'ok' : res.dev ? 'info' : 'warn'}`} style={{ marginBottom: 12, display: 'block' }}>
          <b>
            {res.sent ? 'Handed to the provider.'
              : res.dev ? 'Not sent — no provider is configured for this channel, so it was only logged.'
              : 'The provider refused it.'}
          </b>
          {res.error && <div style={{ marginTop: 6 }}>{res.error}</div>}
          {res.dltTemplateId && (
            <div className="mono" style={{ marginTop: 6, fontSize: 12 }}>
              DLT template: {res.dltTemplateId}{res.senderId ? ` · sender ${res.senderId}` : ''}
            </div>
          )}
          {res.rendered && (
            <>
              <div className="hint" style={{ marginTop: 8 }}>What was sent:</div>
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '4px 0 0' }}>{res.rendered}</pre>
            </>
          )}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <a className="btn btn-secondary" href="/admin/templates/log">Open Message Log</a>
        <button className="btn" disabled={busy || !to.trim()} onClick={send}>{busy ? 'Sending…' : 'Send test'}</button>
      </div>
    </Modal>
  );
}
