import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
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
  } finally {
    try {
      await server?.app.close();
      await runtime?.end();
      await db?.end();
      if(databaseCreated) await host.query(`DROP DATABASE ${database} WITH (FORCE)`);
      if(loginCreated) await host.query(`DROP ROLE ${login}`);
    } finally {await host.end();}
  }
});
