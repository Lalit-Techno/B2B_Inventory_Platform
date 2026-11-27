import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error';
import {
  AUTHORIZE_KEY,
  LIMITED_KEY,
  PUBLIC_KEY,
} from '../rbac/authorize.decorator';
import { isAllowed, PermissionId } from '../rbac/permissions';
import type { Principal } from './principal';

/** Deny by default: a route needs @Public() or @Authorize(id), and the caller's role must hold that permission. */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger('Permission');

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets))
      return true;

    const id = this.reflector.getAllAndOverride<PermissionId>(
      AUTHORIZE_KEY,
      targets,
    );
    const user = ctx.switchToHttp().getRequest<{ user?: Principal }>().user;
    if (!id || !user) {
      this.logger.error(
        `Route has no permission id: ${ctx.getClass().name}.${ctx.getHandler().name}`,
      );
      throw new AppError('FORBIDDEN', 'Not allowed');
    }
    const limitedOk =
      this.reflector.getAllAndOverride<boolean>(LIMITED_KEY, targets) === true;
    if (!isAllowed(id, user.role, user.connectionState, limitedOk)) {
      throw new AppError('FORBIDDEN', 'Not allowed');
    }
    return true;
  }
}
