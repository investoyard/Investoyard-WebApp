'use client';
import { useState } from 'react';
import { Modal } from './Modal';
import { Icon } from '@/components/Icon';

export interface ConfirmState {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

/** Confirmation dialog for destructive / important actions. Self-manages its busy state. */
export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await state.onConfirm(); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal title={state.title} onClose={onClose}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: -2 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: state.danger ? 'var(--neg-soft)' : 'var(--brand-50)', color: state.danger ? 'var(--neg)' : 'var(--brand)' }}>
          <Icon name={state.danger ? 'trash' : 'shield'} size={19} />
        </span>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{state.message}</p>
      </div>
      <div className="form-actions" style={{ marginTop: 22 }}>
        <button className={`btn${state.danger ? ' btn-danger' : ''}`} disabled={busy} onClick={go}>{busy ? 'Working…' : (state.confirmLabel ?? 'Confirm')}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
