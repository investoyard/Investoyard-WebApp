'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY } from '@investoyard/shared-types';
import { Icon } from '@/components/Icon';
import { useScrollSpy, scrollToSection, keepChipInView } from '@/lib/useScrollSpy';

const SECTION_IDS = GLOSSARY.map((s) => s.id);

/**
 * Glossary browser — 58 terms across 9 sections.
 *
 * Content stays in packages/shared-types (ONE source, shared with mobile); this
 * is only the reading surface. Two things the plain list lacked: the section
 * chips scrolled away the moment you started reading, and there was no way to
 * find a term without scanning. The filter bar is sticky and carries a search,
 * and the active chip follows the section you are actually in.
 */
export function GlossaryBrowser() {
  const [q, setQ] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;
  // frozen while searching, when only a subset of sections is on screen
  const [active, setActive] = useScrollSpy(SECTION_IDS, !searching);

  // Filter within each section so the reader keeps the grouping while searching;
  // sections that match nothing drop out entirely rather than showing a heading
  // with no terms under it.
  const sections = useMemo(() => {
    if (!searching) return GLOSSARY.map((s) => ({ ...s, terms: s.terms as [string, string][] }));
    return GLOSSARY
      .map((s) => ({
        ...s,
        terms: (s.terms as [string, string][]).filter(
          ([t, d]) => t.toLowerCase().includes(needle) || d.toLowerCase().includes(needle),
        ),
      }))
      .filter((s) => s.terms.length > 0);
  }, [needle, searching]);

  const total = useMemo(() => GLOSSARY.reduce((n, s) => n + s.terms.length, 0), []);
  const shown = sections.reduce((n, s) => n + s.terms.length, 0);

  // keep the active chip scrolled into view in its own strip
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
            placeholder="Search a term — ASBA, cut-off price, basis of allotment…"
            aria-label="Search the glossary"
          />
          {q && (
            <button type="button" className="gl-clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <div className="gl-chips" role="tablist" aria-label="Glossary sections">
          {GLOSSARY.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-chip={s.id}
              className={`gl-chip${!searching && active === s.id ? ' on' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                // a search may be filtering sections out — clear it, then jump
                // once the full list has rendered again
                setActive(s.id);
                if (searching) { setQ(''); setTimeout(() => scrollToSection(s.id, barRef.current), 60); }
                else scrollToSection(s.id, barRef.current);
              }}
            >
              {s.title}
            </a>
          ))}
        </div>
      </div>

      {searching && (
        <p className="gl-count">
          {shown === 0
            ? <>No term matches “{q}”. Try a shorter word — or <button type="button" className="linklike" onClick={() => setQ('')}>browse all {total}</button>.</>
            : <>Showing <b>{shown}</b> of {total} terms for “{q}”.</>}
        </p>
      )}

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="gl-sec">
          <h2>{s.title}<span className="n">{s.terms.length}</span></h2>
          <dl className="gl-list">
            {s.terms.map(([term, def]) => (
              <div className="gl-item" key={term}>
                <dt>{term}</dt>
                <dd>{def}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
