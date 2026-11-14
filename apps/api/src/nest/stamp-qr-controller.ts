import {BadRequestException,Body,Controller,Header,Headers,HttpException,Inject,NotFoundException,Post,UnauthorizedException} from '@nestjs/common';
import {IsInt,IsString,IsUUID,Matches,Max,Min} from 'class-validator';
import {TenantAccessService} from './tenant-access.js';

class IssueQr {
  @IsUUID() cafeId!:string;
  @IsUUID() branchId!:string;
  @IsUUID() programId!:string;
  @IsInt() @Min(1) @Max(2147483647) version!:number;
}
class ConsumeQr {
  @IsUUID() branchId!:string;
  @IsString() @Matches(/^[0-9a-f]{64}$/) qr!:string;
}

@Controller('v1/stamp-qr')
export class StampQrController {
  constructor(@Inject(TenantAccessService) private readonly access:TenantAccessService) {}
  private bearer(header?:string) {
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header??'')?.[1];
    if(!token) throw new UnauthorizedException();
    return token;
  }
  private async safe<T>(operation:()=>Promise<T>):Promise<T> {
    try {return await operation();}
    catch(error) {
      if(error&&typeof error==='object'&&'code' in error) {
        if(error.code==='54000') throw new HttpException('QR issuance limit',429);
        if(error.code==='42501') throw new NotFoundException();
        if(error.code==='22023') throw new BadRequestException();
      }
      throw error;
    }
  }
  @Post('issue') @Header('Cache-Control','no-store')
  async issue(@Body() body:IssueQr,@Headers('authorization') header?:string) {
    const token=this.bearer(header);
    return {qr:await this.safe(()=>this.access.issueStampQr(token,body.cafeId,body.branchId,body.programId,body.version))};
  }
  @Post('consume') @Header('Cache-Control','no-store')
  async consume(@Body() body:ConsumeQr,@Headers('authorization') header?:string) {
    const token=this.bearer(header);
    return {entryId:await this.safe(()=>this.access.consumeStampQr(token,body.branchId,body.qr))};
  }
}
