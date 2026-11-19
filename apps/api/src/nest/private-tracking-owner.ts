import {Body,Controller,Header,Headers,Inject,Post} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsString,IsUUID,MaxLength} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const TRACKING_OWNER_DB=Symbol('TRACKING_OWNER_DB');
class StopInput {
  @IsUUID() linkId!:string;
  @IsString() @MaxLength(240) reason!:string;
}
@ApiExcludeController()
@Controller('v1/internal/tracking-owner')
export class PrivateTrackingOwnerController {
  constructor(@Inject(TRACKING_OWNER_DB) private readonly database:PrivateSessionDatabase) {}

  @Post('stop') @Header('Cache-Control','no-store')
  stop(@Headers('authorization') header:string|undefined,@Body() input:StopInput) {
    return this.database.run<{changed:boolean}>(header,
      'SELECT public.stop_private_tracking_link($1,$2,$3) AS changed',[input.linkId,input.reason]);
  }
}
