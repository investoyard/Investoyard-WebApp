'use client';
import { useEffect, useState } from 'react';
import { getConsumerToken, grantConsent } from '@/lib/consumer-api';

/**
 * One-time GMP awareness dialog (compliance): shown the first time a visitor
 * opens a screen that displays grey-market figures. Acceptance is stored
 * locally and, when signed in, recorded as a 'gmp_disclaimer' consent (gmp-v2).
 * Original Investoyard wording (operator-approved).
 */
const VERSION = 'gmp-v2';
const KEY = `iy.gmpConsent.${VERSION}`;

export function GmpNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch { /* ignore */ }
  }, []);

  if (!show) return null;

  const accept = () => {
    try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* ignore */ }
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
