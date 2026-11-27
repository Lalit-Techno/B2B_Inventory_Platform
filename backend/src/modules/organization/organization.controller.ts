import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import {
  Authorize,
  Limited,
  Public,
} from '../../common/rbac/authorize.decorator';
import {
  CommercialSettingsDto,
  CreditSettingsDto,
  InvoiceSettingsDto,
  StockSettingsDto,
  UpdateBankDto,
  UpdateBrandingDto,
  UpdateContactDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

/** The signed-in tenant's own organization. The tenant comes from the token, never from the URL. */
@ApiTags('organization')
@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  /** L for non-admin staff: the service returns the profile of their own organization only. */
  @Authorize('TEN-01')
  @Limited()
  @Get()
  profile(@CurrentUser() p: Principal) {
    return this.service.profile(p);
  }

  @Authorize('TEN-03')
  @Patch('contact')
  contact(
    @CurrentUser() p: Principal,
    @Body() dto: UpdateContactDto,
    @Req() req: Request,
  ) {
    return this.service.updateContact(p, dto, req.ip);
  }

  @Authorize('TEN-04')
  @Patch('branding')
  branding(
    @CurrentUser() p: Principal,
    @Body() dto: UpdateBrandingDto,
    @Req() req: Request,
  ) {
    return this.service.updateBranding(p, dto, req.ip);
  }

  /** Finance Manager holds L: bank details only, never the rest of the invoice section's reach. */
  @Authorize('TEN-09')
  @Limited()
  @Patch('bank')
  bank(
    @CurrentUser() p: Principal,
    @Body() dto: UpdateBankDto,
    @Req() req: Request,
  ) {
    return this.service.updateBank(p, dto, req.ip);
  }

  @Authorize('TEN-06')
  @Limited()
  @Get('settings')
  settings(@CurrentUser() p: Principal) {
    return this.service.settings(p);
  }

  @Authorize('TEN-07')
  @Patch('settings/commercial')
  commercial(
    @CurrentUser() p: Principal,
    @Body() dto: CommercialSettingsDto,
    @Req() req: Request,
  ) {
    return this.service.updateSettings(p, 'commercial', dto, req.ip);
  }

  @Authorize('TEN-08')
  @Patch('settings/credit')
  credit(
    @CurrentUser() p: Principal,
    @Body() dto: CreditSettingsDto,
    @Req() req: Request,
  ) {
    return this.service.updateSettings(p, 'credit', dto, req.ip);
  }

  @Authorize('TEN-09')
  @Limited()
  @Patch('settings/invoice')
  invoice(
    @CurrentUser() p: Principal,
    @Body() dto: InvoiceSettingsDto,
    @Req() req: Request,
  ) {
    return this.service.updateSettings(p, 'invoice', dto, req.ip);
  }

  @Authorize('TEN-10')
  @Patch('settings/stock')
  stock(
    @CurrentUser() p: Principal,
    @Body() dto: StockSettingsDto,
    @Req() req: Request,
  ) {
    return this.service.updateSettings(p, 'stock', dto, req.ip);
  }
}

/** Branding for the storefront, readable before login. Shows nothing but how the shop looks. */
@ApiTags('public')
@Controller('public')
export class PublicTenantController {
  constructor(private readonly service: OrganizationService) {}

  @Public()
  @Get('tenant-config/:slug')
  config(@Param('slug') slug: string) {
    return this.service.publicConfig(slug);
  }
}
