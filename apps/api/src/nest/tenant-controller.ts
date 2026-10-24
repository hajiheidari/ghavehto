import { Body, Controller, Get, Headers, Header, Inject, Param, ParseUUIDPipe, Patch, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { TenantAccessService } from './tenant-access.js';

export class CafeAccessDto {
  @ApiProperty({ type: String, format: 'uuid' }) cafeId!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class BranchAccessDto {
  @ApiProperty({ type: String, format: 'uuid' }) branchId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) cafeId!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class UpdateCafeDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

@ApiTags('authenticated-cafe') @ApiBearerAuth()
@Controller('v1/cafes')
export class TenantController {
  constructor(@Inject(TenantAccessService) private readonly access: TenantAccessService | null) {}
  private token(header: string | undefined): string {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
    if (!this.access || !match) throw new UnauthorizedException();
    return match[1];
  }
  @Get(':cafeId/access') @Header('Cache-Control', 'no-store') @Header('Vary', 'Authorization')
  @ApiResponse({ status: 200, type: CafeAccessDto })
  cafe(@Headers('authorization') header: string | undefined, @Param('cafeId', new ParseUUIDPipe()) cafeId: string): Promise<CafeAccessDto> {
    const token = this.token(header);
    return this.access!.readCafe(token, cafeId);
  }
  @Get(':cafeId/branches/:branchId/access') @Header('Cache-Control', 'no-store') @Header('Vary', 'Authorization')
  @ApiResponse({ status: 200, type: BranchAccessDto })
  branch(@Headers('authorization') header: string | undefined, @Param('cafeId', new ParseUUIDPipe()) cafeId: string,
    @Param('branchId', new ParseUUIDPipe()) branchId: string): Promise<BranchAccessDto> {
    const token = this.token(header);
    return this.access!.readBranch(token, cafeId, branchId);
  }
  @Patch(':cafeId/profile') @Header('Cache-Control', 'no-store') @Header('Vary', 'Authorization')
  @ApiResponse({ status: 200, type: CafeAccessDto })
  update(@Headers('authorization') header: string | undefined, @Param('cafeId', new ParseUUIDPipe()) cafeId: string,
    @Body() body: UpdateCafeDto): Promise<CafeAccessDto> {
    const token = this.token(header);
    const name = body.name.trim();
    if (!name) throw new BadRequestException('Name required');
    return this.access!.updateCafe(token, cafeId, name);
  }
}
