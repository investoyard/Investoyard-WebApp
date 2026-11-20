'use client';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { PartnerKeysPanel } from '@/components/admin/PartnerKeysPanel';

/**
 * My API Keys — a partner admin's own view of their partner-API credentials.
 *
 * A platform admin reaches the same panel via Tenants → click a partner
 * → API access. That path is gated on `tenants.manage`, which a partner
 * admin cannot hold (it would surface the whole platform tenant tree).
 * This page opens on the CURRENT user's home tenant so the partner
 * admin has one direct link to generate / revoke their own keys.
 *
 * Server-side, the endpoints /admin/partner-keys/{tenantId} enforce
 * scope: superadmin OR active membership on that tenant, so a partner
 * calling with someone else's tenantId is refused.
 */
export default function MyApiKeysPage() {
  const me = useOperator();
  const tenantId = me?.homeTenant?.id;
  const tenantName = me?.homeTenant?.name;

  if (me === null) return <NoAccess />;
  if (me === undefined) return <Loader />;

  return (
    <div>
      <PageHead
        title="My API Keys"
        sub={tenantName ? `Partner API credentials for ${tenantName}. The secret is shown once — copy it when the key is created.` : ''}
      />
      {tenantId && (
        <PartnerKeysPanel
          tenantId={tenantId}
          title="Partner API keys"
          intro={<>Each call carries the header <span className="mono">X-Api-Key: keyId.secret</span>. A key works for your organisation only, and can be limited to some of what your account can do — a reporting system that only reads allotment results does not need a key that can print forms.</>}
        />
      )}
      <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Need the API reference? See <a href="/admin/partner-api/docs">API Docs</a>.
      </div>
    </div>
  );
}
