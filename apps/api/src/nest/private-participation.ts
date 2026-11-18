import {BadRequestException, Body, Controller, Get, Header, Headers, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query} from '@nestjs/common';
import {ApiExcludeController} from '@nestjs/swagger';
import {IsInt, IsString, IsUUID, Max, MaxLength, Min, Matches} from 'class-validator';
import {PrivateSessionDatabase} from './private-session-database.js';

export const PARTICIPATION_DB=Symbol('PARTICIPATION_DB');

class ReservationInput {
  @IsUUID() experienceId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() operationId!: string;
  @IsInt() @Min(1) @Max(2147483647) version!: number;
}

class OfferInput {
  @IsUUID() experienceId!: string;
  @IsUUID() branchId!: string;
  @Matches(/^[1-9][0-9]{0,9}$/) version!: string;
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

  @Get('offer') @Header('Cache-Control','no-store')
  async offer(@Headers('authorization') header: string | undefined, @Query() input: OfferInput) {
    const version=Number(input.version);
    if(version>2147483647) throw new BadRequestException();
    const {offer}=await this.database.run<{offer:Record<string,unknown> | null}>(header,
      'SELECT public.read_private_experience_offer($1,$2,$3,$4) AS offer',[input.experienceId,version,input.branchId]);
    if(!offer) throw new NotFoundException();
    return offer;
  }

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
