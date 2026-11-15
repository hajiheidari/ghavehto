import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('internal agent leases fence stale workers, honor pause and bound retries without external effects',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_agents_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});let pool:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    pool=new pg.Pool({connectionString:base.toString()});await migrate(pool);await migrate(pool);const db=pool;
    assert.equal((await db.query('SELECT 1 FROM agent_controls')).rowCount,0,'No agent is configured or enabled by migration');
    await db.query("INSERT INTO agent_controls(kind) VALUES('discovery'),('research'),('content'),('outreach')");
    const enqueue='SELECT public.enqueue_agent_job($1,$2,$3) AS id';
    const lease='SELECT public.lease_agent_job($1,$2,$3) AS receipt';
    const transition='SELECT public.transition_agent_lease($1,$2,$3,$4,$5) AS accepted';
    const worker=randomUUID();
    const queue=async(kind='research')=>(await db.query(enqueue,[kind,randomUUID(),{source:'TEST disposable, untrusted source'}])).rows[0].id as string;
    const take=async(kind='research',who=worker)=>(await db.query(lease,[kind,who,60])).rows[0].receipt as {jobId:string;leaseToken:string;attempt:number}|null;
    const move=async(job:NonNullable<Awaited<ReturnType<typeof take>>>,action:string,output:object|null=null,who=worker)=>(await db.query(transition,[job.jobId,who,job.leaseToken,action,output])).rows[0].accepted;
    await t.test('operation replay is exact, all four controls default paused, and costs stay zero',async()=>{
      const operation=randomUUID(),args=['research',operation,{query:'TEST'}];
      const r=await Promise.all([db.query(enqueue,args),db.query(enqueue,args)]);assert.deepEqual(r[0].rows,r[1].rows);
      await assert.rejects(db.query(enqueue,['research',operation,{query:'CHANGED'}]),{code:'23505'});
      for(const kind of ['discovery','research','content','outreach']) assert.equal(await take(kind),null);
      await assert.rejects(db.query('UPDATE agent_jobs SET cost_units=1'),{code:'23514'});
      await db.query("SELECT public.pause_agent('research',false,'TEST start internal research')");
      const job=await take();assert.ok(job);
      assert.equal(await move(job,'complete',{draft:'TEST synthetic draft'}),true);
      assert.equal((await db.query('SELECT state FROM agent_jobs WHERE id=$1',[job.jobId])).rows[0].state,'awaiting_review');
      assert.equal(await move(job,'complete',{draft:'TEST synthetic draft'}),false);
      await assert.rejects(db.query(transition,[job.jobId,worker,job.leaseToken,'execute',{}]),{code:'22023'});
    });
    await t.test('competing workers cannot own the same job and stale tokens cannot finish or heartbeat',async()=>{
      const id=await queue(),other=randomUUID();
      const receipts=await Promise.all([take(),take('research',other)]);assert.equal(receipts.filter(Boolean).length,1);
      const first=receipts.find(Boolean)!;assert.equal(first.jobId,id);
      const firstWorker=receipts[0]?worker:other;
      assert.equal(await move({...first,leaseToken:randomUUID()},'heartbeat',null,firstWorker),false);
      await db.query("UPDATE agent_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
      const next=await take();assert.ok(next);assert.equal(next.attempt,2);assert.notEqual(first.leaseToken,next.leaseToken);
      for(const action of ['heartbeat','complete','transient']) assert.equal(await move(first,action,action==='complete'?{}:null,firstWorker),false);
      assert.equal(await move(next,'heartbeat'),true);
      await db.query("SELECT public.pause_agent('research',true,'TEST pause active job')");
      assert.equal(await move(next,'complete',{}),false);assert.equal(await take(),null);
      await db.query("SELECT public.pause_agent('research',false,'TEST resume')");
      assert.equal(await move(next,'complete',{draft:'TEST needs human review'}),true);
    });
    await t.test('SKIP LOCKED avoids blocked jobs, backoff and expiry stop at the attempt limit',async()=>{
      const first=await queue(),second=await queue(),lock=await db.connect();
      try {
        await lock.query('BEGIN');await lock.query('SELECT 1 FROM agent_jobs WHERE id=$1 FOR UPDATE',[first]);
        const receipt=await take();assert.ok(receipt);assert.equal(receipt.jobId,second);assert.equal(await move(receipt,'complete',{}),true);
      }finally{await lock.query('ROLLBACK');lock.release();}
      let receipt=await take();assert.ok(receipt);assert.equal(receipt.jobId,first);
      assert.equal(await move(receipt,'transient'),true);assert.equal(await take(),null);
      const state=(await db.query('SELECT state,available_at>clock_timestamp() AS delayed FROM agent_jobs WHERE id=$1',[first])).rows[0];
      assert.deepEqual(state,{state:'retry_wait',delayed:true});
      for(let attempt=2;attempt<=3;attempt++){
        await db.query("UPDATE agent_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[first]);
        receipt=await take();assert.ok(receipt);assert.equal(receipt.attempt,attempt);
        assert.equal(await move(receipt,'transient'),true);
      }
      assert.equal((await db.query('SELECT state FROM agent_jobs WHERE id=$1',[first])).rows[0].state,'dead');
      assert.equal(await take(),null);
      await db.query("UPDATE agent_controls SET attempt_limit=1 WHERE kind='research'");
      const abandoned=await queue(),last=await take();assert.ok(last);assert.equal(last.jobId,abandoned);
      await db.query("UPDATE agent_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[abandoned]);
      assert.equal(await take(),null);
      assert.deepEqual((await db.query('SELECT state,failure_code FROM agent_jobs WHERE id=$1',[abandoned])).rows,[{state:'dead',failure_code:'lease_expired'}]);
    });
    await t.test('ordinary runtime capabilities cannot queue, lease, transition or inspect agent work',async()=>{
      const client=await db.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity','ghahvehto_tracking']){
          for(const [sql,args] of [[enqueue,['outreach',randomUUID(),{}]],[lease,['outreach',worker,60]],
            [transition,[randomUUID(),worker,randomUUID(),'complete',{}]],['SELECT * FROM agent_jobs',[]]] as const){
            await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
            await assert.rejects(client.query(sql,[...args]),{code:'42501'});await client.query('ROLLBACK');
          }
        }
      }finally{await client.query('ROLLBACK');client.release();}
      assert.equal((await db.query('SELECT 1 FROM agent_jobs WHERE cost_units<>0')).rowCount,0);
      for(const table of ['star_entries','tier_entries','stamp_entries']) assert.equal((await db.query(`SELECT 1 FROM ${table}`)).rowCount,0);
    });
  }finally {
    await pool?.end();if(created)for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19)throw error;await delay(50);}
    }
    await host.end();
  }
});
