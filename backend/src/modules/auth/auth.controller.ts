import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import {
  AllowInactive,
  Authorize,
  Public,
} from '../../common/rbac/authorize.decorator';
import { AuthService, LoginResult } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  SetPasswordDto,
} from './dto/auth.dto';
import { AuthTokenType } from './schemas/auth-token.schema';

const COOKIE = 'refresh_token';
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
});

type Session = Omit<LoginResult, 'refreshToken'>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private startCookie(res: Response, result: LoginResult): Session {
    const { refreshToken, ...session } = result;
    res.cookie(COOKIE, refreshToken, {
      ...cookieOptions(),
      maxAge: 14 * 24 * 3600 * 1000,
    });
    return session;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startCookie(
      res,
      await this.auth.login(
        dto.email,
        dto.password,
        dto.organizationId,
        req.ip,
      ),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    return this.startCookie(res, await this.auth.refresh(cookies?.[COOKIE]));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string> | undefined;
    await this.auth.logout(cookies?.[COOKIE]);
    res.clearCookie(COOKIE, cookieOptions());
    return null;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return {
      message:
        'If that account exists, a reset link has been sent to its e-mail address.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: SetPasswordDto) {
    await this.auth.setPassword(
      dto.token,
      dto.password,
      AuthTokenType.RESET_PASSWORD,
    );
    return null;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('set-password')
  @HttpCode(200)
  async setPassword(@Body() dto: SetPasswordDto) {
    await this.auth.setPassword(
      dto.token,
      dto.password,
      AuthTokenType.SET_PASSWORD,
    );
    return null;
  }

  @Authorize('TEN-18')
  @AllowInactive()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: Principal,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      user.userId,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
    return null;
  }
}
