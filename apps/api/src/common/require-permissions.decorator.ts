import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Require one or more permissions on a route. Enforced by PermissionsGuard, which
 * resolves the caller's memberships → roles and checks tenant-tree scope against
 * the `:slug` route param (when present).
 */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
