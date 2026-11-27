import {
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsIndianPhone } from '../../../common/validation/decorators';

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently cut.
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 72;

export class LoginDto {
  /** Checked in the service so a malformed address gets the same "invalid credentials" answer as a wrong password. */
  @IsString()
  @Length(3, 254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  /** Only needed when the same person is staff in several organizations. */
  @IsOptional()
  @IsMongoId()
  organizationId?: string;
}

export class ForgotPasswordDto {
  /** The reset link is sent to this address if an account has it. */
  @IsString()
  @Length(3, 254)
  email: string;
}

export class SetPasswordDto {
  @IsString()
  @Length(20, 200)
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  newPassword: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @IsOptional()
  @IsIndianPhone()
  phone?: string;
}
