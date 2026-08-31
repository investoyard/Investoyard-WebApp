'use client';
import { MasterCrud } from '@/components/MasterCrud';

export default function LeadManagersPage() {
  return (
    <MasterCrud
      kind="lead-managers"
      title="Lead Managers"
      sub="Syndicate members / lead managers — feed the IPO form's Partner and Lead Manager dropdowns. Deactivate to hide from new IPOs."
      bulk
    />
  );
}
