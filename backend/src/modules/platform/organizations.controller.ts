import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Authorize } from '../../common/rbac/authorize.decorator';
import { OrganizationsQueryDto, SuspendDto } from './dto/billing.dto';
import { OnboardOrganizationDto } from './dto/onboard-organization.dto';
import { OnboardingService } from './onboarding.service';
import { OrganizationsService } from './organizations.service';

/** Super Admin: the list of tenants and their lifecycle. Never exposes tenant business data. */
@ApiTags('platform')
@Controller('super/organizations')
export class OrganizationsController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly organizations: OrganizationsService,
  ) {}

  /** Onboard a wholesaler: organization + warehouse + subscription + first admin, all or nothing. */
  @Authorize('PLT-03')
  @Post()
  onboard(
    @Body() dto: OnboardOrganizationDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.onboarding.onboard(dto, user, req.ip);
  }

  @Authorize('PLT-03')
  @Get()
  list(@Query() query: OrganizationsQueryDto) {
    return this.organizations.list(query);
  }

  @Authorize('PLT-03')
  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.organizations.detail(id);
  }

  @Authorize('PLT-04')
  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SuspendDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.organizations.suspend(id, dto, user, req.ip);
  }

  @Authorize('PLT-04')
  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SuspendDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.organizations.reactivate(id, dto, user, req.ip);
  }

  /** New set-password link for an admin who has not set a password yet (the link is also e-mailed). */
  @Authorize('PLT-03')
  @Post(':id/admin-invite')
  @HttpCode(200)
  adminInvite(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.organizations.reissueAdminInvites(id, user, req.ip);
  }
}
