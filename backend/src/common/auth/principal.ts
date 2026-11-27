import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '../rbac/roles';

/** Who is calling. Built only from the verified access token + live session, never from the request body. */
export interface Principal {
  userId: string;
  sessionId: string;
  role: Role;
  /** Tenant the session is bound to (undefined for SUPER_ADMIN). */
  organizationId?: string;
  /** Buyer sessions only (Phase 3). */
  buyerId?: string;
  connectionState?: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest<{ user: Principal }>().user,
);
