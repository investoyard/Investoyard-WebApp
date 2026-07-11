'use client';

export function NoAccess() {
  return (
    <div className="empty">
      <div className="emoji">🔒</div>
      <h3>No permission</h3>
      <p className="muted">Your role doesn’t have access to this section.</p>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose} style={{ fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
