import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { INVOICE_PREFIX } from '../../../common/numbering/document-numbers';
import {
  IsDateString,
  IsDecimalString,
  IsGstin,
  IsIndianPhone,
} from '../../../common/validation/decorators';
import { BillingCycle } from '../schemas/saas-subscription.schema';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AddressDto {
  @IsString() @Length(3, 200) line1: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsString() @Length(2, 100) city: string;
  @IsString() @Length(2, 100) state: string;
  @Matches(/^[1-9]\d{5}$/, {
    message: 'pincode must be a 6 digit Indian pincode',
  })
  pincode: string;
}

class SubscriptionDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9_]{2,32}$/, {
    message: 'planCode must be 2-32 letters, digits or _',
  })
  planCode: string;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  /** Negotiated amount per billing cycle, excluding GST, as a decimal string. */
  @IsDecimalString()
  recurringAmount: string;

  /** First day of paid access, YYYY-MM-DD (IST). Defaults to today. */
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

class AdminUserDto {
  @IsString() @Length(2, 100) fullName: string;

  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional() @IsIndianPhone() phone?: string;
}

/** Words that would clash with the app's own URLs (`/shop/<slug>`, `/admin` ...). */
export const RESERVED_SLUGS = new Set([
  'admin',
  'portal',
  'shop',
  'api',
  'app',
  'login',
  'www',
  'super',
  'docs',
  'static',
  'public',
  'assets',
  'set-password',
  'reset-password',
  'forgot-password',
]);

export class OnboardOrganizationDto {
  @Transform(lower)
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, {
    message:
      'slug must be 3-40 characters: lower-case letters, digits and hyphens',
  })
  slug: string;

  @IsString() @Length(2, 200) legalName: string;
  @IsOptional() @IsString() @Length(2, 200) tradeName?: string;

  /** State code and PAN are derived from the GSTIN. */
  @Transform(upper)
  @IsGstin()
  gstin: string;

  @IsOptional() @Transform(lower) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsIndianPhone() phone?: string;

  @ValidateNested() @Type(() => AddressDto) address: AddressDto;

  /** 2-4 capital letters or digits; becomes the start of every invoice number. */
  @Transform(upper)
  @Matches(INVOICE_PREFIX, {
    message: 'invoicePrefix must be 2-4 capital letters or digits',
  })
  invoicePrefix: string;

  @ValidateNested() @Type(() => SubscriptionDto) subscription: SubscriptionDto;

  /** First ORG_ADMIN. No password here: they receive a set-password link. */
  @ValidateNested() @Type(() => AdminUserDto) adminUser: AdminUserDto;
}
