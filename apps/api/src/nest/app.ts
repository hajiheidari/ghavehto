import 'reflect-metadata';
import { Controller, Get, Module, Injectable, CanActivate, UnauthorizedException, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiProperty, ApiTags, ApiResponse, SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import pg from 'pg';
import { bootstrap } from '@ghahvehto/contracts';

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
  @Get('health/live') live() { return { status: 'ok' }; }

  @Get('health/ready')
  async ready() {
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException('Database not configured');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000, max: 1 });
    try {
      await pool.query('SELECT 1');
      const result = await pool.query("SELECT version FROM schema_migrations WHERE version = '001_foundation'");
      if (!result.rowCount) throw new Error('Pending migrations');
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('Database is not ready'); }
    finally { await pool.end(); }
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

@Module({ controllers: [FoundationController], providers: [PendingIdentityGuard] })
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.use(helmet());
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Ghahvehto Foundation API').setVersion('0.1.0')
    .setDescription('Local read-only foundation. Authentication and business transactions are not enabled.').build());
  SwaggerModule.setup('docs', app, document);
  return { app, document };
}
