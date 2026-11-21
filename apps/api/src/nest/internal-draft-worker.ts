import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';

type DraftKind='research'|'content';
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** Deterministic intake only: source instructions stay text, no tools/network/AI. */
export function prepareInternalDraft(kind:DraftKind,payload:unknown):Record<string,unknown> {
  if(!record(payload)||typeof payload.title!=='string'||payload.title.trim().length<1||payload.title.length>160
    ||typeof payload.body!=='string'||payload.body.trim().length<1||payload.body.length>50000
    ||!Array.isArray(payload.sources)||payload.sources.length<1||payload.sources.length>50) throw new TypeError('Invalid draft intake');
  const sources=payload.sources.map((source:unknown)=>{
    if(!record(source)||!['original','permitted'].includes(String(source.rights))) throw new TypeError('Source evidence required');
    if(source.rights==='permitted') {
      if(typeof source.url!=='string') throw new TypeError('Source URL required');
      const url=new URL(source.url);
      if(url.protocol!=='https:'||url.username||url.password) throw new TypeError('Invalid source URL');
    }
    return source;
  });
  const output={type:kind==='content'?'editorial_intake':'research_intake',title:payload.title.trim(),body:payload.body,
    sources,requiresHumanReview:true,externalEffectsEnabled:false};
  if(Buffer.byteLength(JSON.stringify(output),'utf8')>60000) throw new TypeError('Draft intake too large');
  return output;
}

export class InternalDraftWorker {
  private readonly worker=randomUUID();
  constructor(private readonly pool:Pool) {}
  async validateRuntime():Promise<void> {
    const {rows:[row]}=await this.pool.query(`SELECT NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)
      AND current_user=session_user AND pg_has_role(session_user,'ghahvehto_worker','MEMBER')
      AND NOT pg_has_role(session_user,'ghahvehto_worker','USAGE')
      AND NOT pg_has_role(session_user,'ghahvehto_identity','MEMBER')
      AND NOT pg_has_role(session_user,'ghahvehto_app','MEMBER')
      AND NOT pg_has_role(session_user,'ghahvehto_tracking','MEMBER')
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND pg_has_role(session_user,c.relowner,'MEMBER')) AS allowed
      FROM pg_roles r WHERE rolname=session_user`);
    if(!row?.allowed) throw new Error('Dedicated restricted draft worker login required');
  }
  private async query<T>(sql:string,values:unknown[]):Promise<T> {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_worker');
      const {rows:[row]}=await client.query<{result:T}>(sql,values);await client.query('COMMIT');return row.result;
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }
  async once(kind:DraftKind):Promise<'idle'|'awaiting_review'|'invalid_input'|'lease_lost'> {
    if(!['research','content'].includes(kind)) throw new TypeError('External agent adapters are disabled');
    const lease=await this.query<{jobId:string;leaseToken:string;payload:unknown}|null>(
      'SELECT public.lease_internal_draft($1,$2) AS result',[kind,this.worker]);
    if(!lease) return 'idle';
    let output:Record<string,unknown>;
    try {output=prepareInternalDraft(kind,lease.payload);}
    catch(error) {
      if(!(error instanceof TypeError)) throw error;
      const accepted=await this.query<boolean>('SELECT public.fail_internal_draft($1,$2,$3) AS result',[lease.jobId,this.worker,lease.leaseToken]);
      return accepted?'invalid_input':'lease_lost';
    }
    const accepted=await this.query<boolean>('SELECT public.finish_internal_draft($1,$2,$3,$4) AS result',[lease.jobId,this.worker,lease.leaseToken,output]);
    return accepted?'awaiting_review':'lease_lost';
  }
}
