import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {createApp} from '../src/nest/app.js';
import {migrate} from '../src/nest/migrations.js';
import {SessionService} from '../src/nest/sessions.js';

test('real HTTP QR consumption awards exactly one stamp under concurrent scans',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL);
  const suffix=randomBytes(8).toString('hex');
  const database='gh_qr_'+suffix,login='gh_qr_actor_'+suffix;
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined,runtime:pg.Pool|undefined,server:Awaited<ReturnType<typeof createApp>>|undefined;
  let databaseCreated=false,loginCreated=false;
  try {
    // Isolate the append-only journal without disabling its triggers for cleanup.
    await host.query(`CREATE DATABASE ${database}`);
    databaseCreated=true;
    base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});
    await migrate(db);
    const password=randomBytes(24).toString('hex');
    await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
    loginCreated=true;
    await host.query(`GRANT ghahvehto_identity,ghahvehto_app TO ${login}`);
    base.username=login;base.password=password;
    runtime=new pg.Pool({connectionString:base.toString(),max:4});
    const {rows:[customer,staff]}=await db.query(
      "INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at) VALUES($1,$2,now()),($3,$4,now()) RETURNING id",
      [randomBytes(32),randomBytes(32),randomBytes(32),randomBytes(32)]);
    const {rows:[cafe]}=await db.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test','test') RETURNING id");
    const {rows:[branch,other]}=await db.query(
      "INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST A','TEST','TEST'),($1,'TEST B','TEST','TEST') RETURNING id",[cafe.id]);
    const {rows:[program]}=await db.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
    await db.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,10)',[program.id,cafe.id]);
    await db.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff')",[staff.id,cafe.id,branch.id]);
    const sessions=new SessionService(runtime);
    const customerSession=await sessions.issue(customer.id),staffSession=await sessions.issue(staff.id);
    const secondStaffSession=await sessions.issue(staff.id);
    server=await createApp({runtimePool:runtime,enableStampQr:true});
    await server.app.listen(0,'127.0.0.1');
    const url=await server.app.getUrl();
    const post=(action:string,token:string,body:object)=>fetch(`${url}/v1/stamp-qr/${action}`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
    });
    const issued=await post('issue',customerSession.accessToken,{cafeId:cafe.id,branchId:branch.id,programId:program.id,version:1});
    assert.equal(issued.status,201);
    assert.equal(issued.headers.get('cache-control'),'no-store');
    const {qr}=await issued.json() as {qr:string};
    assert.match(qr,/^[0-9a-f]{64}$/);
    assert.equal((await post('consume',staffSession.accessToken,{branchId:other.id,qr})).status,400);
    const scans=await Promise.all([staffSession,secondStaffSession].map(
      session=>post('consume',session.accessToken,{branchId:branch.id,qr})));
    assert.deepEqual(scans.map(r=>r.status).sort(),[201,400]);
    const {entryId}=await scans.find(r=>r.status===201)!.json() as {entryId:string};
    assert.deepEqual((await db.query('SELECT id,user_id,award_actor_id,units FROM stamp_entries')).rows,
      [{id:entryId,user_id:customer.id,award_actor_id:staff.id,units:1}]);
    assert.deepEqual((await db.query('SELECT entry_id FROM stamp_qr_tokens')).rows,[{entry_id:entryId}]);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_awarded'")).rowCount,1);
    const {rows:[soon,later,expired]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),6,'award','TEST soon',now(),now()+interval '1 hour'),
            ($1,$2,$3,1,gen_random_uuid(),5,'award','TEST later',now(),now()+interval '2 hours'),
            ($1,$2,$3,1,gen_random_uuid(),100,'award','TEST expired',now()-interval '2 hours',now()-interval '1 hour')
      RETURNING id`,[customer.id,cafe.id,program.id]);
    const {rows:rewards}=await db.query<{id:string}>(`INSERT INTO stamp_rewards(cafe_id,program_id,program_version,stock,active)
      VALUES($1,$2,1,1,true),($1,$2,1,1,true) RETURNING id`,[cafe.id,program.id]);
    const sql='SELECT public.redeem_stamp_reward($1,$2,$3) AS id';
    const redeem=async (rewardId:string,operation:string)=>{
      const client=await db!.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_stamp_redeemer');
        const {rows:[row]}=await client.query<{id:string}>(sql,[customer.id,rewardId,operation]);
        await client.query('COMMIT');
        return row.id;
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    };
    const attempts=rewards.map(({id})=>({id,operation:randomUUID()}));
    const results=await Promise.allSettled(attempts.map(a=>redeem(a.id,a.operation)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const winner=results.findIndex(r=>r.status==='fulfilled');
    const won=results[winner],lost=results[1-winner];
    assert.equal(won.status,'fulfilled');
    assert.equal(lost.status,'rejected');
    assert.equal(lost.reason.code,'22023');
    assert.equal(await redeem(attempts[winner].id,attempts[winner].operation),won.value);
    await assert.rejects(redeem(attempts[1-winner].id,attempts[winner].operation),{code:'23505'});
    assert.deepEqual((await db.query('SELECT stock FROM stamp_rewards ORDER BY stock')).rows,[{stock:0},{stock:1}]);
    assert.deepEqual((await db.query("SELECT units FROM stamp_entries WHERE kind='spend'")).rows,[{units:-10}]);
    const allocations=(await db.query('SELECT award_id,units FROM stamp_spend_allocations')).rows;
    assert.equal(allocations.length,2);
    assert.equal(allocations.find(row=>row.award_id===soon.id)?.units,6);
    assert.equal(allocations.find(row=>row.award_id===later.id)?.units,4);
    assert.equal(allocations.some(row=>row.award_id===expired.id),false);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_redeemed'")).rowCount,1);
    await assert.rejects(runtime.query(sql,[customer.id,attempts[winner].id,randomUUID()]),{code:'42501'});
    await assert.rejects(runtime.query('SELECT * FROM stamp_spend_allocations'),{code:'42501'});
    await assert.rejects(db.query('UPDATE stamp_spend_allocations SET units=1'),{code:'55000'});
    await assert.rejects(db.query('DELETE FROM stamp_spend_allocations'),{code:'55000'});
    await assert.rejects(db.query('TRUNCATE stamp_spend_allocations'),{code:'55000'});
  } finally {
    try {
      await server?.app.close();
      await runtime?.end();
      await db?.end();
      if(databaseCreated) {
        // PostgreSQL can still be processing the pools' disconnects.
        for(let attempt=0;;attempt++){
          try {await host.query(`DROP DATABASE ${database}`);break;}
          catch(error){
            if((error as pg.DatabaseError).code!=='55006'||attempt>=19) throw error;
            await delay(50);
          }
        }
      }
      if(loginCreated) await host.query(`DROP ROLE ${login}`);
    } finally {await host.end();}
  }
});
