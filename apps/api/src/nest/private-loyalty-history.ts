import {Controller,Get,Header,Headers,Inject,Query} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsIn,IsOptional,IsUUID} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const LOYALTY_READER_DB=Symbol('LOYALTY_READER_DB');
class HistoryInput {
  @IsIn(['stamp','star','tier']) ledger!:string;
  @IsOptional() @IsUUID() after?:string;
}
@ApiExcludeController()
@Controller('v1/internal/loyalty-history')
export class PrivateLoyaltyHistoryController {
  constructor(@Inject(LOYALTY_READER_DB) private readonly database:PrivateSessionDatabase) {}
  @Get() @Header('Cache-Control','no-store')
  async read(@Headers('authorization') header:string|undefined,@Query() input:HistoryInput) {
    const {page}=await this.database.run<{page:Record<string,unknown>}>(header,
      'SELECT public.read_private_loyalty_history($1,$2,$3) AS page',[input.ledger,input.after??null]);
    return page;
  }
}
