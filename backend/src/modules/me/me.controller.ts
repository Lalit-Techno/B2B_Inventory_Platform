import { Body, Controller, Get, Patch } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import { AppError } from '../../common/errors/app-error';
import {
  AllowInactive,
  Authorize,
} from '../../common/rbac/authorize.decorator';
import { normalizePhone } from '../../common/validation/validators';
import { UpdateMeDto } from '../auth/dto/auth.dto';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { todayIST } from '../../common/dates/ist';
import { SaasSubscription } from '../platform/schemas/saas-subscription.schema';
import { evaluateStatus } from '../platform/subscription-status';
import { Organization } from '../organization/schemas/organization.schema';

@ApiTags('me')
@AllowInactive() // the app shell needs the profile to show the freeze screen
@Controller('me')
export class MeController {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
  ) {}

  @Authorize('TEN-18')
  @Get()
  async get(@CurrentUser() p: Principal) {
    const user = await this.users.findById(p.userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    return this.view(user, p);
  }

  @Authorize('TEN-18')
  @Patch()
  async update(@CurrentUser() p: Principal, @Body() dto: UpdateMeDto) {
    const user = await this.users.findByIdAndUpdate(
      p.userId,
      {
        $set: {
          ...dto,
          ...(dto.phone && { phone: normalizePhone(dto.phone) }),
        },
      },
      { new: true },
    );
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    return this.view(user, p);
  }

  /** Explicit mapper: never return the Mongoose document (it carries passwordHash). */
  private async view(user: UserDocument, p: Principal) {
    const org = p.organizationId
      ? await this.orgs.findById(p.organizationId)
      : null;
    // Status only (every staff role needs it for the grace banner / freeze screen); dates stay with PLT-05.
    const sub = org
      ? await this.subs.findOne({ organizationId: org._id }).lean()
      : null;
    return {
      id: user.id as string,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      role: p.role,
      subscriptionStatus: sub
        ? evaluateStatus(todayIST(), sub.endDate, sub.graceDays, sub.status)
        : null,
      organization: org
        ? {
            id: org.id as string,
            slug: org.slug,
            name: org.tradeName ?? org.legalName,
            status: org.status,
          }
        : null,
    };
  }
}
