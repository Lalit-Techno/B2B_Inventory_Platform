import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Authorize } from '../../common/rbac/authorize.decorator';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { PlansService } from './plans.service';

/** SaaS price list. Super Admin only (PLT-01); tenants see their own plan through GET /subscription. */
@ApiTags('platform')
@Authorize('PLT-01')
@Controller('super/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.plans.get(id);
  }

  @Post()
  create(
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.plans.create(dto, user, req.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.plans.update(id, dto, user, req.ip);
  }
}
