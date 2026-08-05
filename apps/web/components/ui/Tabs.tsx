'use client';
import { useState } from 'react';

export type Tab = { key: string; label: string; count?: number; content: React.ReactNode };

/** Underline tab bar (reference detail-page style). */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div className="tabs-wrap">{/* not "tabs" — that public class is flex-wrap and would put the panel beside the bar */}
      <div className="tabs-bar" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === active}
            className={`tab${t.key === active ? ' on' : ''}`} onClick={() => setActive(t.key)}>
            {t.label}{typeof t.count === 'number' && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="tabs-panel" role="tabpanel">{cur?.content}</div>
    </div>
  );
}
