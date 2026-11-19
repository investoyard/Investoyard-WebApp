'use client';

import Link from 'next/link';
import { LABEL } from '@investoyard/shared-types';
import { footerModel } from './footer';
import type { GmpRow } from './models';
import { usePartner } from './tenant';
import type { DesignUi } from './variant';
import './content.css';

/*
 * The two content pages that depend on WHICH partner is showing them. Both
 * wait for the partner to resolve (null on the server and first render), so
 * nothing is said about the wrong company even for a tick.
 */

/* ------------------------------------------------------------------- GMP */
/*
 * GATED ON THE PARTNER'S OWN gmp FLAG. A white-label has it off and locked by
 * default; with it off the page states that the figures are not published here
 * and shows none. With it on: neutral ink and an explicit sign (a premium is a
 * projection, not a realised gain), and the disclaimer that has to name the
 * thing for what it is.
 */
export function GmpBody({ rows, ui }: { rows: GmpRow[]; ui: DesignUi }) {
  const p = usePartner();
  if (!p) return <p className="pw-empty" aria-busy="true">Loading…</p>;
  if (!p.gmp) {
    return (
      <p className="pw-empty">
        {LABEL.gmpLong} figures are not published on this site. For an issue’s official figures — dates, price band and subscription — see <Link href="/" className="pw-link">current IPOs</Link>.
      </p>
    );
  }
  return (
    <>
      <p className="pw-warn" role="note">
        The {LABEL.gmpLong.toLowerCase()} is unofficial and unregulated. It is reported informally, cannot be verified, and is often wrong.
        It is shown for information only and is not a forecast of the listing price or a recommendation to apply.
      </p>
      {rows.length ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th scope="col">IPO</th><th scope="col">Dates</th><th scope="col" className="pw-r">Price band</th><th scope="col" className="pw-r">{LABEL.gmp} (₹/share)</th><th scope="col" className="pw-r">As % of price</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.card.sym}>
                  <td><Link href={r.card.href} className="pw-co">{r.card.name}</Link>{r.card.board === 'SME' ? <span className="pw-chip">SME</span> : null}</td>
                  <td className="pw-num">{r.card.dates}</td>
                  <td className="pw-num pw-r">{r.card.band}</td>
                  <td className="pw-num pw-r">{r.gmp}</td>
                  <td className="pw-num pw-r">{r.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="pw-empty">No current or upcoming IPO has a figure at the moment.</p>}
    </>
  );
}

/* --------------------------------------------------------------- contact */
/*
 * Only what the partner has entered, as on the footer — never our details.
 * The regulator's escalation routes are public and name nobody, so they are
 * always shown.
 */
export function ContactBody() {
  const p = usePartner();
  if (!p) return <p className="pw-empty" aria-busy="true">Loading…</p>;
  const f = footerModel(p);
  const any = f.support.length || f.grievance.length || f.address;
  return (
    <div className="pw-contact">
      {any ? (
        <div className="pw-contact-grid">
          {f.support.length ? (
            <section><h2>Support</h2>{f.support.map((s) => <p key={s.k}><span>{s.k}</span><a href={s.href}>{s.v}</a></p>)}</section>
          ) : null}
          {f.grievance.length ? (
            <section><h2>Grievance officer</h2>{f.grievance.map((g) => <p key={g.k}><span>{g.k}</span>{g.href ? <a href={g.href}>{g.v}</a> : <b>{g.v}</b>}</p>)}</section>
          ) : null}
          {f.address || f.legalName || f.registration.length ? (
            <section>
              <h2>Registered office</h2>
              {f.legalName ? <p><b>{f.legalName}</b></p> : null}
              {f.address ? <p>{f.address}</p> : null}
              {f.registration.map((r) => <p key={r.k}><span>{r.k}</span><b className="pw-num">{r.v}</b></p>)}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="pw-empty">{p.name} has not published its contact details yet.</p>
      )}
      <section className="pw-escalate">
        <h2>If your complaint is not resolved</h2>
        <p>
          Market-related complaints can be escalated to SEBI on <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a>,
          and disputes taken to the <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">Online Dispute Resolution portal</a>.
        </p>
      </section>
    </div>
  );
}
