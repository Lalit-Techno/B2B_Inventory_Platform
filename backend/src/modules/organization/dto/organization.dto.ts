import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STAFF_ROLES, StaffRole } from '../../../common/rbac/roles';
import {
  IsDecimalString,
  IsIndianPhone,
} from '../../../common/validation/decorators';
import { AddressDto } from '../../platform/dto/onboard-organization.dto';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Contact, address and trade name (TEN-03). Legal identity (name, GSTIN, PAN, slug) is Super Admin only. */
export class UpdateContactDto {
  @IsOptional() @IsString() @Length(2, 150) tradeName?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional() @IsIndianPhone() phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

const HEX = { message: 'must be a #RRGGBB colour' };

/** White-label branding (TEN-04). Colours are used only through CSS variables on the client. */
export class UpdateBrandingDto {
  /** Name shown in the portal header and on the storefront. */
  @IsOptional() @IsString() @Length(2, 80) displayName?: string;

  /** Must be dark enough to read against white (contrast 3:1 or better). */
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/, HEX) primaryColor?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/, HEX) secondaryColor?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/, HEX) accentColor?: string;
}

/** Bank details printed on invoices (TEN-09). */
export class UpdateBankDto {
  @IsString() @Length(2, 100) accountName: string;

  @Matches(/^\d{9,18}$/, { message: 'accountNumber must be 9-18 digits' })
  accountNumber: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'ifsc must be a valid IFSC' })
  ifsc: string;

  @IsString() @Length(2, 100) bankName: string;
  @IsOptional() @IsString() @MaxLength(100) branch?: string;

  @IsOptional()
  @Transform(lower)
  @Matches(/^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/, {
    message: 'upiId must look like name@bank',
  })
  upiId?: string;
}

export class CommercialSettingsDto {
  @IsOptional() @IsDecimalString() minOrderValue?: string;
  @IsOptional() @IsIn(['EXACT', 'BANDED', 'FLAG']) stockVisibility?:
    'EXACT' | 'BANDED' | 'FLAG';
  @IsOptional() @IsBoolean() pendingCatalogPreview?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(720) autoAckHours?: number;
  @IsOptional() @IsDecimalString({ max: '100' }) maxTierDiscountPct?: string;
}

export class CreditSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(365) overdueBlockDays?: number;
}

export class InvoiceSettingsDto {
  @IsOptional() @IsBoolean() roundOff?: boolean;
  @IsOptional() @IsDecimalString() creditNoteApprovalValue?: string;
}

export class StockSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Object.fromEntries(STAFF_ROLES.map((r) => [r, r])), { each: true })
  lowStockRoles?: StaffRole[];

  @IsOptional() @IsDecimalString() stockAdjustmentApprovalValue?: string;
}
