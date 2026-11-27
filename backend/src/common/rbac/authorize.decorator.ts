import { SetMetadata } from '@nestjs/common';
import type { PermissionId } from './permissions';

export const AUTHORIZE_KEY = 'rbac:permission';
export const PUBLIC_KEY = 'rbac:public';
export const LIMITED_KEY = 'rbac:limited';
export const ALLOW_INACTIVE_KEY = 'rbac:allow-inactive';

/** Every route needs exactly one of @Authorize(id) or @Public(). A route with neither is denied. */
export const Authorize = (id: PermissionId) => SetMetadata(AUTHORIZE_KEY, id);

/** No login required (login, refresh, password reset, health, public invite pages). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Marks a route whose SERVICE applies the restriction a limited (L) grant stands for, e.g. "own tenant only".
 * Without it, a role that only holds L on the permission is refused. Never put it on a /super route.
 */
export const Limited = () => SetMetadata(LIMITED_KEY, true);

/** Route stays usable when the tenant's subscription is EXPIRED / SUSPENDED / CANCELLED (profile, subscription view, sign-out...). */
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE_KEY, true);
