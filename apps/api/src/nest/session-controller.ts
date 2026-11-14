import { Body, Controller, Get, Header, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { SessionService } from './sessions.js';

export class SessionStatusDto {
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) sessionId!: string;
}
export class SessionTokensDto {
  @ApiProperty({ type: String, pattern: '^[A-Za-z0-9_-]{43}$' }) accessToken!: string;
  @ApiProperty({ type: String, pattern: '^[A-Za-z0-9_-]{43}$' }) refreshToken!: string;
  @ApiProperty({ type: String, format: 'date-time' }) accessExpiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) refreshExpiresAt!: string;
}
export class RefreshSessionDto {
  @ApiProperty({ type: String, pattern: '^[A-Za-z0-9_-]{43}$' })
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) refreshToken!: string;
}
export class LogoutSessionDto {
  @ApiProperty({ type: Boolean, enum: [true] }) revoked!: true;
}

/** Existing sessions only. No OTP delivery, initial login or cookie authority. */
@ApiTags('session') @ApiBearerAuth() @Controller('v1/session')
export class SessionController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService | null) {}
  private access(header: string | undefined): string {
    const value = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
    if (!this.sessions || !value) throw new UnauthorizedException();
    return value;
  }
  @Get() @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiResponse({ status: 200, type: SessionStatusDto })
  async status(@Headers('authorization') header: string | undefined): Promise<SessionStatusDto> {
    const token = this.access(header);
    const identity = await this.sessions!.authenticate(token);
    if (!identity) throw new UnauthorizedException();
    return identity;
  }
  @Post('refresh') @Header('Cache-Control','no-store')
  @ApiResponse({ status: 201, type: SessionTokensDto })
  async refresh(@Body() body: RefreshSessionDto): Promise<SessionTokensDto> {
    if (!this.sessions) throw new UnauthorizedException();
    const tokens = await this.sessions.rotate(body.refreshToken);
    if (!tokens) throw new UnauthorizedException();
    return tokens;
  }
  @Post('logout') @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiResponse({ status: 201, type: LogoutSessionDto })
  async logout(@Headers('authorization') header: string | undefined): Promise<LogoutSessionDto> {
    const token = this.access(header);
    await this.sessions!.revoke(token);
    return { revoked: true };
  }
}
