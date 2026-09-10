'use client';
import { SimpleMaster } from '@/components/SimpleMaster';

/**
 * UPI Handles master — the allowed handles (the part after '@' in a UPI ID).
 * Investors can save a UPI ID only when its handle is an active row here.
 * Common handles are seeded on first use; manage the list as PSPs change.
 */
export default function UpiHandlesPage() {
  return (
    <SimpleMaster
      kind="upi-handles"
      title="UPI Handles"
      sub="Allowed UPI handles (after '@', e.g. okaxis, ybl). A UPI ID is accepted on profiles only when its handle is active here."
      renderExtra={() => null}
      /* Column header was missing on this page — the cell shipped without a
         matching <th>, so the "example@handle" preview rendered under the
         Status heading. `extraLabel` restores the pair. */
      extraLabel="Preview"
      extraCell={(r) => <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>name@{r.name}</span>}
    />
  );
}
