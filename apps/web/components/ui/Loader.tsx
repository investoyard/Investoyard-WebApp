'use client';

/** Branded loading indicator — the Investoyard mark inside a spinning ring. */
export function Loader({ full, label = 'Loading…' }: { full?: boolean; label?: string }) {
  return (
    <div className={full ? 'loader-full' : 'loader-inline'}>
      <div className="loader">
        <span className="loader-ring" />
        <img src="/icon.svg" alt="" className="loader-mark" />
      </div>
      {label && <div className="loader-txt">{label}</div>}
    </div>
  );
}
