'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useScrollSpy, scrollToSection, keepChipInView } from '@/lib/useScrollSpy';

export interface FaqGroup {
  id: string;
  title: string;
  items: {
    q: string;
    a: React.ReactNode;
    /** plain text of `a`, for search */
    t: string;
    /** search-only synonyms — the words people actually type but the answer
     *  never happens to use ("refund" for the ASBA unblock answer). Never
     *  displayed, so adding them cannot change approved wording. */
    k?: string;
  }[];
}

/**
 * Help & FAQs, grouped.
 *
 * Eleven questions in one flat accordion gave no sense of what was covered; the
 * sections make the scope visible at a glance and let someone jump straight to
 * their situation. Search matches the question AND the answer, which is why
 * every item carries a plain-text copy of its answer — the answers contain JSX
 * (links), so they can't be searched directly.
 */
export function FaqBrowser({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;
  const [active, setActive] = useScrollSpy(useMemo(() => groups.map((g) => g.id), [groups]), !searching);

  const shownGroups = useMemo(() => {
    if (!searching) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          `${i.q} ${i.t} ${i.k ?? ''} ${g.title}`.toLowerCase().includes(needle)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, needle, searching]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);
  const shown = shownGroups.reduce((n, g) => n + g.items.length, 0);

  useEffect(() => {
    keepChipInView(barRef.current?.querySelector<HTMLElement>('.gl-chips') ?? null, active);
  }, [active]);

  return (
    <>
      <div className="gl-bar" ref={barRef}>
        <div className="gl-search">
          <Icon name="search" size={16} />
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help — UPI mandate, family, allotment, refund…"
            aria-label="Search the FAQs"
          />
          {q && (
            <button type="button" className="gl-clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <div className="gl-chips">
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              data-chip={g.id}
              className={`gl-chip${!searching && active === g.id ? ' on' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setActive(g.id);
                if (searching) { setQ(''); setTimeout(() => scrollToSection(g.id, barRef.current), 60); }
                else scrollToSection(g.id, barRef.current);
              }}
            >
              {g.title}
            </a>
          ))}
        </div>
      </div>

      {searching && (
        <p className="gl-count">
          {shown === 0
            ? <>Nothing matches “{q}”. Try a shorter word — or <button type="button" className="linklike" onClick={() => setQ('')}>see all {total} questions</button>.</>
            : <>Showing <b>{shown}</b> of {total} questions for “{q}”.</>}
        </p>
      )}

      {shownGroups.map((g, gi) => (
        <section key={g.id} id={g.id} className="gl-sec faq-sec">
          <h2>{g.title}<span className="n">{g.items.length}</span></h2>
          <div className="faq-acc">
            {g.items.map((f, i) => (
              // open the very first answer so the page never reads as a wall of
              // closed rows; while searching every match opens
              <details key={f.q} open={searching || (gi === 0 && i === 0)}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
