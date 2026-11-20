import { PrivateSessionDatabase } from './private-session-database.js';
import {
  BadRequestException, Body, Controller,
  Get, Header, Headers, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Pool } from 'pg';
import { prepareInternalDraft } from './internal-draft-worker.js';

class DocumentListInput {
  @IsOptional() @IsUUID() after?: string;
}

class DocumentInput {
  @IsUUID() documentId!: string;
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,119}$/) slug!: string;
}

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

class RoleInput {
  @IsUUID() userId!: string;
  @IsIn(['editor','operator']) role!: string;
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(240) reason!: string;
}

class ControlInput {
  @IsIn(['research','content']) kind!: string;
  @IsBoolean() paused!: boolean;
  @IsInt() @Min(1) @Max(10) attemptLimit!: number;
  @IsString() @MaxLength(240) reason!: string;
}

class DraftInput {
  @IsIn(['research','content']) kind!: 'research' | 'content';
  @IsUUID() operationId!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsString() @MaxLength(50000) body!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) sources!: unknown[];
}

export class PrivateEditorial {
  private readonly database: PrivateSessionDatabase;
  constructor(pool: Pool) {this.database=new PrivateSessionDatabase(pool,'ghahvehto_editorial');}
  validateRuntime() {return this.database.validateRuntime();}

  async documents(header: string | undefined, after?: string) {
    const {page}=await this.database.run<{page:Record<string,unknown>}>(header,
      'SELECT public.list_private_content_documents($1,$2) AS page',[after??null]);
    return page;
  }

  document(header: string | undefined, input: DocumentInput) {
    return this.database.run<{id:string}>(header,'SELECT public.create_private_content_document($1,$2,$3) AS id',
      [input.documentId,input.slug]);
  }

  revision(header: string | undefined, input: RevisionInput) {
    return this.database.run<{id:string}>(header,'SELECT public.save_private_content($1,$2,$3,$4,$5,$6,$7) AS id',
      [input.documentId,input.expectedRevision,input.operationId,input.title,input.body,JSON.stringify(input.sources)]);
  }

  review(header: string | undefined, input: ReviewInput) {
    return this.database.run<{id:string}>(header,'SELECT public.review_private_operation($1,$2,$3,$4,$5,$6,$7) AS id',
      [input.jobId ?? null,input.revisionId ?? null,input.operationId,input.decision,input.lifetimeSeconds,input.reason]);
  }

  role(header: string | undefined, input: RoleInput) {
    return this.database.run<{changed:boolean}>(header,'SELECT public.set_private_operations_role($1,$2,$3,$4,$5) AS changed',
      [input.userId,input.role,input.enabled,input.reason]);
  }

  control(header: string | undefined, input: ControlInput) {
    return this.database.run<{changed:boolean}>(header,'SELECT public.set_private_draft_control($1,$2,$3,$4,$5) AS changed',
      [input.kind,input.paused,input.attemptLimit,input.reason]);
  }

  submitDraft(header: string | undefined, {kind,operationId,title,body,sources}: DraftInput) {
    const request={title,body,sources};
    try {prepareInternalDraft(kind,request);}
    catch(error) {
      if(error instanceof TypeError) throw new BadRequestException();
      throw error;
    }
    return this.database.run<{id:string}>(header,'SELECT public.submit_private_draft($1,$2,$3,$4) AS id',
      [kind,operationId,request]);
  }

  async subject(header: string | undefined, kind: 'revision' | 'job', id: string) {
    const {subject}=await this.database.run<{subject:Record<string,unknown> | null}>(header,
      'SELECT public.read_private_review_subject($1,$2,$3) AS subject',[kind,id]);
    if(!subject) throw new NotFoundException();
    return subject;
  }


}

@ApiExcludeController()
@Controller('v1/internal/editorial')
export class PrivateEditorialController {
  constructor(@Inject(PrivateEditorial) private readonly editorial: PrivateEditorial) {}

  @Put('roles') @Header('Cache-Control','no-store')
  role(@Headers('authorization') header: string | undefined, @Body() input: RoleInput) {
    return this.editorial.role(header,input);
  }

  @Put('controls') @Header('Cache-Control','no-store')
  control(@Headers('authorization') header: string | undefined, @Body() input: ControlInput) {
    return this.editorial.control(header,input);
  }

  @Get('revisions/:id') @Header('Cache-Control','no-store')
  revisionSubject(@Headers('authorization') header: string | undefined, @Param('id',ParseUUIDPipe) id: string) {
    return this.editorial.subject(header,'revision',id);
  }

  @Post('jobs') @Header('Cache-Control','no-store')
  submitDraft(@Headers('authorization') header: string | undefined, @Body() input: DraftInput) {
    return this.editorial.submitDraft(header,input);
  }

  @Get('jobs/:id') @Header('Cache-Control','no-store')
  jobSubject(@Headers('authorization') header: string | undefined, @Param('id',ParseUUIDPipe) id: string) {
    return this.editorial.subject(header,'job',id);
  }

  @Get('documents') @Header('Cache-Control','no-store')
  documents(@Headers('authorization') header: string | undefined, @Query() input: DocumentListInput) {
    return this.editorial.documents(header,input.after);
  }

  @Post('documents') @Header('Cache-Control','no-store')
  document(@Headers('authorization') header: string | undefined, @Body() input: DocumentInput) {
    return this.editorial.document(header,input);
  }

  @Post('revisions') @Header('Cache-Control','no-store')
  revision(@Headers('authorization') header: string | undefined, @Body() input: RevisionInput) {
    return this.editorial.revision(header,input);
  }

  @Post('reviews') @Header('Cache-Control','no-store')
  review(@Headers('authorization') header: string | undefined, @Body() input: ReviewInput) {
    return this.editorial.review(header,input);
  }
}
