import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery, Model } from 'mongoose';
import { Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import type { Principal } from '../../common/auth/principal';
import { todayIST } from '../../common/dates/ist';
import { AppError } from '../../common/errors/app-error';
import {
  afterCursor,
  DEFAULT_LIMIT,
  toPage,
} from '../../common/http/pagination';
import { fromDecimal128 } from '../../common/money/decimal128';
import { Role } from '../../common/rbac/roles';
import { escapeRegex } from '../../common/validation/escape-regex';
import { AuthService } from '../auth/auth.service';
import { AuthTokenType } from '../auth/schemas/auth-token.schema';
import { User, UserStatus } from '../auth/schemas/user.schema';
import { OrgUser } from '../organization/schemas/org-user.schema';
import {
  Organization,
  OrganizationDocument,
  OrgStatus,
} from '../organization/schemas/organization.schema';
import { OrganizationsQueryDto, SuspendDto } from './dto/billing.dto';
import { planView } from './plans.service';
import { SaasPlan } from './schemas/saas-plan.schema';
import {
  SaasSubscription,
  SubscriptionStatus,
} from './schemas/saas-subscription.schema';
import { evaluateStatus } from './subscription-status';

const subscriptionView = (s: SaasSubscription & { id?: unknown }) => ({
  id: String(s.id),
  status: s.status,
  billingCycle: s.billingCycle,
  recurringAmount: fromDecimal128(s.recurringAmount).toFixed(2),
  startDate: s.startDate,
  endDate: s.endDate,
  graceDays: s.graceDays,
});

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
    @InjectModel(SaasPlan.name) private readonly plans: Model<SaasPlan>,
    @InjectModel(OrgUser.name) private readonly orgUsers: Model<OrgUser>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(q: OrganizationsQueryDto) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const filter: FilterQuery<Organization> = {};
    const idRule: Record<string, unknown> = {
      ...(afterCursor(q.cursor)._id ?? {}),
    };
    if (q.status) filter.status = q.status;
    if (q.q) {
      const text = escapeRegex(q.q.trim());
      filter.$or = [
        { slug: new RegExp(text, 'i') },
        { legalName: new RegExp(text, 'i') },
        { tradeName: new RegExp(text, 'i') },
        { gstin: new RegExp(`^${text}`, 'i') },
      ];
    }
    if (q.subscriptionStatus) {
      idRule.$in = await this.subs.distinct('organizationId', {
        status: q.subscriptionStatus,
      });
    }
    if (Object.keys(idRule).length) filter._id = idRule;

    const rows = await this.orgs
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1);
    const page = toPage(rows, limit);
    const ids = page.data.map((o) => o._id);
    const subs = await this.subs.find({ organizationId: { $in: ids } });
    const plans = await this.plans.find({
      _id: { $in: subs.map((s) => s.planId) },
    });
    const subByOrg = new Map(subs.map((s) => [String(s.organizationId), s]));
    const planById = new Map(plans.map((p) => [String(p._id), p]));

    return {
      data: page.data.map((o) => {
        const sub = subByOrg.get(String(o._id));
        const plan = sub ? planById.get(String(sub.planId)) : undefined;
        return {
          ...this.summary(o),
          plan: plan ? { code: plan.code, name: plan.name } : null,
          subscription: sub ? subscriptionView(sub) : null,
        };
      }),
      meta: page.meta,
    };
  }

  /** Profile, plan, subscription and admins. Never any business data (products, orders, invoices...). */
  async detail(id: string) {
    const org = await this.find(id);
    const [sub, staffCount, admins] = await Promise.all([
      this.subs.findOne({ organizationId: org._id }),
      this.orgUsers.countDocuments({ organizationId: org._id, isActive: true }),
      this.orgUsers.find({ organizationId: org._id, role: Role.ORG_ADMIN }),
    ]);
    const plan = sub ? await this.plans.findById(sub.planId) : null;
    const adminUsers = await this.users.find({
      _id: { $in: admins.map((a) => a.userId) },
    });

    return {
      ...this.summary(org),
      pan: org.pan ?? null,
      stateCode: org.stateCode ?? null,
      email: org.email ?? null,
      phone: org.phone ?? null,
      address: org.address ?? null,
      invoicePrefix: org.invoicePrefix ?? null,
      plan: plan ? planView(plan) : null,
      subscription: sub ? subscriptionView(sub) : null,
      staffCount,
      admins: adminUsers.map((u) => ({
        userId: u.id as string,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone ?? null,
        status: u.status,
      })),
    };
  }

  /** Freezes the tenant: organization and subscription become SUSPENDED. Staff can still log in to see the freeze screen. */
  async suspend(id: string, dto: SuspendDto, actor: Principal, ip?: string) {
    const org = await this.find(id);
    if (org.status !== OrgStatus.ACTIVE) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Only an active organization can be suspended',
      );
    }
    const sub = await this.requireSubscription(org._id);
    await this.switchStatus(
      org,
      sub,
      OrgStatus.SUSPENDED,
      SubscriptionStatus.SUSPENDED,
      'ORGANIZATION_SUSPENDED',
      dto.reason,
      actor,
      ip,
    );
    return this.detail(id);
  }

  /** Lifts a suspension. The subscription status is recomputed from its dates (it may already be in grace or expired). */
  async reactivate(id: string, dto: SuspendDto, actor: Principal, ip?: string) {
    const org = await this.find(id);
    if (org.status !== OrgStatus.SUSPENDED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Only a suspended organization can be reactivated',
      );
    }
    const sub = await this.requireSubscription(org._id);
    const status = evaluateStatus(
      todayIST(),
      sub.endDate,
      sub.graceDays,
      SubscriptionStatus.ACTIVE,
    );
    await this.switchStatus(
      org,
      sub,
      OrgStatus.ACTIVE,
      status,
      'ORGANIZATION_REACTIVATED',
      dto.reason,
      actor,
      ip,
    );
    return this.detail(id);
  }

  /** Issues a fresh set-password link for every admin who has not set a password yet (old links stop working). */
  async reissueAdminInvites(id: string, actor: Principal, ip?: string) {
    const org = await this.find(id);
    const admins = await this.orgUsers.find({
      organizationId: org._id,
      role: Role.ORG_ADMIN,
      isActive: true,
    });
    const invited = await this.users.find({
      _id: { $in: admins.map((a) => a.userId) },
      status: UserStatus.INVITED,
    });
    if (!invited.length)
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'No admin of this organization is waiting to set a password',
      );

    const invites = [];
    for (const user of invited) {
      await this.auth.invalidateLinks(user._id, AuthTokenType.SET_PASSWORD);
      const { link, expiresAt } = await this.auth.issueLink(
        user,
        AuthTokenType.SET_PASSWORD,
      );
      await this.auth.mailLink(user, AuthTokenType.SET_PASSWORD, link);
      invites.push({
        userId: user.id as string,
        email: user.email,
        link,
        expiresAt,
      });
    }
    await this.audit.record({
      actor,
      organizationId: org.id as string,
      action: 'ADMIN_INVITE_REISSUED',
      entityType: 'Organization',
      entityId: org.id as string,
      after: { admins: invites.map((i) => i.email) }, // never the links themselves
      ip,
    });
    return invites;
  }

  // ----------------------------------------------------------------

  private summary(o: OrganizationDocument) {
    return {
      id: o.id as string,
      slug: o.slug,
      name: o.tradeName ?? o.legalName,
      legalName: o.legalName,
      gstin: o.gstin ?? null,
      status: o.status,
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
    };
  }

  private async find(id: string) {
    const org = await this.orgs.findById(id);
    if (!org) throw new AppError('NOT_FOUND', 'Organization not found');
    return org;
  }

  private async requireSubscription(organizationId: Types.ObjectId) {
    const sub = await this.subs.findOne({ organizationId });
    if (!sub) throw new AppError('NOT_FOUND', 'Subscription not found');
    return sub;
  }

  /** Organization and subscription move together or not at all. */
  private async switchStatus(
    org: OrganizationDocument,
    sub: SaasSubscription & { _id: Types.ObjectId },
    orgStatus: OrgStatus,
    subStatus: SubscriptionStatus,
    action: string,
    reason: string,
    actor: Principal,
    ip?: string,
  ) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const o = await this.orgs.updateOne(
          { _id: org._id, status: org.status },
          { $set: { status: orgStatus } },
          { session },
        );
        if (o.modifiedCount !== 1)
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            'The organization was changed by someone else; reload and try again',
          );
        const s = await this.subs.updateOne(
          { _id: sub._id, status: sub.status },
          { $set: { status: subStatus } },
          { session },
        );
        if (s.modifiedCount !== 1)
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            'The subscription was changed by someone else; reload and try again',
          );
        await this.audit.record(
          {
            actor,
            organizationId: org.id as string,
            action,
            entityType: 'Organization',
            entityId: org.id as string,
            before: { status: org.status, subscriptionStatus: sub.status },
            after: { status: orgStatus, subscriptionStatus: subStatus, reason },
            ip,
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
  }
}
