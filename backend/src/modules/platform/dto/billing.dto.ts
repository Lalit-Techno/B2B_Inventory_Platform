import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination';
import {
  IsDateString,
  IsDecimalString,
} from '../../../common/validation/decorators';
import {
  LedgerEntryType,
  PaymentMode,
} from '../schemas/saas-transaction.schema';

export class RecordPaymentDto {
  /** Fee before GST, a decimal string. */
  @IsDecimalString()
  taxableAmount: string;

  @IsDecimalString()
  gstAmount: string;

  /** Must equal taxableAmount + gstAmount. */
  @IsDecimalString()
  amount: string;

  /** TDS the customer deducted (informational, at most the taxable amount). */
  @IsOptional()
  @IsDecimalString()
  tdsAmount?: string;

  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  /** Bank / UPI / cheque reference. Required for every mode except CASH. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _./-]{2,63}$/, {
    message: 'transactionReference must be 3-64 letters, digits or _ . / -',
  })
  transactionReference?: string;

  /** Date the money was received (YYYY-MM-DD, IST). Defaults to today; not in the future. */
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  /** Number of billing cycles paid. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  periods?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReverseDto {
  /** Why the entry is being reversed. Kept in the ledger and the audit trail. */
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class LedgerQueryDto extends PageQueryDto {
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @IsOptional()
  @IsEnum(LedgerEntryType)
  entryType?: LedgerEntryType;

  @IsOptional()
  @IsEnum(PaymentMode)
  mode?: PaymentMode;

  /** Payment date range, inclusive (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Matches the entry number or the reference. */
  @IsOptional()
  @IsString()
  @Length(2, 64)
  q?: string;
}

export class OrganizationsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(ACTIVE|SUSPENDED|OFFBOARDED)$/)
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(TRIAL|ACTIVE|GRACE_PERIOD|EXPIRED|SUSPENDED|CANCELLED)$/)
  subscriptionStatus?: string;
}

export class SuspendDto {
  @IsString()
  @Length(10, 500)
  reason: string;
}
