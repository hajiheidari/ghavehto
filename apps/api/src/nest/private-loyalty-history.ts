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
class ReceiptHistoryInput {
  @IsIn(['stamp','star']) ledger!:string;
  @IsOptional() @IsUUID() after?:string;
}
class ReceiptRecoveryInput {
  @IsIn(['stamp','star']) ledger!:string;
  @IsUUID() operationId!:string;
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
  @Get('reservations') @Header('Cache-Control','no-store')
  async receipts(@Headers('authorization') header:string|undefined,@Query() input:ReceiptHistoryInput) {
    const {page}=await this.database.run<{page:Record<string,unknown>}>(header,
      'SELECT public.list_private_reward_receipts($1,$2,$3) AS page',[input.ledger,input.after??null]);
    return page;
  }
  @Get('reservation') @Header('Cache-Control','no-store')
  async recover(@Headers('authorization') header:string|undefined,@Query() input:ReceiptRecoveryInput) {
    const {receipt}=await this.database.run<{receipt:Record<string,unknown>|null}>(header,
      'SELECT public.recover_private_reward_receipt($1,$2,$3) AS receipt',[input.ledger,input.operationId]);
    if(!receipt) throw new NotFoundException();
    return receipt;
  }
}
