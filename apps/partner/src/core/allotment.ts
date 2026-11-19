'use client';

import { useState } from 'react';

/*
 * The registrar-file allotment lookup, shared by every variant so the rules
 * live once: PAN validation, the API call, and the wording of every failure.
 * A variant only decides how the form and the answer LOOK.
 *
 * It answers any applicant, wherever they applied, once the registrar has
 * published — the same endpoint investoyard.com uses. The transport's own
 * error text never reaches the investor.
 */

export type AllotmentChoice = { id: string; name: string; date: string };
export type AllotmentResult = { applicant: string; category: string; lots: number; status: 'allotted' | 'not_allotted' | 'processing' | 'pending'; allottedShares: number | null };
export type AllotmentCheck = { ipo: { symbol: string; name: string; allotmentDate: string | null }; allotmentOut: boolean; found: boolean; results: AllotmentResult[] };

import { API } from './api';
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function useAllotmentCheck(choices: AllotmentChoice[]) {
  const [ipoId, setIpoId] = useState(choices[0]?.id || '');
  const [pan, setPanRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AllotmentCheck | null>(null);

  const setPan = (v: string) => setPanRaw(v.toUpperCase().replace(/\s+/g, ''));

  async function submit() {
    const p = pan.trim().toUpperCase();
    setResult(null);
    if (!PAN_PATTERN.test(p)) { setError('A PAN is ten characters: five letters, four digits, then a letter.'); return; }
    if (!ipoId) { setError('Choose the IPO you applied for.'); return; }
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${API}/allotment/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ipoId, pan: p }) });
      if (!r.ok) {
        let msg = 'The registrar lookup did not answer. Try again in a moment.';
        try { const b = await r.json(); if (b && typeof b.message === 'string') msg = b.message; } catch { /* keep ours */ }
        setError(msg);
      } else {
        setResult((await r.json()) as AllotmentCheck);
      }
    } catch {
      setError('Could not reach the allotment service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return { ipoId, setIpoId, pan, setPan, busy, error, result, submit };
}

/** One sentence per outcome, so every variant says the same true thing. */
export function outcomeText(r: AllotmentCheck): { title: string; body: string; tone: 'open' | 'closed' | 'upcoming' }[] {
  if (!r.found) {
    return [{
      title: r.allotmentOut ? 'No application found' : 'Not published yet',
      body: r.allotmentOut
        ? `The registrar’s file for ${r.ipo.name} has no application under this PAN.`
        : `The registrar has not published the basis of allotment for ${r.ipo.name} yet. Try again on allotment day.`,
      tone: 'upcoming',
    }];
  }
  return r.results.map((x) => {
    const yes = x.status === 'allotted';
    return {
      title: yes ? `Allotted${x.allottedShares ? ` · ${x.allottedShares.toLocaleString('en-IN')} shares` : ''}` : x.status === 'not_allotted' ? 'Not allotted' : 'Being processed',
      body: `${x.applicant} · ${x.category}${x.lots ? ` · applied for ${x.lots} lot${x.lots === 1 ? '' : 's'}` : ''}. ${yes ? 'Shares are credited to the demat on the application before listing day.' : x.status === 'not_allotted' ? 'The UPI block is released by your bank. Nothing is debited.' : 'The registrar is still processing this application.'}`,
      tone: yes ? 'open' : 'closed',
    };
  });
}
