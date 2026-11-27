import {Body,Controller,Get,Header,Headers,Inject,Put} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsBoolean,IsInt,Max,Min} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const PREFERENCES_DB=Symbol('PREFERENCES_DB');
class PreferenceInput {
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!:number;
  @IsBoolean() loyalty!:boolean;
  @IsBoolean() experiences!:boolean;
  @IsBoolean() editorial!:boolean;
  @IsInt() @Min(0) @Max(10) dailyLimit!:number;
}
@ApiExcludeController()
@Controller('v1/internal/preferences')
export class PrivatePreferencesController {
  constructor(@Inject(PREFERENCES_DB) private readonly database:PrivateSessionDatabase) {}

  @Get() @Header('Cache-Control','no-store')
  async read(@Headers('authorization') header:string|undefined) {
    const {preferences}=await this.database.run<{preferences:Record<string,unknown>}>(header,
      'SELECT public.read_private_notification_preferences($1) AS preferences',[]);
    return preferences;
  }

  @Put() @Header('Cache-Control','no-store')
  async update(@Headers('authorization') header:string|undefined,@Body() input:PreferenceInput) {
    const {preferences}=await this.database.run<{preferences:Record<string,unknown>}>(header,
      'SELECT public.set_private_notification_preferences($1,$2,$3,$4,$5,$6) AS preferences',
      [input.expectedRevision,input.loyalty,input.experiences,input.editorial,input.dailyLimit]);
    return preferences;
  }
}
