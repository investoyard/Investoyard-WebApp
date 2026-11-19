'use client';

import { useCallback, useEffect, useState } from 'react';
import { cleanRichKeepLinks, hasPage, PAGE_LABEL, type TenantPageKey } from '@investoyard/shared-types';
import { API } from './api';
import { usePartner } from './tenant';
import './legal.css';

/*
 * THE PARTNER'S OWN LEGAL PAGES — About, Terms, Privacy, Disclaimer.
 *
 * THE IDENTITY RULE AGAIN: a partner never inherits ours. Their terms are a
 * contract between them and their clients, so a page they have not written
 * says so ("not published yet") and never falls back to our text.
 *
 * FETCHED IN THE BROWSER, NOT BAKED. One export serves every partner on a
 * design, and the page is written in admin; reading it at request time means a
 * partner's edit shows without a rebuild, and no partner's legal prose sits in
 * another partner's HTML. It is the same public endpoint investoyard.com's own
 * trust pages read.
 *
 * Stored HTML is operator-written, so it is sanitised ON READ with the same
 * allow-list sanitiser apps/web uses (links kept — a legal page's links to
 * SEBI SCORES or an ODR portal are the point).
 *
 * Variants own how the page LOOKS (their header, their frame); what it SAYS in
 * every state is decided here, once.
 */

/* How the empty state names the page in a sentence. "About us" lower-cased does not read as a noun. */
const NOUN: Record<TenantPageKey, string> = { about: 'About page', terms: 'terms and conditions', privacy: 'privacy policy', disclaimer: 'disclaimer' };

export const legalLabel = (key: TenantPageKey) => PAGE_LABEL[key];

/** One line under each page's heading, the same in every design. */
export const LEGAL_SUB: Readonly<Record<TenantPageKey, string>> = {
  about: 'Who runs this site, as published by them.',
  terms: 'The terms on which this site and its services are offered.',
  privacy: 'How personal information is collected, used and protected on this site.',
  disclaimer: 'What the information on this site is, and what it is not.',
};

type State = { status: 'loading' } | { status: 'ok'; html: string } | { status: 'empty' } | { status: 'error' };

export function useLegalPage(key: TenantPageKey) {
  const partner = usePartner();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!partner) return;
    let alive = true;
    setState({ status: 'loading' });
    fetch(`${API}/tenants/${encodeURIComponent(partner.slug)}/page/${key}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        /* Nest sends an EMPTY body for a null result; read as text so that is "not published", not an exception. */
        const text = await r.text();
        const body = text ? (JSON.parse(text) as { html?: string }) : null;
        const html = body && typeof body.html === 'string' ? body.html : '';
        if (!alive) return;
        setState(hasPage({ html }) ? { status: 'ok', html: cleanRichKeepLinks(html) } : { status: 'empty' });
      })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [partner, key, nonce]);

  return { partner, state, retry };
}

/** The page body in every state. `className` is the variant's own wrapper; prose styling comes from legal.css. */
export function LegalBody({ page, className }: { page: TenantPageKey; className?: string }) {
  const { partner, state, retry } = useLegalPage(page);
  const label = NOUN[page];
  if (!partner || state.status === 'loading') {
    return <div className={`pw-legal ${className || ''}`} aria-busy="true"><p className="pw-legal-note">Loading…</p></div>;
  }
  if (state.status === 'error') {
    return (
      <div className={`pw-legal ${className || ''}`} role="alert">
        <p className="pw-legal-note">This page could not be loaded. Check your connection and try again.</p>
        <button type="button" className="pw-legal-retry" onClick={retry}>Try again</button>
      </div>
    );
  }
  if (state.status === 'empty') {
    return (
      <div className={`pw-legal ${className || ''}`}>
        <p className="pw-legal-note">{partner.name} has not published its {label} yet.</p>
      </div>
    );
  }
  return <div className={`pw-legal pw-legal-prose ${className || ''}`} dangerouslySetInnerHTML={{ __html: state.html }} />;
}
