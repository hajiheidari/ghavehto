import {Body,Controller,Get,Header,Headers,Inject,Post,Query} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsOptional,IsString,IsUUID,MaxLength} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const TRACKING_OWNER_DB=Symbol('TRACKING_OWNER_DB');
class StopInput {
  @IsUUID() linkId!:string;
  @IsString() @MaxLength(240) reason!:string;
}
class CafeStopInput extends StopInput {
  @IsUUID() cafeId!:string;
}
class ListInput {
  @IsUUID() cafeId!:string;
  @IsOptional() @IsUUID() after?:string;
}
@ApiExcludeController()
@Controller('v1/internal/tracking-owner')
export class PrivateTrackingOwnerController {
  constructor(@Inject(TRACKING_OWNER_DB) private readonly database:PrivateSessionDatabase) {}

  @Get('links') @Header('Cache-Control','no-store')
  async list(@Headers('authorization') header:string|undefined,@Query() input:ListInput) {
    const {page}=await this.database.run<{page:Record<string,unknown>}>(header,
      'SELECT public.list_private_tracking_links($1,$2,$3) AS page',[input.cafeId,input.after??null]);
    return page;
  }

  @Post('stop-in-cafe') @Header('Cache-Control','no-store')
  stopInCafe(@Headers('authorization') header:string|undefined,@Body() input:CafeStopInput) {
    return this.database.run<{changed:boolean}>(header,
      'SELECT public.stop_private_cafe_tracking_link($1,$2,$3,$4) AS changed',[input.cafeId,input.linkId,input.reason]);
  }

  @Post('stop') @Header('Cache-Control','no-store')
  stop(@Headers('authorization') header:string|undefined,@Body() input:StopInput) {
    return this.database.run<{changed:boolean}>(header,
      'SELECT public.stop_private_tracking_link($1,$2,$3) AS changed',[input.linkId,input.reason]);
  }
}
