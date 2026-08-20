'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * News editor — admin-written IPO coverage (2–3 short posts per IPO is the
 * target cadence). Body accepts plain paragraphs or HTML; drafts stay private
 * until published. Published posts appear at /news and on the homepage.
 */
export default function AdminNewsPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.PostRow[] | null>(null);
  const [modal, setModal] = useState<null | { id?: string; form: Partial<api.PostRow> }>(null);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchPosts().then((r) => { setRows(r); setErr(null); }).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');
  const upd = (part: Partial<api.PostRow>) => setModal((m) => m && { ...m, form: { ...m.form, ...part } });

  const save = async (publish?: boolean) => {
    if (!modal?.form.title?.trim()) { setModalErr('Title is required.'); return; }
    setBusy(true); setModalErr(null);
    const body: Partial<api.PostRow> = {
      title: modal.form.title, slug: modal.form.slug, excerpt: modal.form.excerpt ?? '',
      body: modal.form.body ?? '', coverUrl: modal.form.coverUrl ?? '',
      ipoSymbol: modal.form.ipoSymbol ?? '', author: modal.form.author ?? '',
      tags: String((modal.form as any).tagsText ?? (modal.form.tags ?? []).join(', ')).split(',').map((t) => t.trim()).filter(Boolean),
      ...(publish != null ? { status: publish ? 'published' : 'draft' } : {}),
    };
    try {
      if (modal.id) await api.updatePost(modal.id, body);
      else await api.createPost(body);
      setModal(null); load();
    } catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const togglePublish = async (r: api.PostRow) => {
    try { await api.updatePost(r.id, { status: r.status === 'published' ? 'draft' : 'published' }); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const remove = async (r: api.PostRow) => {
    try { await api.deletePost(r.id); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const onCover = async (file?: File | null) => {
    if (!file) return;
    setImgBusy(true); setModalErr(null);
    try { upd({ coverUrl: await api.uploadImage(file) }); }
    catch (e: any) { setModalErr(String(e?.message ?? e)); }
    finally { setImgBusy(false); }
  };

  const openEdit = (r?: api.PostRow) =>
    setModal(r
      ? { id: r.id, form: { ...r, ...( { tagsText: r.tags.join(', ') } as any) } }
      : { form: { status: 'draft', ...( { tagsText: '' } as any) } });

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHead
        title="News & Updates"
        sub="Short IPO coverage — open/close alerts, allotment-out notes, listing recaps. Published posts appear at /news and on the homepage."
        actions={canManage ? <button className="btn" onClick={() => openEdit()}><Icon name="plus" size={15} /> New post</button> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {rows === null ? <Loader /> : (
        <div className="card"><div className="card-pad">
          {rows.length === 0 ? (
            <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>No posts yet — click <b>New post</b>.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Post</th><th>IPO</th><th>Status</th><th>Published</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div className="muted mono" style={{ fontSize: 11.5 }}>/news/{r.slug}</div>
                    </td>
                    <td className="mono">{r.ipoSymbol ?? '—'}</td>
                    <td>{r.status === 'published'
                      ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>published</span>
                      : <span className="pill">draft</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="icon-btn" title="Edit" onClick={() => openEdit(r)}><Icon name="edit" size={14} /></button>
                          <button className="icon-btn" title={r.status === 'published' ? 'Unpublish' : 'Publish'} onClick={() => togglePublish(r)}><Icon name="power" size={14} /></button>
                          <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}><Icon name="trash" size={14} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div></div>
      )}

      {modal && (
        <Modal title={modal.id ? 'Edit post' : 'New post'} onClose={() => setModal(null)}>
          {modalErr && <div className="banner warn" style={{ marginBottom: 14 }}>{modalErr}</div>}
          <div className="form-grid">
            <Field label="Title" required span={3}><input className="input" value={modal.form.title ?? ''} onChange={(e) => upd({ title: e.target.value })} placeholder="ARDEE IPO subscribed 12× on day 2 — retail leads" /></Field>
            <Field label="Slug" hint="auto from title if left blank" span={2}><input className="input mono" value={modal.form.slug ?? ''} onChange={(e) => upd({ slug: e.target.value })} placeholder="ardee-ipo-day-2" /></Field>
            <Field label="IPO symbol" hint="optional link"><input className="input mono" value={modal.form.ipoSymbol ?? ''} onChange={(e) => upd({ ipoSymbol: e.target.value.toUpperCase() })} placeholder="ARDEE" /></Field>
            <Field label="Excerpt" hint="one-line summary for cards" span={3}><input className="input" value={modal.form.excerpt ?? ''} onChange={(e) => upd({ excerpt: e.target.value })} /></Field>
            <Field label="Cover image" span={2}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {modal.form.coverUrl && <img src={modal.form.coverUrl} alt="" style={{ width: 90, height: 44, objectFit: 'cover', borderRadius: 6 }} />}
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {imgBusy ? 'Uploading…' : modal.form.coverUrl ? 'Replace' : <><Icon name="upload" size={14} /> Upload</>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onCover(e.target.files?.[0])} />
                </label>
                {modal.form.coverUrl && <button type="button" className="icon-btn danger" onClick={() => upd({ coverUrl: '' })}><Icon name="trash" size={14} /></button>}
              </div>
            </Field>
            <Field label="Tags" hint="comma-separated"><input className="input" value={(modal.form as any).tagsText ?? ''} onChange={(e) => upd({ ...( { tagsText: e.target.value } as any) })} placeholder="subscription, sme" /></Field>
            <Field label="Author"><input className="input" value={modal.form.author ?? ''} onChange={(e) => upd({ author: e.target.value })} placeholder="Investoyard Desk" /></Field>
            <Field label="Body" hint="paragraphs (blank line = new para) or HTML" span={3}>
              <textarea className="input" rows={12} value={modal.form.body ?? ''} onChange={(e) => upd({ body: e.target.value })} />
            </Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save & publish'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => save(modal.form.status === 'published' ? undefined : false)}>{modal.form.status === 'published' ? 'Save' : 'Save draft'}</button>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          </FormActions>
        </Modal>
      )}
    </div>
  );
}
