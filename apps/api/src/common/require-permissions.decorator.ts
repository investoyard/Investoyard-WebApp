import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';
export const ANY_PERMISSIONS_KEY = 'required_any_permissions';

/**
 * Require ALL of these permissions on a route. Enforced by PermissionsGuard,
 * which resolves the caller's memberships → roles and checks tenant-tree scope
 * against the `:slug` route param (when present).
 */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

/**
 * Require ANY ONE of these permissions on a route — used where a single
 * controller serves many resources via a `:kind`-style route param (e.g.
 * masters/:kind CRUD hits Registrars, Lead Managers … through one handler,
 * so no single perm gates it). A caller who holds at least one passes; the
 * handler can then narrow further based on the request payload.
 */
export const RequireAnyPermission = (...perms: string[]) => SetMetadata(ANY_PERMISSIONS_KEY, perms);
