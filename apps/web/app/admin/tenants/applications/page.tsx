'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Segmented } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { Toasts, useToast } from '@/components/ui/Toast';
import * as api from '@/lib/tenants-admin';

const TABS = [
  { value: 'submitted', label: 'To review' },
  { value: 'changes_requested', label: 'Awaiting applicant' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];
const KIND_LABEL: Record<string, string> = { partner: 'Partner', whitelabel: 'White-label', branch: 'Branch' };
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Partner self-onboarding review queue.
 *
 * Applications live outside the tenant tree until approved — approving is what
 * creates the tenant and the admin login, so nothing half-real ever shows up in
 * settings cascade, RLS scoping or reports. The activation link is always shown
 * back to the reviewer so an unconfigured SMTP can't silently strand a partner.
 */
export default function PartnerApplicationsPage() {
  const me = useOperator();
  const { toasts, push: toast } = useToast();
  const [tab, setTab] = useState('submitted');
  const [rows, setRows] = useState<api.PartnerApplicationRow[] | null>(null);
  const [open, setOpen] = useState<api.PartnerApplicationDetail | null>(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('partner');
  const [slug, setSlug] = useState('');
  const [parentSlug, setParentSlug] = useState('');
  const [parents, setParents] = useState<api.PartnerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ slug: string; code: string | null; username: string; activationLink: string; emailSent: boolean; emailDev: boolean } | null>(null);

  const load = useCallback((status: string) => {
    setRows(null);
    api.fetchPartnerApplications(status).then(setRows).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  }, []);
  useEffect(() => { load(tab); }, [tab, load]);
  // parents for the branch case — a branch must hang off an existing partner
  useEffect(() => { api.fetchTenants().then(setParents).catch(() => setParents([])); }, []);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'tenants.manage')) return <NoAccess />;

  const openRow = async (id: string) => {
    setErr(null); setResult(null); setNote('');
    try {
      const d = await api.fetchPartnerApplication(id);
      setOpen(d); setKind(d.kind); setSlug(''); setParentSlug('');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); toast(ok, 'ok'); load(tab); return r; }
    catch (e: any) { setErr(String(e?.message ?? e)); toast('Action failed', 'err'); return null; }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!open) return;
    if (kind === 'branch' && !parentSlug) { setErr('Choose the parent partner for this branch.'); return; }
    const r = await act(
      () => api.approvePartnerApplication(open.id, { kind, slug: slug || undefined, parentSlug: kind === 'branch' ? parentSlug : undefined }),
      'Partner approved');
    if (r) { setResult(r); setOpen({ ...open, status: 'approved' }); }
  };
  const changes = async () => {
    if (!open || !note.trim()) { setErr('Write a note telling the applicant what to fix.'); return; }
    if (await act(() => api.requestPartnerChanges(open.id, note.trim()), 'Sent back to the applicant')) setOpen(null);
  };
  const reject = async () => {
    if (!open || !note.trim()) { setErr('Write a short reason — it is recorded on the application.'); return; }
    if (!window.confirm(`Reject ${open.legalName}? They will be told the application was not approved.`)) return;
    if (await act(() => api.rejectPartnerApplication(open.id, note.trim()), 'Application rejected')) setOpen(null);
  };

  return (
    <div style={{ maxWidth: 1180 }}>
      <Toasts toasts={toasts} />
      <PageHead
        title="Partner Applications"
        back={{ href: '/admin/tenants', label: 'Tenants' }}
        sub="Self-onboarding requests from the public site. Approving creates the tenant and emails the applicant a link to set their password."
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div style={{ marginBottom: 14 }}>
        <Segmented value={tab} options={TABS} onChange={(v) => { setTab(v); setOpen(null); }} />
      </div>

      <div className="card"><div className="card-pad">
        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div className="muted" style={{ padding: '22px 0', textAlign: 'center' }}>Nothing here.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Business</th><th>Applying as</th><th>Contact</th><th>Location</th><th>Received</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.legalName}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{r.entityType || '—'}</div>
                  </td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>
                    <div>{r.contactName}</div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{r.mobile}</div>
                  </td>
                  <td className="muted">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dt(r.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openRow(r.id)}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>

      {open && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="section-title" style={{ fontSize: 13, margin: 0 }}>{KIND_LABEL[open.kind] ?? open.kind} application</div>
              <h2 style={{ margin: '4px 0 0' }}>{open.legalName}</h2>
            </div>
            <button className="icon-btn" title="Close" onClick={() => { setOpen(null); setResult(null); }}><Icon name="x" size={15} /></button>
          </div>

          <div className="cols-2" style={{ marginTop: 16 }}>
            <div>
              <div className="kv"><span className="k">Entity type</span><span className="v">{open.entityType || '—'}</span></div>
              <div className="kv"><span className="k">PAN</span><span className="v mono">{open.pan || '—'}</span></div>
              <div className="kv"><span className="k">GSTIN</span><span className="v mono">{open.gstin || '—'}</span></div>
              <div className="kv"><span className="k">Location</span><span className="v">{[open.city, open.state].filter(Boolean).join(', ') || '—'}</span></div>
            </div>
            <div>
              <div className="kv"><span className="k">Contact</span><span className="v">{open.contactName}</span></div>
              <div className="kv"><span className="k">Mobile</span><span className="v mono">{open.mobile}</span></div>
              <div className="kv"><span className="k">Email</span><span className="v">{open.email}</span></div>
              <div className="kv"><span className="k">SEBI / ARN</span><span className="v mono">{[open.sebiRegNo, open.arn].filter(Boolean).join(' · ') || '—'}</span></div>
            </div>
          </div>

          {open.notes && (
            <>
              <div className="section-title" style={{ fontSize: 13 }}>Their note</div>
              <p className="muted" style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{open.notes}</p>
            </>
          )}

          {open.documents?.length > 0 && (
            <>
              <div className="section-title" style={{ fontSize: 13 }}>Documents</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {open.documents.map((d, i) => (
                  <a key={i} className="btn btn-secondary btn-sm" href={d.url} target="_blank" rel="noreferrer">
                    <Icon name="doc" size={14} /> {d.name || d.type}
                  </a>
                ))}
              </div>
            </>
          )}

          {result ? (
            <div className={`banner ${result.emailSent ? 'ok' : 'warn'}`} style={{ marginTop: 18, display: 'block' }}>
              <b>Approved — tenant “{result.slug}”{result.code ? ` (${result.code})` : ''} created.</b>
              <div style={{ marginTop: 6 }}>Admin username: <span className="mono">{result.username}</span></div>
              <div style={{ marginTop: 6 }}>
                {result.emailSent
                  ? 'The activation link has been emailed to the applicant.'
                  : result.emailDev
                    ? 'Email is not configured on this server, so nothing was sent — send this link to the applicant yourself:'
                    : 'The email could not be sent — send this link to the applicant yourself:'}
              </div>
              <div className="mono" style={{ marginTop: 6, wordBreak: 'break-all', fontSize: 12 }}>{result.activationLink}</div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}
                onClick={() => { navigator.clipboard?.writeText(result.activationLink); toast('Link copied', 'ok'); }}>
                <Icon name="copy" size={14} /> Copy link
              </button>
              <div className="hint" style={{ marginTop: 8 }}>The link works once and expires in 7 days.</div>
            </div>
          ) : open.status === 'approved' ? (
            <>
              <div className="banner ok" style={{ marginTop: 18 }}>
                Approved on {dt(open.reviewedAt)}{open.activatedAt ? ` · password set ${dt(open.activatedAt)}` : ' · password not set yet'}.
              </div>
              {/* Re-send activation is meaningful ONLY while the account is
                  approved but not yet activated. Once the partner has set a
                  password (activatedAt is present) they use the normal login
                  flow and this button would just confuse. */}
              {!open.activatedAt && (
                <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      // `act` toasts and reloads for us; we only need to show
                      // the fresh link inline so the operator can copy it if
                      // SMTP is having a bad moment.
                      const r = await act(() => api.resendPartnerActivation(open.id), 'Activation email re-sent.');
                      if (r) {
                        setResult({
                          slug: '', code: null, username: '',
                          activationLink: r.activationLink,
                          emailSent: r.emailSent, emailDev: r.emailDev,
                        } as any);
                      }
                    }}
                  >
                    <Icon name="refresh" size={14} /> Re-send activation email
                  </button>
                  <span className="hint">Generates a fresh 7-day link and invalidates the previous one.</span>
                </div>
              )}
            </>
          ) : open.status === 'rejected' ? (
            <div className="banner warn" style={{ marginTop: 18 }}>Rejected on {dt(open.reviewedAt)}{open.reviewNote ? ` — ${open.reviewNote}` : ''}</div>
          ) : (
            <>
              <div className="section-title" style={{ fontSize: 13 }}>Decision</div>
              <div className="filter-row">
                <div className="field" style={{ width: 170 }}>
                  <label>Create as</label>
                  <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="partner">Partner</option>
                    <option value="whitelabel">White-label</option>
                    <option value="branch">Branch</option>
                  </select>
                </div>
                <div className="field" style={{ width: 220 }}>
                  <label>Tenant slug</label>
                  <input className="input mono" value={slug} placeholder="from business name"
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
                </div>
                {kind === 'branch' && (
                  <div className="field" style={{ width: 220 }}>
                    <label>Parent partner</label>
                    <select className="input" value={parentSlug} onChange={(e) => setParentSlug(e.target.value)}>
                      <option value="">Select…</option>
                      {parents.filter((p) => p.type !== 'branch').map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button className="btn" disabled={busy} onClick={approve}><Icon name="check" size={15} /> Approve &amp; create tenant</button>
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <label>Note to the applicant <span className="hint">(required to send back or reject)</span></label>
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Please share your SEBI registration certificate." />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-secondary" disabled={busy} onClick={changes}>Request changes</button>
                <button className="btn btn-secondary danger" disabled={busy} onClick={reject}>Reject</button>
              </div>
            </>
          )}
        </div></div>
      )}
    </div>
  );
}
