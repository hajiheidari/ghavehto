import 'reflect-metadata';
import { Controller, Get, Module, Injectable, CanActivate, UnauthorizedException, UseGuards, ServiceUnavailableException, ValidationPipe, Inject } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiProperty, ApiTags, ApiResponse, SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import pg from 'pg';
import { bootstrap } from '@ghahvehto/contracts';
import { TenantController } from './tenant-controller.js';
import { TenantAccessService, validateRuntimePool } from './tenant-access.js';
import { identityTransaction } from './identity-transaction.js';
import { schemaReady } from './migrations.js';
import { SessionController } from './session-controller.js';
import { SessionService } from './sessions.js';

export class BootstrapDto {
  @ApiProperty({ example: 'قهوه‌تو', type: String }) brand!: string;
  @ApiProperty({ enum: ['fa-IR'] }) locale!: 'fa-IR';
  @ApiProperty({ enum: ['rtl'] }) direction!: 'rtl';
  @ApiProperty({ enum: ['development'] }) environment!: 'development';
  @ApiProperty({ enum: ['empty'] }) dataMode!: 'empty';
  @ApiProperty({ enum: [false], type: Boolean }) loyaltyEnabled!: false;
}

// Fail closed. This is deliberately not a mock login or a production auth implementation.
@Injectable()
export class PendingIdentityGuard implements CanActivate {
  canActivate(): boolean { throw new UnauthorizedException('Authentication is not configured'); }
}

@ApiTags('foundation')
@Controller()
export class FoundationController {
  constructor(@Inject('RUNTIME_POOL') private readonly pool: pg.Pool | null) {}
  @Get('health/live') live() { return { status: 'ok' }; }

  @Get('health/ready')
  async ready() {
    if (!this.pool) throw new ServiceUnavailableException('Runtime database not configured');
    try {
      if (!await identityTransaction(this.pool, schemaReady)) throw new Error('Pending or mismatched migrations');
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('Database is not ready'); }
  }

  @Get('v1/bootstrap')
  @ApiResponse({ status: 200, type: BootstrapDto })
  getBootstrap(): BootstrapDto { return bootstrap; }

  @Get('v1/dashboards/cafe') @UseGuards(PendingIdentityGuard)
  cafe() { return {}; }
  @Get('v1/dashboards/admin') @UseGuards(PendingIdentityGuard)
  admin() { return {}; }
  @Get('v1/dashboards/agents') @UseGuards(PendingIdentityGuard)
  agents() { return {}; }
}

@Module({ controllers: [FoundationController, TenantController, SessionController], providers: [PendingIdentityGuard] })
export class AppModule {}

export async function createApp(options: { runtimePool?: pg.Pool } = {}) {
  if (options.runtimePool) await validateRuntimePool(options.runtimePool);
  const app = await NestFactory.create({ module: AppModule, providers: [
    { provide: 'RUNTIME_POOL', useValue: options.runtimePool ?? null },
    { provide: SessionService, useValue: options.runtimePool ? new SessionService(options.runtimePool) : null },
    { provide: TenantAccessService, useValue: options.runtimePool ? new TenantAccessService(options.runtimePool) : null },
  ] }, { logger: false });
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: false }));
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Ghahvehto Foundation API').setVersion('0.1.0').addBearerAuth()
    .setDescription('Development foundation with optional restricted bearer-authenticated café scopes. Public login and SMS are disabled.').build());
  SwaggerModule.setup('docs', app, document);
  return { app, document };
}
