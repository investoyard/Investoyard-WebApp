'use client';
import { createContext, useContext } from 'react';
import type { OperatorMe } from './operator';

/** The signed-in operator (from /auth/me), provided by the admin layout. */
export const OperatorContext = createContext<OperatorMe | null>(null);
export function useOperator(): OperatorMe | null {
  return useContext(OperatorContext);
}
