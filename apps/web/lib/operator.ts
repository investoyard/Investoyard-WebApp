'use client';
/** Operator (superadmin / partner / branch) auth — real username+password login. */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const KEY = 'iy_operator_token';

export function getOperatorToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function setToken(t: string) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } }
export function clearOperator() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export async function operatorLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${API}/auth/operator/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || 'Invalid username or password');
  }
  const d = await res.json();
  setToken(d.accessToken);
}

export interface OperatorMe {
  id: string; username: string; name: string; email?: string;
  isSuperAdmin: boolean; permissions: string[];
  homeTenant: { slug: string; name: string; type: string };
  memberships: { tenantSlug: string; tenantName: string; tenantType: string; role: string; scope: string; permissions: string[] }[];
}

export async function fetchMe(): Promise<OperatorMe | null> {
  const t = getOperatorToken();
  if (!t) return null;
  const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) { if (res.status === 401) clearOperator(); return null; }
  return res.json();
}

/** Does this operator hold a permission? Superadmin ('*' / scope all) holds everything. */
export function operatorCan(me: OperatorMe | null | undefined, perm: string): boolean {
  if (!me) return false;
  return me.isSuperAdmin || me.permissions.includes('*') || me.permissions.includes(perm);
}
