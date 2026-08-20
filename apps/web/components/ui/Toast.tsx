'use client';
import { useCallback, useRef, useState } from 'react';

export interface ToastMsg { id: number; text: string; tone: 'ok' | 'err' }

/** Small toast queue — `push('Saved', 'ok')`; each toast auto-dismisses after 3 s. */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  return { toasts, push };
}

/** Fixed bottom-right toast stack — render once per page next to the content. */
export function Toasts({ toasts }: { toasts: ToastMsg[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span className="toast-dot" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
