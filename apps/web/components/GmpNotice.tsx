'use client';
import { useEffect, useState } from 'react';
import { getConsumerToken, grantConsent } from '@/lib/consumer-api';

/**
 * DAILY GMP awareness dialog (compliance): shown on the first screen carrying
 * grey-market figures each day. Acceptance is stored locally and, when signed
 * in, recorded as a 'gmp_disclaimer' consent (gmp-v2).
 *
 * Daily rather than once-ever by the operator's decision, and it is the safer
 * reading: GMP is unofficial and unregulated, so a disclaimer someone clicked
 * through months ago is thin protection. The stored value is the DATE of the
 * last acceptance, not a flag — one key that gets overwritten, rather than a
 * new key every day quietly filling localStorage.
 *
 * Original Investoyard wording (operator-approved).
 */
const VERSION = 'gmp-v2';
const KEY = `iy.gmpConsent.${VERSION}`;

/** local YYYY-MM-DD — a day boundary the reader would recognise, not UTC's */
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function GmpNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // read in an effect, never in render: the date makes this non-deterministic
    // and it would mismatch the statically exported HTML on hydration
    try { if (localStorage.getItem(KEY) !== today()) setShow(true); } catch { setShow(true); }
  }, []);

  if (!show) return null;

  const accept = () => {
    try { localStorage.setItem(KEY, today()); } catch { /* private mode — this session only */ }
    // every acknowledgement is recorded, not just the first: for a disclaimer
    // the evidence that matters is that they re-accepted TODAY
    if (getConsumerToken()) grantConsent('gmp_disclaimer', VERSION).catch(() => { /* local consent stands */ });
    setShow(false);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="GMP awareness">
      <div className="modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>⚠️ Before you view GMP figures</h3>
        </div>
        <div className="modal-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
            <li>Grey Market Premium (GMP) is an informal, unofficial number from the grey market — it is <b>not</b> published or endorsed by SEBI, the exchanges, or Investoyard.</li>
            <li>We show GMP for information only, collected from public sources. We may not update every IPO in real time and cannot verify accuracy — confirm precise figures with your broker.</li>
            <li>GMP is sentiment, not science: it can swing sharply near close, often reflects very few trades, and can fall further after listing.</li>
            <li>It is <b>not</b> a prediction of the listing price or allotment, and <b>not</b> investment advice or a recommendation from Investoyard.</li>
            <li>Investoyard informs and distributes — we are not SEBI-registered investment advisers and are not part of any grey market. Decide on fundamentals, the offer documents and your own judgment, or consult a registered adviser.</li>
            <li>No one — including Investoyard — accepts liability for decisions or losses based on GMP.</li>
          </ul>
          <button className="btn btn-block btn-lg" style={{ marginTop: 18 }} onClick={accept}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
