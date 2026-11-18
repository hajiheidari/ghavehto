import {Body, Controller, Get, Header, Headers, Inject, NotFoundException, Param, ParseUUIDPipe, Post} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsInt, IsString, IsUUID, Max, MaxLength, Min} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const PARTICIPATION_DB=Symbol('PARTICIPATION_DB');

class ReservationInput {
  @IsUUID() experienceId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() operationId!: string;
  @IsInt() @Min(1) @Max(2147483647) version!: number;
}

class ResolutionInput {
  @IsUUID() claimId!: string;
  @IsUUID() operationId!: string;
  @IsString() @MaxLength(240) reason!: string;
}

@ApiExcludeController()
@Controller('v1/internal/participation')
export class PrivateParticipationController {
  constructor(@Inject(PARTICIPATION_DB) private readonly database: PrivateSessionDatabase) {}

  @Post('reservations') @Header('Cache-Control','no-store')
  reserve(@Headers('authorization') header: string | undefined, @Body() input: ReservationInput) {
    return this.database.run<{id:string}>(header,'SELECT public.reserve_private_experience($1,$2,$3,$4,$5) AS id',
      [input.experienceId,input.version,input.branchId,input.operationId]);
  }

  @Get('reservations/:operationId') @Header('Cache-Control','no-store')
  async read(@Headers('authorization') header: string | undefined, @Param('operationId',ParseUUIDPipe) operation: string) {
    const {receipt}=await this.database.run<{receipt:Record<string,unknown> | null}>(header,
      'SELECT public.read_private_experience_reservation($1,$2) AS receipt',[operation]);
    if(!receipt) throw new NotFoundException();
    return receipt;
  }

  @Post('cancellations') @Header('Cache-Control','no-store')
  cancel(@Headers('authorization') header: string | undefined, @Body() input: ResolutionInput) {
    return this.database.run<{id:string}>(header,'SELECT public.cancel_private_experience($1,$2,$3,$4) AS id',
      [input.claimId,input.operationId,input.reason]);
  }

  @Post('fulfillments') @Header('Cache-Control','no-store')
  fulfill(@Headers('authorization') header: string | undefined, @Body() input: ResolutionInput) {
    return this.database.run<{id:string}>(header,'SELECT public.fulfill_private_experience($1,$2,$3,$4) AS id',
      [input.claimId,input.operationId,input.reason]);
  }
}
