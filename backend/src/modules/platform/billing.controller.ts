import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Authorize } from '../../common/rbac/authorize.decorator';
import { todayIST } from '../../common/dates/ist';
import { BillingService } from './billing.service';
import {
  LedgerQueryDto,
  RecordPaymentDto,
  ReverseDto,
} from './dto/billing.dto';

/** Record a SaaS payment for a subscription. Needs an Idempotency-Key header. */
@ApiTags('platform')
@Controller('super/subscriptions')
export class SubscriptionsController {
  constructor(private readonly billing: BillingService) {}

  @Authorize('PLT-08')
  @Idempotent()
  @Post(':id/record-payment')
  @HttpCode(200)
  recordPayment(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.billing.recordPayment(id, dto, user, req.ip);
  }
}

/** The append-only SaaS ledger: list, filter, export, reverse. */
@ApiTags('platform')
@Controller('super/subscription-transactions')
export class LedgerController {
  constructor(private readonly billing: BillingService) {}

  @Authorize('PLT-07')
  @Get()
  list(@Query() query: LedgerQueryDto) {
    return this.billing.list(query);
  }

  /** Same filters as the list, as a CSV download. */
  @Authorize('PLT-07')
  @Get('export')
  async export(
    @Query() query: LedgerQueryDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.billing.exportCsv(query, user, req.ip);
    res
      .type('text/csv; charset=utf-8')
      .attachment(`saas-ledger-${todayIST()}.csv`)
      .send(csv);
  }

  @Authorize('PLT-09')
  @Post(':id/reverse')
  @HttpCode(200)
  reverse(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReverseDto,
    @CurrentUser() user: Principal,
    @Req() req: Request,
  ) {
    return this.billing.reverse(id, dto, user, req.ip);
  }
}
