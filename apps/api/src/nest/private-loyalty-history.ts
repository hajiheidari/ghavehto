import {BadRequestException,Controller,Get,Header,Headers,Inject,NotFoundException,Query} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsIn,IsOptional,IsUUID,Matches} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const LOYALTY_READER_DB=Symbol('LOYALTY_READER_DB');
class HistoryInput {
  @IsIn(['stamp','star','tier']) ledger!:string;
  @IsOptional() @IsUUID() after?:string;
}
class SummaryInput {
  @IsOptional() @Matches(/^[2-9][0-9]{3}$/) year?:string;
}
class StampSummaryInput {
  @IsUUID() cafeId!:string;
  @IsUUID() programId!:string;
  @Matches(/^[1-9][0-9]{0,9}$/) version!:string;
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
  @Get('summary') @Header('Cache-Control','no-store')
  async summary(@Headers('authorization') header:string|undefined,@Query() input:SummaryInput) {
    const {summary}=await this.database.run<{summary:Record<string,unknown>}>(header,
      'SELECT public.read_private_loyalty_summary($1,$2) AS summary',[input.year===undefined?null:Number(input.year)]);
    return summary;
  }
  @Get('stamp-summary') @Header('Cache-Control','no-store')
  async stampSummary(@Headers('authorization') header:string|undefined,@Query() input:StampSummaryInput) {
    const version=Number(input.version);
    if(version>2147483647) throw new BadRequestException();
    const {summary}=await this.database.run<{summary:Record<string,unknown>|null}>(header,
      'SELECT public.read_private_stamp_summary($1,$2,$3,$4) AS summary',[input.cafeId,input.programId,version]);
    if(!summary) throw new NotFoundException();
    return summary;
  }
}
