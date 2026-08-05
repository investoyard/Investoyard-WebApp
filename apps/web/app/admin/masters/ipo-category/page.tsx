'use client';
import { useEffect, useState } from 'react';
import { PageHead, Field } from '@/components/ui/Form';
import { SimpleMaster } from '@/components/SimpleMaster';
import * as api from '@/lib/tenants-admin';

/** IPO Categories + Issue Types managed together — one page, two tabs. */
export default function IpoCategoryPage() {
  const [tab, setTab] = useState<'categories' | 'issue-types'>('categories');
  const [cats, setCats] = useState<api.MasterRow[]>([]);
  // refresh the category list whenever the Issue Types tab opens (a just-added category must appear)
  useEffect(() => {
    if (tab === 'issue-types') api.fetchMaster('ipo-categories').then((r) => setCats(r.filter((c) => c.active))).catch(() => {});
  }, [tab]);

  return (
    <>
      <PageHead
        title="IPO Category & Issue Types"
        sub="Categories (Main Board IPO, SME IPO, …) and the issue types linked to them. A category name containing “SME” is treated as SME automatically. Picking an issue type in the IPO form auto-selects its category."
      />
      <div className="segmented" style={{ marginBottom: 16, width: 'fit-content' }}>
        <button type="button" className={tab === 'categories' ? 'on' : ''} onClick={() => setTab('categories')}>IPO Categories</button>
        <button type="button" className={tab === 'issue-types' ? 'on' : ''} onClick={() => setTab('issue-types')}>Issue Types</button>
      </div>

      {tab === 'categories' ? (
        <SimpleMaster
          key="categories"
          embedded
          kind="ipo-categories"
          title="IPO Categories"
          sub=""
          extraLabel=''
          renderExtra={() => null}
        />
      ) : (
        <SimpleMaster
          key="issue-types"
          embedded
          kind="issue-types"
          title="Issue Types"
          sub=""
          extraLabel="IPO Category"
          renderExtra={(form, upd) => (
            <Field label="IPO Category" required>
              <select className="input" value={form.categoryId ?? ''} onChange={(e) => upd({ categoryId: e.target.value })}>
                <option value="">— select category —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          extraCell={(r) => (r.category ? <span className="pill">{r.category.name}</span> : <span className="muted">—</span>)}
        />
      )}
    </>
  );
}
