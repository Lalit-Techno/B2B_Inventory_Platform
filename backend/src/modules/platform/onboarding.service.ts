import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import type { Principal } from '../../common/auth/principal';
import { cycleMonths, periodEnd } from '../../common/dates/calendar';
import { todayIST } from '../../common/dates/ist';
import { AppError } from '../../common/errors/app-error';
import { toDecimal128 } from '../../common/money/decimal128';
import { Role } from '../../common/rbac/roles';
import { AuthService } from '../auth/auth.service';
import { AuthTokenType } from '../auth/schemas/auth-token.schema';
import { User, UserDocument, UserStatus } from '../auth/schemas/user.schema';
import { OrgUser } from '../organization/schemas/org-user.schema';
import { Organization } from '../organization/schemas/organization.schema';
import { Warehouse } from '../organization/schemas/warehouse.schema';
import {
  OnboardOrganizationDto,
  RESERVED_SLUGS,
} from './dto/onboard-organization.dto';
import { SaasPlan } from './schemas/saas-plan.schema';
import { SaasSubscription } from './schemas/saas-subscription.schema';
import { evaluateStatus } from './subscription-status';

const DUPLICATE_MESSAGE: Record<string, string> = {
  slug: 'This slug is already taken',
  gstin: 'An organization with this GSTIN already exists',
  email: 'This e-mail already belongs to another account',
};

@Injectable()
export class OnboardingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SaasPlan.name) private readonly plans: Model<SaasPlan>,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(OrgUser.name) private readonly orgUsers: Model<OrgUser>,
    @InjectModel(SaasSubscription.name)
    private readonly subscriptions: Model<SaasSubscription>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the organization, its default warehouse, its subscription and its first ORG_ADMIN
   * in ONE transaction: either everything exists afterwards or nothing does.
   * The set-password e-mail is sent only after the commit.
   */
  async onboard(dto: OnboardOrganizationDto, actor: Principal, ip?: string) {
    if (RESERVED_SLUGS.has(dto.slug))
      throw new AppError('VALIDATION_ERROR', 'This slug is reserved');

    const plan = await this.plans.findOne({
      code: dto.subscription.planCode,
      isActive: true,
    });
    if (!plan)
      throw new AppError('VALIDATION_ERROR', 'Unknown or inactive plan');

    const startDate = dto.subscription.startDate ?? todayIST();
    const endDate = periodEnd(
      startDate,
      cycleMonths(dto.subscription.billingCycle),
    );

    const session = await this.connection.startSession();
    let result!: Awaited<ReturnType<OnboardingService['createAll']>>;
    try {
      // The callback may be re-run on a transient error, so everything it needs is created inside it.
      await session.withTransaction(async () => {
        result = await this.createAll(
          dto,
          plan,
          startDate,
          endDate,
          actor,
          ip,
          session,
        );
      });
    } catch (e) {
      throw this.translate(e);
    } finally {
      await session.endSession();
    }

    if (result.invite)
      await this.auth.mailLink(
        result.adminUser,
        AuthTokenType.SET_PASSWORD,
        result.invite.link,
      );

    return {
      organizationId: result.organizationId,
      slug: dto.slug,
      subscriptionId: result.subscriptionId,
      billingCycle: dto.subscription.billingCycle,
      startDate,
      endDate,
      adminUserId: result.adminUser.id as string,
      // The link is shown to the Super Admin to copy and share; it is also e-mailed.
      adminInviteLink: result.invite?.link ?? null,
      adminInviteExpiresAt: result.invite?.expiresAt ?? null,
      adminAlreadyHadAccount: !result.invite,
    };
  }

  private async createAll(
    dto: OnboardOrganizationDto,
    plan: SaasPlan & { _id: Types.ObjectId },
    startDate: string,
    endDate: string,
    actor: Principal,
    ip: string | undefined,
    session: ClientSession,
  ) {
    const [org] = await this.orgs.create(
      [
        {
          slug: dto.slug,
          legalName: dto.legalName,
          tradeName: dto.tradeName,
          gstin: dto.gstin, // the schema derives stateCode / PAN and checks the checksum
          email: dto.email,
          phone: dto.phone,
          address: dto.address as unknown as Record<string, string>,
          invoicePrefix: dto.invoicePrefix,
        },
      ],
      { session },
    );

    await this.warehouses.create(
      [{ organizationId: org._id, name: 'Main warehouse', isDefault: true }],
      { session },
    );

    // The first admin may already have an account (one person, several businesses).
    let adminUser: UserDocument | null = await this.users
      .findOne({ email: dto.adminUser.email })
      .session(session);
    if (adminUser?.isPlatformAdmin)
      throw new AppError(
        'VALIDATION_ERROR',
        'A platform admin cannot also be a tenant admin',
      );
    if (!adminUser) {
      [adminUser] = await this.users.create(
        [
          {
            email: dto.adminUser.email,
            fullName: dto.adminUser.fullName,
            phone: dto.adminUser.phone,
            status: UserStatus.INVITED,
          },
        ],
        { session },
      );
    }
    await this.orgUsers.create(
      [
        {
          organizationId: org._id,
          userId: adminUser._id,
          role: Role.ORG_ADMIN,
        },
      ],
      { session },
    );

    const [subscription] = await this.subscriptions.create(
      [
        {
          organizationId: org._id,
          planId: plan._id,
          billingCycle: dto.subscription.billingCycle,
          recurringAmount: toDecimal128(dto.subscription.recurringAmount),
          startDate,
          endDate,
          graceDays: plan.graceDays,
          // a start date in the past can already be in grace / expired
          status: evaluateStatus(todayIST(), endDate, plan.graceDays),
        },
      ],
      { session },
    );

    const invite =
      adminUser.status === UserStatus.INVITED
        ? await this.auth.issueLink(
            adminUser,
            AuthTokenType.SET_PASSWORD,
            session,
          )
        : null;

    await this.audit.record(
      {
        actor,
        organizationId: org.id as string,
        action: 'ORGANIZATION_ONBOARDED',
        entityType: 'Organization',
        entityId: org.id as string,
        after: {
          slug: org.slug,
          legalName: org.legalName,
          gstin: org.gstin,
          plan: plan.code,
          billingCycle: dto.subscription.billingCycle,
          recurringAmount: dto.subscription.recurringAmount,
          startDate,
          endDate,
          adminUserId: adminUser.id as string,
        },
        ip,
      },
      session,
    );

    return {
      organizationId: org.id as string,
      subscriptionId: subscription.id as string,
      adminUser,
      invite,
    };
  }

  /** Unique-index violations become a clear 409; everything else passes through. */
  private translate(e: unknown): unknown {
    const err = e as { code?: number; keyPattern?: Record<string, number> };
    if (err.code !== 11000) return e;
    const field = Object.keys(err.keyPattern ?? {})[0];
    return new AppError(
      'DUPLICATE',
      DUPLICATE_MESSAGE[field] ?? 'A record with these details already exists',
    );
  }
}
