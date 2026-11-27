import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, HttpException, HttpStatus, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { TenantAccessService } from './tenant-access.js';

class ClaimRequestDto {
  @ApiProperty({type:String,format:'uuid'}) @IsUUID() branchId!: string;
}
class ClaimReceiptDto {
  @ApiProperty({type:String,format:'uuid'}) claimId!: string;
}
class ClaimSummaryDto extends ClaimReceiptDto {
  @ApiProperty({type:String,format:'uuid'}) branchId!: string;
  @ApiProperty({type:String,enum:['pending','withdrawn','verified','rejected']}) status!: 'pending'|'withdrawn'|'verified'|'rejected';
}
class ClaimWithdrawalDto {
  @ApiProperty({type:Boolean,enum:[true]}) withdrawn!: true;
}
class ClaimHistoryInput {
  @ApiProperty({type:String,format:'uuid',required:false}) @IsOptional() @IsUUID() after?:string;
}
class ClaimHistoryPageDto {
  @ApiProperty({type:[ClaimSummaryDto],maxItems:50}) items!:ClaimSummaryDto[];
  @ApiProperty({type:String,format:'uuid',nullable:true}) nextCursor!:string|null;
}

@ApiTags('ownership claims') @ApiBearerAuth() @Controller('v1/ownership-claims')
export class OwnershipClaimController {
  constructor(@Inject(TenantAccessService) private readonly access: TenantAccessService | null) {}
  private bearer(header?: string) {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
    if (!this.access || !token) throw new UnauthorizedException();
    return {access:this.access,token};
  }

  @Get() @Header('Cache-Control','no-store')
  @ApiResponse({status:200,type:[ClaimSummaryDto]})
  list(@Headers('authorization') header?: string): Promise<ClaimSummaryDto[]> {
    const {access,token} = this.bearer(header);
    return access.withVerifiedActor(token,async client => (await client.query<ClaimSummaryDto>(
      `SELECT id AS "claimId",branch_id AS "branchId",coalesce(decision, CASE WHEN withdrawn_at IS NULL THEN 'pending' ELSE 'withdrawn' END) AS status
       FROM ownership_claims ORDER BY created_at DESC,id LIMIT 50`)).rows);
  }

  @Get('history') @Header('Cache-Control','no-store')
  @ApiResponse({status:200,type:ClaimHistoryPageDto})
  history(@Query() input:ClaimHistoryInput,@Headers('authorization') header?:string):Promise<ClaimHistoryPageDto> {
    const {access,token}=this.bearer(header);
    return access.withVerifiedActor(token,async client=>{
      let recorded:string|null=null;
      if(input.after) {
        const {rows:[cursor]}=await client.query('SELECT created_at::text AS created_at FROM ownership_claims WHERE id=$1',[input.after]);
        if(!cursor) throw new BadRequestException();
        recorded=cursor.created_at;
      }
      const {rows}=await client.query<ClaimSummaryDto>(`SELECT id AS "claimId",branch_id AS "branchId",
        coalesce(decision,CASE WHEN withdrawn_at IS NULL THEN 'pending' ELSE 'withdrawn' END) AS status
        FROM ownership_claims WHERE $1::uuid IS NULL OR (created_at,id)<($2::timestamptz,$1)
        ORDER BY created_at DESC,id DESC LIMIT 51`,[input.after??null,recorded]);
      return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].claimId:null};
    });
  }

  @Post() @Header('Cache-Control','no-store')
  @ApiResponse({status:201,type:ClaimReceiptDto})
  async submit(@Body() body:ClaimRequestDto,@Headers('authorization') header?: string): Promise<ClaimReceiptDto> {
    const {access,token} = this.bearer(header);
    try {
      const id = await access.withVerifiedActor(token,async client =>
        (await client.query('SELECT public.submit_ownership_claim($1) AS id',[body.branchId])).rows[0].id);
      if (!id) throw new NotFoundException();
      return {claimId:id};
    } catch(error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '54000') {
        throw new HttpException('Claim intake limit',HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  @Delete(':id') @Header('Cache-Control','no-store')
  @ApiResponse({status:200,type:ClaimWithdrawalDto})
  async withdraw(@Param('id',new ParseUUIDPipe()) id:string,@Headers('authorization') header?: string): Promise<ClaimWithdrawalDto> {
    const {access,token} = this.bearer(header);
    const withdrawn = await access.withVerifiedActor(token,async client =>
      (await client.query('SELECT public.withdraw_ownership_claim($1) AS withdrawn',[id])).rows[0].withdrawn);
    if (!withdrawn) throw new NotFoundException();
    return {withdrawn:true};
  }
}
