"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirePermissions = exports.PERMISSIONS_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.PERMISSIONS_KEY = 'required_permissions';
/**
 * Require one or more permissions on a route. Enforced by PermissionsGuard, which
 * resolves the caller's memberships → roles and checks tenant-tree scope against
 * the `:slug` route param (when present).
 */
const RequirePermissions = (...perms) => (0, common_1.SetMetadata)(exports.PERMISSIONS_KEY, perms);
exports.RequirePermissions = RequirePermissions;
