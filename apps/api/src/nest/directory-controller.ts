import { BadRequestException, Controller, Get, Header, Inject, NotFoundException, Param, ParseUUIDPipe, Query, ServiceUnavailableException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { ApiParam, ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { identityTransaction } from './identity-transaction.js';
import { asciiDigits, normalizePersian } from './normalization.js';

export const directoryPageSize = 24;
class DirectoryItemDto {
  @ApiProperty({ type:String, format:'uuid' }) id!: string;
  @ApiProperty({ type:String }) cafeName!: string;
  @ApiProperty({ type:String }) branchName!: string;
  @ApiProperty({ type:String }) province!: string;
  @ApiProperty({ type:String }) city!: string;
  @ApiProperty({ type:String }) neighborhood!: string;
}
class DirectoryPageDto {
  @ApiProperty({ type:[DirectoryItemDto], maxItems:directoryPageSize }) items!: DirectoryItemDto[];
  @ApiProperty({ type:Boolean }) hasMore!: boolean;
}
const projection = `id,cafe_name AS "cafeName",branch_name AS "branchName",province,city,neighborhood`;
export async function readDirectoryBranch(client: Pick<Pool,'query'>, id: string): Promise<DirectoryItemDto | null> {
  const { rows } = await client.query<DirectoryItemDto>(`SELECT ${projection} FROM public_directory WHERE id=$1`,[id]);
  return rows[0] ?? null;
}
export async function readDirectory(client: Pick<Pool,'query'>, term: string, page: number) {
  const { rows } = await client.query(
    `SELECT ${projection}
     FROM public_directory WHERE $1='' OR strpos(search_text,$1)>0
     ORDER BY cafe_name,branch_name,id LIMIT $2 OFFSET $3`,
    [term, directoryPageSize + 1, (page - 1) * directoryPageSize]);
  return { items: rows.slice(0,directoryPageSize), hasMore: page < 100 && rows.length > directoryPageSize };
}

@ApiTags('directory') @Controller('v1/directory')
export class DirectoryController {
  constructor(@Inject('RUNTIME_POOL') private readonly pool: Pool | null) {}
  private async read<T>(operation: (client:PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new ServiceUnavailableException();
    try { return await identityTransaction(this.pool, async client => {
      await client.query("SET LOCAL statement_timeout = '2s'");
      return operation(client);
    }); }
    catch { throw new ServiceUnavailableException(); }
  }

  @Get('branches/:id') @Header('Cache-Control','no-store')
  @ApiParam({ name:'id', schema:{type:'string',format:'uuid'} })
  @ApiResponse({ status:200, type:DirectoryItemDto })
  async branch(@Param('id',new ParseUUIDPipe()) id: string): Promise<DirectoryItemDto> {
    const entry = await this.read(client => readDirectoryBranch(client,id));
    if (!entry) throw new NotFoundException();
    return entry;
  }

  @Get() @Header('Cache-Control','no-store')
  @ApiQuery({ name:'q', required:false, schema:{type:'string', maxLength:80} })
  @ApiQuery({ name:'page', required:false, schema:{type:'integer', minimum:1, maximum:100} })
  @ApiResponse({ status:200, type:DirectoryPageDto })
  async list(@Query('q') raw: unknown, @Query('page') page: unknown): Promise<DirectoryPageDto> {
    if ((raw !== undefined && (typeof raw !== 'string' || raw.length > 80 || /[\u0000-\u001f\u007f]/.test(raw))) ||
        (page !== undefined && (typeof page !== 'string' || !/^(?:[1-9]\d?|100)$/.test(page)))) {
      throw new BadRequestException();
    }
    const term = asciiDigits(normalizePersian(typeof raw === 'string' ? raw : '')).toLowerCase();
    if (term.length > 80) throw new BadRequestException();
    return this.read(client => readDirectory(client, term, Number(page ?? 1)));
  }
}
