import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { ClientSession, Model, Types } from 'mongoose';
import { newOpaqueToken, sha256 } from '../../common/auth/tokens';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { MailService } from '../../common/mail/mail.service';
import { Role } from '../../common/rbac/roles';
import { OrgUser } from '../organization/schemas/org-user.schema';
import {
  Organization,
  OrgStatus,
} from '../organization/schemas/organization.schema';
import { AuthToken, AuthTokenType } from './schemas/auth-token.schema';
import { Session } from './schemas/session.schema';
import { User, UserDocument, UserStatus } from './schemas/user.schema';

const BCRYPT_COST = 12;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;
const LINK_TTL_HOURS: Record<AuthTokenType, number> = {
  [AuthTokenType.SET_PASSWORD]: 72,
  [AuthTokenType.RESET_PASSWORD]: 1,
};
/** A refresh token replayed within this window is a double-submit from the same browser, not theft. */
const REUSE_GRACE_MS = 10_000;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: Role;
  organizationId?: string;
  user: { id: string; email: string; fullName: string };
}

interface Context {
  role: Role;
  organizationId?: Types.ObjectId;
}

const invalid = () =>
  new AppError('UNAUTHENTICATED', 'Invalid login or password');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Compared against when the e-mail is unknown, so response time does not reveal which e-mails exist. */
  private readonly dummyHash = bcrypt.hashSync(
    'not-a-real-password',
    BCRYPT_COST,
  );

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(AuthToken.name) private readonly tokens: Model<AuthToken>,
    @InjectModel(OrgUser.name) private readonly orgUsers: Model<OrgUser>,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  hashPassword(password: string) {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  /** Login is by e-mail only. */
  private findByEmail(email: string) {
    return this.users.findOne({ email: email.trim().toLowerCase() });
  }

  async login(
    email: string,
    password: string,
    organizationId?: string,
    ip?: string,
  ): Promise<LoginResult> {
    const user = await this.findByEmail(email);
    // Compared even for an unknown login, so timing does not reveal which logins exist.
    const ok = await bcrypt.compare(
      password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !ok || !user.isActive || user.status !== UserStatus.ACTIVE)
      throw invalid();

    const ctx = await this.resolveContext(user, organizationId);
    if (!ctx) throw invalid();
    const result = await this.startSession(user, ctx);
    await this.audit.record({
      actor: {
        userId: result.user.id,
        role: ctx.role,
        organizationId: result.organizationId,
      },
      action: 'LOGIN',
      entityType: 'User',
      entityId: result.user.id,
      ip,
    });
    return result;
  }

  /** Rotates the refresh token. A token that was already rotated away means it leaked: kill the session. */
  async refresh(refreshToken: string | undefined): Promise<LoginResult> {
    if (!refreshToken) throw new AppError('UNAUTHENTICATED', 'Login required');
    const hash = sha256(refreshToken);
    const next = newOpaqueToken();
    const now = new Date();

    const session = await this.sessions.findOneAndUpdate(
      {
        refreshTokenHash: hash,
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      },
      { $set: { refreshTokenHash: next.hash, previousRefreshTokenHash: hash } },
      { new: true },
    );
    if (!session) {
      await this.sessions.updateOne(
        {
          previousRefreshTokenHash: hash,
          revokedAt: { $exists: false },
          updatedAt: { $lt: new Date(now.getTime() - REUSE_GRACE_MS) },
        },
        { $set: { revokedAt: now } },
      );
      throw new AppError('UNAUTHENTICATED', 'Session expired');
    }

    const user = await this.users.findById(session.userId);
    const ctx = user?.isActive
      ? await this.resolveContext(user, session.organizationId?.toString())
      : null;
    if (!user || !ctx) {
      await this.sessions.updateOne(
        { _id: session._id },
        { $set: { revokedAt: now } },
      );
      throw new AppError('UNAUTHENTICATED', 'Session expired');
    }
    return this.issue(user, ctx, session._id, next.token);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.sessions.updateOne(
      { refreshTokenHash: sha256(refreshToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }

  async changePassword(
    userId: string,
    sessionId: string,
    current: string,
    next: string,
  ) {
    const user = await this.users.findById(userId);
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(current, user.passwordHash))
    ) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect');
    }
    user.passwordHash = await this.hashPassword(next);
    await user.save();
    await this.revokeSessions(user._id, new Types.ObjectId(sessionId));
    await this.audit.record({
      actor: { userId },
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    });
  }

  /** Always succeeds from the caller's view, so it cannot be used to find out which logins exist.
   *  The reset link goes to the account's e-mail. */
  async forgotPassword(email: string) {
    const user = await this.findByEmail(email);
    if (!user?.isActive || user.status !== UserStatus.ACTIVE) return;
    await this.sendLink(user, AuthTokenType.RESET_PASSWORD);
  }

  /** Redeems an invite or reset link (single use) and sets the password. */
  async setPassword(token: string, password: string, type: AuthTokenType) {
    const now = new Date();
    const record = await this.tokens.findOneAndUpdate(
      {
        tokenHash: sha256(token),
        type,
        usedAt: { $exists: false },
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
    );
    if (!record)
      throw new AppError(
        'VALIDATION_ERROR',
        'This link is invalid or has expired',
      );

    const user = await this.users.findById(record.userId);
    if (!user?.isActive)
      throw new AppError(
        'VALIDATION_ERROR',
        'This link is invalid or has expired',
      );
    user.passwordHash = await this.hashPassword(password);
    user.status = UserStatus.ACTIVE;
    await user.save();
    await this.revokeSessions(user._id);
    await this.audit.record({
      actor: { userId: user.id as string },
      action:
        type === AuthTokenType.SET_PASSWORD ? 'PASSWORD_SET' : 'PASSWORD_RESET',
      entityType: 'User',
      entityId: user.id as string,
    });
  }

  /**
   * Creates a single-use link token and returns the link. No e-mail is sent here, so this can run
   * inside a transaction (pass its session); send the mail with `mailLink` after the commit.
   */
  async issueLink(
    user: UserDocument,
    type: AuthTokenType,
    session?: ClientSession,
  ) {
    const { token, hash } = newOpaqueToken();
    const expiresAt = new Date(Date.now() + LINK_TTL_HOURS[type] * 3600 * 1000);
    await this.tokens.create(
      [{ userId: user._id, type, tokenHash: hash, expiresAt }],
      { session },
    );
    const path =
      type === AuthTokenType.SET_PASSWORD ? 'set-password' : 'reset-password';
    const link = `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/${path}?token=${token}`;
    return { link, expiresAt };
  }

  /** Marks every unused link of this type for the user as used (e.g. before issuing a fresh invite). */
  async invalidateLinks(userId: Types.ObjectId, type: AuthTokenType) {
    await this.tokens.updateMany(
      { userId, type, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
    );
  }

  async mailLink(user: UserDocument, type: AuthTokenType, link: string) {
    const subject =
      type === AuthTokenType.SET_PASSWORD
        ? 'Set your password'
        : 'Reset your password';
    try {
      await this.mail.send({
        to: user.email,
        subject,
        text: `${subject}: ${link}

This link works once and expires in ${LINK_TTL_HOURS[type]} hour(s).`,
      });
    } catch (e) {
      // Do not reveal mail problems to the caller; the link can be re-issued.
      this.logger.error(`Could not send ${type} mail: ${(e as Error).message}`);
    }
  }

  /** Creates a link token and e-mails it. */
  async sendLink(user: UserDocument, type: AuthTokenType) {
    const { link } = await this.issueLink(user, type);
    await this.mailLink(user, type, link);
    return link;
  }

  revokeSessions(userId: Types.ObjectId, except?: Types.ObjectId) {
    return this.sessions.updateMany(
      {
        userId,
        revokedAt: { $exists: false },
        ...(except && { _id: { $ne: except } }),
      },
      { $set: { revokedAt: new Date() } },
    );
  }

  /** Which tenant and role a session is for. Null means this user may not log in. */
  private async resolveContext(
    user: UserDocument,
    organizationId?: string,
  ): Promise<Context | null> {
    if (user.isPlatformAdmin) return { role: Role.SUPER_ADMIN };

    const memberships = await this.orgUsers
      .find({
        userId: user._id,
        isActive: true,
        ...(organizationId && {
          organizationId: new Types.ObjectId(organizationId),
        }),
      })
      .sort({ createdAt: 1 });

    for (const m of memberships) {
      const org = await this.orgs.findById(m.organizationId);
      if (org && org.status !== OrgStatus.OFFBOARDED) {
        return { role: m.role, organizationId: m.organizationId };
      }
    }
    return null;
  }

  private async startSession(
    user: UserDocument,
    ctx: Context,
  ): Promise<LoginResult> {
    const refresh = newOpaqueToken();
    const session = await this.sessions.create({
      userId: user._id,
      organizationId: ctx.organizationId,
      refreshTokenHash: refresh.hash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return this.issue(user, ctx, session._id, refresh.token);
  }

  private async issue(
    user: UserDocument,
    ctx: Context,
    sessionId: Types.ObjectId,
    refreshToken: string,
  ): Promise<LoginResult> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id as string,
        sid: sessionId.toString(),
        role: ctx.role,
        orgId: ctx.organizationId?.toString(),
      },
      { expiresIn: ACCESS_TTL_SECONDS },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      role: ctx.role,
      organizationId: ctx.organizationId?.toString(),
      user: {
        id: user.id as string,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }
}
