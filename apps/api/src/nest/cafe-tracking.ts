import {createHash,createHmac} from 'node:crypto';
import type {Pool} from 'pg';
import {BadRequestException,ConflictException,HttpException} from '@nestjs/common';
import {OtpCrypto} from './otp.js';

/** Explicitly composed only; separate secret and restricted database login. */
export class CafeTrackingService {
  private readonly ip:OtpCrypto;
  constructor(private readonly pool:Pool,key:Buffer,readonly publicOrigin:string) {
    const origin=new URL(publicOrigin);
    if(origin.protocol!=='https:'||origin.origin!==publicOrigin||origin.username||origin.password) throw new Error('Explicit HTTPS tracking origin required');
    // Domain-separate IP fingerprints from OTP even if configuration accidentally reuses a key.
    if(key.length<32) throw new Error('Tracking requires a private random key');
    this.ip=new OtpCrypto(createHmac('sha256',key).update('ghahvehto:cafe-tracking:v1').digest());
  }
  async validateRuntime():Promise<void> {
    const {rows:[r]}=await this.pool.query(`SELECT NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)
      AND current_user=session_user AND pg_has_role(session_user,'ghahvehto_tracking','MEMBER')
      AND NOT pg_has_role(session_user,'ghahvehto_tracking','USAGE')
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_has_role(session_user,c.relowner,'MEMBER')) AS allowed
      FROM pg_roles r WHERE rolname=session_user`);
    if(!r?.allowed) throw new Error('Restricted tracking runtime database login required');
  }
  async record(code:string,kind:'qr_scan'|'store_click',operation:string,clientIp:string):Promise<string> {
    if(!/^[0-9a-f]{64}$/.test(code)) throw new BadRequestException();
    const visitor=this.ip.fingerprint('ip',clientIp);
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_tracking');
      const {rows:[row]}=await client.query<{result:{state:string;touchId?:string}}>('SELECT public.record_consented_cafe_touch($1,$2,$3,$4,true) AS result',
        [createHash('sha256').update(code,'ascii').digest(),kind,operation,visitor]);
      await client.query('COMMIT');
      if(row.result.state==='limited') throw new HttpException('Tracking rate limit',429);
      if(row.result.state==='unavailable') throw new BadRequestException();
      if(!row.result.touchId) throw new Error('Invalid tracking receipt');
      return row.result.touchId;
    } catch(error) {
      await client.query('ROLLBACK');
      const code=(error as {code?:string}).code;
      if(code==='22023') throw new BadRequestException();
      if(code==='23505') throw new ConflictException();
      throw error;
    } finally {client.release();}
  }
}
