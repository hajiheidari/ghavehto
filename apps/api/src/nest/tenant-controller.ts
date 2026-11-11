import { Body, Controller, Get, Headers, Header, Inject, Param, ParseUUIDPipe, Patch, Put, Query, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
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
class CafeMembershipDto extends CafeAccessDto {
  @ApiProperty({type:Boolean}) canManageStaff!: boolean;
}
class CafeListDto {
  @ApiProperty({type:[CafeMembershipDto],maxItems:50}) items!: CafeMembershipDto[];
  @ApiProperty({type:String,format:'uuid',nullable:true}) nextCursor!: string|null;
}
class BranchListDto {
  @ApiProperty({type:[BranchAccessDto],maxItems:50}) items!: BranchAccessDto[];
  @ApiProperty({type:String,format:'uuid',nullable:true}) nextCursor!: string|null;
}
export class UpdateCafeDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}
class BranchStaffDto {
  @ApiProperty({type:Boolean}) @IsBoolean() enabled!: boolean;
}
class BranchStaffRosterDto {
  @ApiProperty({type:'array',items:{type:'string',format:'uuid'},maxItems:50}) userIds!: string[];
  @ApiProperty({type:String,format:'uuid',nullable:true}) nextCursor!: string|null;
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
  @Get() @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiQuery({name:'after',required:false,schema:{type:'string',format:'uuid'}})
  @ApiResponse({status:200,type:CafeListDto})
  list(@Headers('authorization') header:string|undefined,@Query('after',new ParseUUIDPipe({optional:true})) after?:string): Promise<CafeListDto> {
    const token = this.token(header);
    return this.access!.listCafes(token,after ?? null);
  }
  @Get(':cafeId/branches') @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiQuery({name:'after',required:false,schema:{type:'string',format:'uuid'}})
  @ApiResponse({status:200,type:BranchListDto})
  branches(@Headers('authorization') header:string|undefined,@Param('cafeId',new ParseUUIDPipe()) cafeId:string,
    @Query('after',new ParseUUIDPipe({optional:true})) after?:string): Promise<BranchListDto> {
    const token = this.token(header);
    return this.access!.listBranches(token,cafeId,after ?? null);
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
  @Get(':cafeId/profile') @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiResponse({status:200,type:CafeAccessDto})
  profile(@Headers('authorization') header:string|undefined,@Param('cafeId',new ParseUUIDPipe()) cafeId:string):Promise<CafeAccessDto> {
    return this.access!.readCafeProfile(this.token(header),cafeId);
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
  @Get(':cafeId/branches/:branchId/staff') @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiQuery({name:'after',required:false,schema:{type:'string',format:'uuid'}})
  @ApiResponse({status:200,type:BranchStaffRosterDto})
  roster(@Headers('authorization') header:string|undefined, @Param('cafeId',new ParseUUIDPipe()) cafeId:string,
    @Param('branchId',new ParseUUIDPipe()) branchId:string,
    @Query('after',new ParseUUIDPipe({optional:true})) after?:string): Promise<BranchStaffRosterDto> {
    const token = this.token(header);
    return this.access!.readBranchStaff(token,cafeId,branchId,after ?? null);
  }
  @Put(':cafeId/branches/:branchId/staff/:userId') @Header('Cache-Control','no-store') @Header('Vary','Authorization')
  @ApiResponse({status:200,type:BranchStaffDto})
  staff(@Headers('authorization') header:string|undefined, @Param('cafeId',new ParseUUIDPipe()) cafeId:string,
    @Param('branchId',new ParseUUIDPipe()) branchId:string, @Param('userId',new ParseUUIDPipe()) userId:string,
    @Body() body:BranchStaffDto): Promise<BranchStaffDto> {
    const token = this.token(header);
    return this.access!.changeBranchStaff(token,cafeId,branchId,userId,body.enabled);
  }
}
