'use client';
import { MasterCrud } from '@/components/MasterCrud';

export default function RegistrarsPage() {
  return (
    <MasterCrud
      kind="registrars"
      title="Registrars"
      sub="Registrar & transfer agents (KFin, Link Intime, …) — feed the IPO form's Registrar dropdown. Deactivate to hide from new IPOs."
      withUrl
    />
  );
}
