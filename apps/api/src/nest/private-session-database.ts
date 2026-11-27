import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,UnauthorizedException} from '@nestjs/common';
import type {Pool} from 'pg';

export class PrivateSessionDatabase {
  constructor(private readonly pool: Pool, private readonly role: 'ghahvehto_editorial' | 'ghahvehto_participation' | 'ghahvehto_tracking_owner' | 'ghahvehto_preferences' | 'ghahvehto_loyalty_reader') {}

  async validateRuntime(): Promise<void> {
    const {rows:[row]}=await this.pool.query(`SELECT NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
      AND current_user=session_user AND pg_has_role(session_user,$1,'MEMBER')
      AND NOT EXISTS(SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND other.rolname<>$1
        AND pg_has_role(r.oid,other.oid,'MEMBER'))
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_has_role(r.oid,datdba,'MEMBER'))
      AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_has_role(r.oid,c.relowner,'MEMBER'))
      AS allowed FROM pg_roles r WHERE rolname=session_user`,[this.role]);
    if(!row?.allowed) throw new Error('Dedicated restricted '+this.role.slice('ghahvehto_'.length)+' login required');
  }

  async run<T extends Record<string,unknown>>(header: string | undefined, sql: string, values: unknown[]): Promise<T> {
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '')?.[1];
    if(!token) throw new UnauthorizedException();
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query(`SET LOCAL ROLE ${this.role}`);
      const {rows:[receipt]}=await client.query<T>(sql,[createHash('sha256').update(token).digest(),...values]);
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
