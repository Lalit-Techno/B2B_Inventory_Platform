import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error';
import { PUBLIC_KEY } from '../rbac/authorize.decorator';
import { Role } from '../rbac/roles';
import type { Principal } from '../auth/principal';

/**
 * Every non-platform session must carry its tenant (from the signed token, never from the request).
 * A tenant role without one is refused here, before any controller runs.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }
    const user = ctx.switchToHttp().getRequest<{ user?: Principal }>().user;
    if (user && user.role !== Role.SUPER_ADMIN && !user.organizationId) {
      throw new AppError('FORBIDDEN', 'Not allowed');
    }
    return true;
  }
}
