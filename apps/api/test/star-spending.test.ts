import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('funded stars serialize spending, allocate valid lots and preserve independent journals',async t=>{
  assert.ok(process.env.DATABASE_URL,'DATABASE_URL is required');
  const base=new URL(process.env.DATABASE_URL);
  const database='gh_stars_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined;
  let created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;
    base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});
    await migrate(db);
    await migrate(db);
    const pool=db;
    const user=async()=> (await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const {rows:[budget]}=await db.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(100,100,true) RETURNING id');
    const award=async(who:string,amount:number,expiry:string|null=null)=>(await pool.query(
      'SELECT public.award_funded_stars($1,$2,$3,$4,$5) AS id',[who,budget.id,randomUUID(),amount,expiry])).rows[0].id;
    const spend='SELECT public.spend_funded_stars($1,$2,$3,$4) AS id';
    const balance=async(who:string,at:string|null=null)=>(await pool.query(
      'SELECT public.inspect_funded_star_balance($1,coalesce($2::timestamptz,clock_timestamp())) AS units',[who,at])).rows[0].units;

    await t.test('competing debits cannot overspend; retry and historical expiry balances remain exact',async()=>{
      const who=await user();
      const expiry=(await pool.query("SELECT (clock_timestamp()+interval '1 hour')::text AS at")).rows[0].at;
      const permanent=await award(who,4);
      const expiring=await award(who,3,expiry);
      const before=(await pool.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
      const args=[who,randomUUID(),5,'TEST internal debit'];
      const race=await Promise.allSettled([pool.query(spend,args),pool.query(spend,[who,randomUUID(),5,args[3]])]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      const winner=race.find(r=>r.status==='fulfilled');
      assert.ok(winner?.status==='fulfilled');
      const debit=winner.value.rows[0].id;
      const {rows:[entry]}=await pool.query('SELECT operation_id FROM star_entries WHERE id=$1',[debit]);
      const retry=[who,entry.operation_id,5,args[3]];
      const repeats=await Promise.all([pool.query(spend,retry),pool.query(spend,retry)]);
      for(const result of repeats) assert.equal(result.rows[0].id,debit);
      for(const conflict of [[who,entry.operation_id,4,args[3]],[who,entry.operation_id,5,'TEST changed reason'],
        [await user(),entry.operation_id,5,args[3]]]) await assert.rejects(pool.query(spend,conflict),{code:'23505'});
      assert.deepEqual((await pool.query('SELECT award_id,units FROM star_spend_allocations WHERE debit_id=$1 ORDER BY units',[debit])).rows,
        [{award_id:permanent,units:2},{award_id:expiring,units:3}]);
      assert.equal(await balance(who),'2');
      assert.equal(await balance(who,before),'7');
      assert.equal(await balance(who,expiry),'2');
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='loyalty.stars_spent'")).rowCount,1);
      assert.equal((await pool.query('SELECT 1 FROM stamp_entries')).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM tier_entries')).rowCount,0);
      assert.equal((await pool.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows[0].remaining_units,93);
      assert.equal(await balance(await user()),'0');
      for(const sql of ['UPDATE star_spend_allocations SET units=1','DELETE FROM star_spend_allocations','TRUNCATE star_spend_allocations'])
        await assert.rejects(pool.query(sql),{code:'55000'});
    });

    await t.test('expiry is checked after waiting for the account lock; failure leaves no debit',async()=>{
      const who=await user(),operation=randomUUID();
      const lock=await pool.connect();
      try {
        await lock.query('BEGIN');
        await lock.query("SELECT pg_advisory_xact_lock(hashtextextended('star-balance:'||$1,0))",[who]);
        const expiry=(await pool.query("SELECT (clock_timestamp()+interval '1.5 seconds')::text AS at")).rows[0].at;
        await award(who,2,expiry);
        const attempt=pool.query(spend,[who,operation,1,'TEST expired while waiting']);
        const rejected=assert.rejects(attempt,{code:'22023'});
        await delay(1700);
        await lock.query('COMMIT');
        await rejected;
        assert.equal(await balance(who),'0');
        assert.equal((await pool.query('SELECT 1 FROM star_entries WHERE operation_id=$1',[operation])).rowCount,0);
      } finally {await lock.query('ROLLBACK');lock.release();}
    });

    await t.test('expired remainder is recorded once, without changing balances or funding',async()=>{
      const who=await user();
      // Evidence-backed synthetic history lives only in this disposable database.
      const {rows:[lot]}=await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at,expires_at,funding_budget_id)
        VALUES($1,gen_random_uuid(),5,'award','TEST historical lot',clock_timestamp()-interval '2 hours',
          clock_timestamp()-interval '1 hour',$2) RETURNING id`,[who,budget.id]);
      const {rows:[debit]}=await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
        VALUES($1,gen_random_uuid(),-2,'spend','TEST historical debit',clock_timestamp()-interval '90 minutes') RETURNING id`,[who]);
      await pool.query('INSERT INTO star_spend_allocations(debit_id,award_id,units) VALUES($1,$2,2)',[debit.id,lot.id]);
      const valid=await award(who,4);
      const fundingBefore=(await pool.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows;
      assert.equal(await balance(who),'4');
      const expiry='SELECT public.expire_funded_star_award($1,$2,$3) AS id';
      await assert.rejects(pool.query(expiry,[who,valid,randomUUID()]),{code:'22023'});
      await assert.rejects(pool.query(expiry,[await user(),lot.id,randomUUID()]),{code:'22023'});
      const args=[who,lot.id,randomUUID()];
      const results=await Promise.all([pool.query(expiry,args),pool.query(expiry,args)]);
      assert.deepEqual(results[0].rows,results[1].rows);
      await assert.rejects(pool.query(expiry,[who,valid,args[2]]),{code:'23505'});
      await assert.rejects(pool.query(expiry,[who,lot.id,randomUUID()]),{code:'22023'});
      const entry=results[0].rows[0].id;
      assert.deepEqual((await pool.query('SELECT units,kind FROM star_entries WHERE id=$1',[entry])).rows,[{units:-3,kind:'expire'}]);
      assert.equal(await balance(who),'4');
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='loyalty.stars_expired'")).rowCount,1);
      assert.deepEqual((await pool.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows,fundingBefore);
      await pool.query(spend,[who,randomUUID(),4,'TEST spend after expiry recording']);
      assert.equal(await balance(who),'0');
      for(const sql of ['UPDATE star_expiry_records SET units=1','DELETE FROM star_expiry_records','TRUNCATE star_expiry_records'])
        await assert.rejects(pool.query(sql),{code:'55000'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_app');
        await assert.rejects(client.query(expiry,args),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
    });

    await t.test('legacy history, invalid parameters, deleted accounts and runtime access fail closed',async()=>{
      const who=await user();await award(who,3);
      await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
        VALUES($1,gen_random_uuid(),-1,'spend','TEST unsupported legacy',clock_timestamp())`,[who]);
      assert.equal(await balance(who),null);
      await assert.rejects(pool.query(spend,[who,randomUUID(),1,'TEST legacy']),{code:'22023'});
      for(const amount of [0,-1,null]) await assert.rejects(pool.query(spend,[who,randomUUID(),amount,'TEST invalid']),{code:'22023'});
      await assert.rejects(pool.query(spend,[who,randomUUID(),1,'  ']),{code:'22023'});
      await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[who]);
      await assert.rejects(pool.query(spend,[who,randomUUID(),1,'TEST deleted']),{code:'42501'});
      const client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query(spend,[who,randomUUID(),1,'TEST denied']),{code:'42501'});
          await client.query('ROLLBACK');
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query('SELECT * FROM star_spend_allocations'),{code:'42501'});
          await client.query('ROLLBACK');
        }
      } finally {await client.query('ROLLBACK');client.release();}
    });
  } finally {
    await db?.end();
    if(created) {
      // Pool shutdown can resolve before the backend has processed disconnects.
      for(let attempt=0;;attempt++){
        try {await host.query(`DROP DATABASE ${database}`);break;}
        catch(error){
          if((error as pg.DatabaseError).code!=='55006'||attempt>=19) throw error;
          await delay(50);
        }
      }
    }
    await host.end();
  }
});
