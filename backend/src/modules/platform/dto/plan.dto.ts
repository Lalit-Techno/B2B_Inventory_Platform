import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { IsDecimalString } from '../../../common/validation/decorators';

const LIMIT = { min: 0, max: 1_000_000 };

export class CreatePlanDto {
  /** STARTER, GROWTH ... Stored upper-case; cannot be changed later. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_]{2,32}$/, {
    message: 'code must be 2-32 letters, digits or _',
  })
  code: string;

  @IsString()
  @Length(2, 64)
  name: string;

  /** Prices are decimal strings, e.g. "4999.00", excluding GST. */
  @IsDecimalString()
  monthlyPrice: string;

  @IsDecimalString()
  yearlyPrice: string;

  /** GST % on the SaaS fee. Default 18. */
  @IsOptional()
  @IsDecimalString({ max: '100' })
  gstRate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  graceDays?: number;

  /** Limits: leave out (or null on update) for unlimited. */
  @IsOptional() @IsInt() @Min(LIMIT.min) @Max(LIMIT.max) maxStaff?:
    number | null;
  @IsOptional() @IsInt() @Min(LIMIT.min) @Max(LIMIT.max) maxBuyers?:
    number | null;
  @IsOptional() @IsInt() @Min(LIMIT.min) @Max(LIMIT.max) maxSkus?:
    number | null;
  @IsOptional() @IsInt() @Min(LIMIT.min) @Max(LIMIT.max) maxOrdersPerMonth?:
    number | null;
}

/** Every field optional, and `code` is fixed once created. */
export class UpdatePlanDto extends PartialType(
  OmitType(CreatePlanDto, ['code'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
