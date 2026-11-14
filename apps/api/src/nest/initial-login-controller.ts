import { BadRequestException, Body, Controller, Header, Inject, Ip, Post, UnauthorizedException } from '@nestjs/common';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { normalizeIranMobile } from './normalization.js';
import type { IdentityService } from './identity.js';
import type { OtpChallengeService } from './otp-challenges.js';
import type { SessionTokensDto } from './session-controller.js';

export const INITIAL_LOGIN = Symbol('INITIAL_LOGIN');
export type InitialLogin = Readonly<{ otp: OtpChallengeService; identity: IdentityService }>;

class RequestLoginDto {
  @IsString() @Length(10, 32) mobile!: string;
}
class VerifyLoginDto extends RequestLoginDto {
  @IsUUID('4') challengeId!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

/** Registered only in explicitly composed apps. No browser cookies are issued here. */
@Controller('v1/auth/otp')
export class InitialLoginController {
  constructor(@Inject(INITIAL_LOGIN) private readonly login: InitialLogin) {}

  private phone(input: string): string {
    try { return normalizeIranMobile(input); }
    catch { throw new BadRequestException(); }
  }

  @Post('request') @Header('Cache-Control', 'no-store')
  request(@Body() body: RequestLoginDto, @Ip() clientIp: string) {
    // Express trust proxy is disabled by default; do not accept forwarded identity.
    return this.login.otp.request(this.phone(body.mobile), clientIp);
  }

  @Post('verify') @Header('Cache-Control', 'no-store')
  async verify(@Body() body: VerifyLoginDto, @Ip() clientIp: string): Promise<SessionTokensDto> {
    const result = await this.login.identity.verify(body.challengeId, this.phone(body.mobile), body.code, clientIp);
    if (!result) throw new UnauthorizedException();
    return result.tokens;
  }
}
