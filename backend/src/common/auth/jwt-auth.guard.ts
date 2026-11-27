import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model, Types } from 'mongoose';
import { Session } from '../../modules/auth/schemas/session.schema';
import { AppError } from '../errors/app-error';
import { PUBLIC_KEY } from '../rbac/authorize.decorator';
import type { Role } from '../rbac/roles';
import type { Principal } from './principal';

interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
  orgId?: string;
}

/** Verifies the access token and that its session is still live (not revoked, not expired). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError('UNAUTHENTICATED', 'Login required');
    }

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Session expired');
    }

    const live = await this.sessions.exists({
      _id: new Types.ObjectId(claims.sid),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!live) throw new AppError('UNAUTHENTICATED', 'Session expired');

    req.user = {
      userId: claims.sub,
      sessionId: claims.sid,
      role: claims.role,
      organizationId: claims.orgId,
    };
    return true;
  }
}
