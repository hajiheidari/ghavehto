import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {SessionService} from '../src/nest/sessions.js';
import {createApp} from '../src/nest/app.js';
import {startWebPanel} from './web-panel.js';

test('private experience preview uses actual verified sessions and restricted owner scope through Next and Nest',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),suffix=randomBytes(8).toString('hex');
  const database='gh_preview_'+suffix,login='gh_preview_actor_'+suffix;
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined,runtime:pg.Pool|undefined,server:Awaited<ReturnType<typeof createApp>>|undefined;
  let created=false,roleCreated=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);
    const password=randomBytes(24).toString('hex');
    await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);roleCreated=true;
    await host.query(`GRANT ghahvehto_identity,ghahvehto_app TO ${login}`);
    base.username=login;base.password=password;
    runtime=new pg.Pool({connectionString:base.toString(),max:3});
    const user=async()=>(await db!.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const owner=await user(),staff=await user(),consumer=await user();
    const sessions=new SessionService(runtime);
    const ownerSession=await sessions.issue(owner),staffSession=await sessions.issue(staff),consumerSession=await sessions.issue(consumer);
    const {rows:[cafe,foreign]}=await db.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test',$1),('TEST private other','test',$2) RETURNING id",[randomUUID(),randomUUID()]);
    const {rows:[branch]}=await db.query("INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST branch','TEST','TEST') RETURNING id",[cafe.id]);
    await db.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,NULL,'owner'),($3,$2,$4,'staff')",[owner,cafe.id,staff,branch.id]);
    const {rows:[experience]}=await db.query("INSERT INTO experiences(cafe_id,title) VALUES($1,'TEST <b>تجربهٔ خصوصی</b>') RETURNING id",[cafe.id]);
    await db.query(`INSERT INTO experience_versions(experience_id,cafe_id,version,branch_id,starts_at,ends_at,first_recorded_visit_only,per_member_limit,budget_units_per_claim)
      VALUES($1,$2,1,$3,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true,1,2)`,[experience.id,cafe.id,branch.id]);
    await db.query('INSERT INTO experience_capacity VALUES($1,$2,1,3,3,9007199254740993,9007199254740993)',[experience.id,cafe.id]);
    server=await createApp({runtimePool:runtime});await server.app.listen(0,'127.0.0.1');const api=await server.app.getUrl();
    const path=`/v1/cafes/${cafe.id}/experiences`;
    const request=(path:string,token?:string)=>fetch(api+path,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    assert.equal((await request(path)).status,401);
    assert.equal((await fetch(api+path,{headers:{'x-user-id':owner}})).status,401);
    for(const token of [staffSession.accessToken,consumerSession.accessToken]) assert.equal((await request(path,token)).status,404);
    assert.equal((await request(`/v1/cafes/${foreign.id}/experiences`,ownerSession.accessToken)).status,404);
    assert.equal((await request(path+'?after=invalid',ownerSession.accessToken)).status,400);
    const response=await request(path,ownerSession.accessToken);assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('vary')??'',/Authorization/);
    const data=await response.json();assert.equal(data.items.length,1);
    assert.equal(data.items[0].experienceId,experience.id);assert.equal(data.items[0].remainingBudgetUnits,'9007199254740993');
    assert.equal(data.items[0].active,false);assert.equal(data.items[0].branchName,'TEST branch');assert.equal(data.nextCursor,null);
    const web=await startWebPanel(api);
    try {
      assert.equal((await fetch(web.url+'/dashboard/participation?operation='+randomUUID())).status,404);
      const page=(token?:string)=>fetch(`${web.url}/dashboard/cafe/${cafe.id}/experiences`,{headers:token?{Cookie:`__Host-ghahvehto-access=${token}`}:{}});
      const ownerPage=await (await page(ownerSession.accessToken)).text();
      assert.match(ownerPage,/dir="rtl"/);assert.ok(ownerPage.includes('TEST &lt;b&gt;تجربهٔ خصوصی&lt;/b&gt;'));
      assert.ok(ownerPage.includes('بودجهٔ مشارکت باقی‌مانده'));assert.ok(ownerPage.includes(new Intl.NumberFormat('fa-IR').format(9007199254740993n)));
      assert.equal(ownerPage.includes(ownerSession.accessToken),false);assert.equal(ownerPage.includes('<b>تجربهٔ خصوصی</b>'),false);
      const denied=await (await page(staffSession.accessToken)).text();
      assert.ok(denied.includes('مجوز مالک ندارید'));assert.equal(denied.includes('TEST &lt;b&gt;'),false);
      assert.ok((await (await page()).text()).includes('به ورود معتبر نیاز دارید'));
    } finally {await web.close();}
    // Seed only disposable test policies to exercise actual bounded pagination.
    for(let i=0;i<51;i++){
      const {rows:[x]}=await db.query('INSERT INTO experiences(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
      await db.query(`INSERT INTO experience_versions(experience_id,cafe_id,version,starts_at,ends_at,first_recorded_visit_only,per_member_limit,budget_units_per_claim)
        VALUES($1,$2,1,clock_timestamp(),clock_timestamp()+interval '1 hour',false,1,0)`,[x.id,cafe.id]);
      await db.query('INSERT INTO experience_capacity VALUES($1,$2,1,1,1,0,0)',[x.id,cafe.id]);
    }
    const first=await (await request(path,ownerSession.accessToken)).json();assert.equal(first.items.length,50);assert.ok(first.nextCursor);
    const second=await (await request(path+'?after='+first.nextCursor,ownerSession.accessToken)).json();assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);
    assert.equal(new Set([...first.items,...second.items].map(row=>row.experienceId)).size,52);
    await db.query('DELETE FROM cafe_memberships WHERE cafe_id=$1 AND user_id=$2',[cafe.id,owner]);
    assert.equal((await request(path,ownerSession.accessToken)).status,404);
    const client=await runtime.connect();
    try {
      await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_app');
      assert.equal((await client.query('SELECT public.read_owner_experiences($1,NULL) AS page',[cafe.id])).rows[0].page,null);
      await assert.rejects(client.query('SELECT * FROM experience_claims'),{code:'42501'});
    } finally {await client.query('ROLLBACK');client.release();}
  } finally {
    await server?.app.close();await runtime?.end();await db?.end();
    if(created) for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19)throw error;await delay(50);}
    }
    if(roleCreated)await host.query(`DROP ROLE ${login}`);await host.end();
  }
});
