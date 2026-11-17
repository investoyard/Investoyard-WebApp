'use client';

import { useState } from 'react';

/*
 * Long company text, shown in full in the HTML (so it is indexable) but held
 * to a few lines with a fade until the reader asks for the rest. The class
 * toggle is the whole client part; the server render is the clamped state.
 */
export default function ReadMore({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`h-rm${open ? ' open' : ''}`}>
      <div className="h-prose h-rm-body" dangerouslySetInnerHTML={{ __html: html }} />
      <button type="button" className="h-link h-link-btn h-rm-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>
    </div>
  );
}
