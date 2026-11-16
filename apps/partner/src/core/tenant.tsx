'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PartnerIdentity } from './tenant.server';

/*
 * The partner identity, as the pre-paint script resolved it.
 *
 * It is null on the server render AND on the first client render — the two
 * must match or React discards the server tree — and is filled by an effect a
 * tick later. Components therefore render a placeholder for the name while it
 * is null, never a guess: on a partner's domain a guessed name is a statement
 * about the wrong company.
 */
const Ctx = createContext<PartnerIdentity | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [partner, setPartner] = useState<PartnerIdentity | null>(null);
  useEffect(() => {
    const p = (window as unknown as { __PARTNER__?: PartnerIdentity }).__PARTNER__;
    if (p) {
      setPartner(p);
      if (!document.title.includes(p.name)) document.title = `${document.title} · ${p.name}`;
    }
  }, []);
  return <Ctx.Provider value={partner}>{children}</Ctx.Provider>;
}

export const usePartner = () => useContext(Ctx);

/** The partner's monogram letter, or nothing until resolved. */
export const initialOf = (p: PartnerIdentity | null) => (p ? p.name.trim().charAt(0).toUpperCase() : '');
