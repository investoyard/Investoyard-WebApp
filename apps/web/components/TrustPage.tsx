'use client';
import { useEffect, useState } from 'react';
import { cleanRichKeepLinks, PAGE_LABEL, type TenantPageKey } from '@investoyard/shared-types';
import { useTenant, useTenantResolved } from '@/components/TenantProvider';
import { fetchTenantPage, tenantDisplayName } from '@/lib/tenants';

/**
 * A trust page — About, Terms, Privacy Policy, Disclaimer — rendered for
 * whichever channel the domain resolves to.
 *
 * THE ONE RULE, AND THE REASON THIS COMPONENT EXISTS: A WHITE-LABEL NEVER
 * INHERITS OUR LEGAL PAGES. `children` is OUR copy, written for the Investoyard
 * Direct channel, and it belongs to that channel alone. A partner gets their
 * own published page or an explicit "not published yet" — never ours.
 *
 * Falling back is the tempting choice because it keeps every partner site
 * looking finished. It would also mean serving OUR Terms, under THEIR brand, to
 * THEIR clients: a contract naming the wrong company, offered to people who
 * never dealt with us. A missing page is a visible gap someone fixes; a wrong
 * one is a liability nobody notices. The three legal pages are BLOCKING in the
 * admin gap list for the same reason.
 *
 * ── WHY `children` IS RENDERED ON THE SERVER AND THEN REPLACED ────────────
 *
 * The first cut gated the whole page on `useTenantResolved()`, so nothing was
 * emitted until a client fetch of the tenant registry came back. That was
 * measurably wrong for our OWN site: the built HTML for /terms carried **31
 * characters of markup** — the heading and nothing else — with the entire
 * document sitting only inside Next's RSC script payload. View-source showed
 * an empty legal page.
 *
 * So the server renders our copy, inside `[data-own-only]`, and the FIRST
 * client render matches it exactly (otherwise React reports a hydration
 * mismatch). A partner host swaps it out in an effect.
 *
 * What stops a partner's visitor seeing our Terms in the gap before React
 * hydrates is NOT this component — it is the inline script in the root layout,
 * which compares `location.hostname` against the build-time site host and hides
 * `[data-own-only]` before the browser paints. That check needs no network, so
 * it can run earlier than anything React does.
 */
export function TrustPage({
  pageKey,
  heading,
  lede,
  children,
}: {
  pageKey: TenantPageKey;
  /** Our own heading. A partner's page supplies its own structure in the HTML. */
  heading: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const tenant = useTenant();
  const resolved = useTenantResolved();
  const own = !!tenant.isDefault;
  const name = tenantDisplayName(tenant);

  const [html, setHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    /* Our own channel renders the baked copy and needs no request. */
    if (!resolved || own) return;
    let live = true;
    (async () => {
      const got = await fetchTenantPage(tenant.slug, pageKey);
      if (!live) return;
      setHtml(got);
      setLoaded(true);
    })();
    return () => { live = false; };
  }, [resolved, own, tenant.slug, pageKey]);

  /*
   * THE SERVER RENDER, AND THE FIRST CLIENT RENDER, ARE THIS. Everything below
   * only replaces it once the host is known to be a partner's — which keeps
   * hydration consistent and keeps our own copy in the crawlable markup.
   */
  const ours = (
    <div className="trust-page">
      <h1>{heading}</h1>
      <div data-own-only="">
        {lede ? <p className="lead-p">{lede}</p> : null}
        {children}
      </div>
    </div>
  );

  if (!resolved || own) return ours;

  /* A partner, still fetching. Our copy is already hidden by the inline script,
     so showing the heading alone is honest — the not-published state would
     accuse an operator who HAS published. */
  if (!loaded) return <div className="trust-page"><h1>{heading}</h1></div>;

  const clean = cleanRichKeepLinks(html);
  if (!clean.replace(/<[^>]*>/g, '').trim()) {
    return (
      <div className="trust-page">
        <h1>{heading}</h1>
        <div className="prose">
          <p className="tp-unpublished">
            {name} has not published {PAGE_LABEL[pageKey]} yet.
          </p>
          <p>
            For a question about an IPO application, allotment or refund, see{' '}
            <a href="/contact">Contact</a>. A market complaint can always be escalated to{' '}
            <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="trust-page">
      <h1>{heading}</h1>
      {/* Sanitised ON READ — this is injected with dangerouslySetInnerHTML, so
          it is a security boundary (29 tests in richText.spec.ts). The
          link-KEEPING mode, because a legal page's links are the point: ours
          carry SEBI SCORES and the ODR portal, and silently deleting a
          partner's link to their own grievance portal would be worse. */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}
