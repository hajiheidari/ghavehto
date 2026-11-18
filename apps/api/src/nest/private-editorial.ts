import { createHash } from 'node:crypto';
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Header, Headers, Inject, Post, UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Pool } from 'pg';

class RevisionInput {
  @IsUUID() documentId!: string;
  @IsUUID() operationId!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @IsString() @MaxLength(160) title!: string;
  @IsString() @MaxLength(50000) body!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) sources!: unknown[];
}

class ReviewInput {
  @IsOptional() @IsUUID() jobId?: string;
  @IsOptional() @IsUUID() revisionId?: string;
  @IsUUID() operationId!: string;
  @IsIn(['approved','rejected']) decision!: string;
  @IsInt() @Min(1) @Max(604800) lifetimeSeconds!: number;
  @IsString() @MaxLength(240) reason!: string;
}

export class PrivateEditorial {
  constructor(private readonly pool: Pool) {}

  async validateRuntime(): Promise<void> {
    const {rows:[row]}=await this.pool.query(`SELECT NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
      AND current_user=session_user AND pg_has_role(session_user,'ghahvehto_editorial','MEMBER')
      AND NOT EXISTS(SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND other.rolname<>'ghahvehto_editorial'
        AND pg_has_role(r.oid,other.oid,'MEMBER'))
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_has_role(r.oid,datdba,'MEMBER'))
      AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_has_role(r.oid,c.relowner,'MEMBER'))
      AS allowed FROM pg_roles r WHERE rolname=session_user`);
    if(!row?.allowed) throw new Error('Dedicated restricted editorial login required');
  }

  revision(header: string | undefined, input: RevisionInput) {
    return this.write(header,'SELECT public.save_private_content($1,$2,$3,$4,$5,$6,$7) AS id',
      [input.documentId,input.expectedRevision,input.operationId,input.title,input.body,JSON.stringify(input.sources)]);
  }

  review(header: string | undefined, input: ReviewInput) {
    return this.write(header,'SELECT public.review_private_operation($1,$2,$3,$4,$5,$6,$7) AS id',
      [input.jobId ?? null,input.revisionId ?? null,input.operationId,input.decision,input.lifetimeSeconds,input.reason]);
  }

  private async write(header: string | undefined, sql: string, values: unknown[]): Promise<{id:string}> {
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
    if(!token) throw new UnauthorizedException();
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghahvehto_editorial');
      const {rows:[receipt]}=await client.query<{id:string}>(sql,[createHash('sha256').update(token).digest(),...values]);
      await client.query('COMMIT');
      return receipt;
    } catch(error) {
      await client.query('ROLLBACK');
      const code=(error as {code?:string}).code;
      if(code==='28000') throw new UnauthorizedException();
      if(code==='42501') throw new ForbiddenException();
      if(code==='22023') throw new BadRequestException();
      if(code==='23505'||code==='40001') throw new ConflictException();
      throw error;
    } finally {client.release();}
  }
}

@ApiExcludeController()
@Controller('v1/internal/editorial')
export class PrivateEditorialController {
  constructor(@Inject(PrivateEditorial) private readonly editorial: PrivateEditorial) {}

  @Post('revisions') @Header('Cache-Control','no-store')
  revision(@Headers('authorization') header: string | undefined, @Body() input: RevisionInput) {
    return this.editorial.revision(header,input);
  }

  @Post('reviews') @Header('Cache-Control','no-store')
  review(@Headers('authorization') header: string | undefined, @Body() input: ReviewInput) {
    return this.editorial.review(header,input);
  }
}
