import assert from 'node:assert/strict';
import {dropDisposableDatabase} from './disposable-database.js';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {createApp} from '../src/nest/app.js';
import {SessionService} from '../src/nest/sessions.js';
import {startWebPanel} from './web-panel.js';

test('private loyalty history keeps all three immutable journals separate and scoped to a live member',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const url=new URL(process.env.DATABASE_URL),suffix=randomBytes(8).toString('hex');
  const database='gh_history_'+suffix,login='gh_history_'+suffix,password=randomBytes(24).toString('hex');
  const host=new pg.Pool({connectionString:url.toString()});
  let db:pg.Pool|undefined,runtime:pg.Pool|undefined,server:Awaited<ReturnType<typeof createApp>>|undefined;
  let created=false,roleCreated=false;
  try {
    await host.query('CREATE DATABASE '+database);created=true;url.pathname='/'+database;
    db=new pg.Pool({connectionString:url.toString()});await migrate(db);await migrate(db);
    const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(48)])).rows[0].id as string;
    const a=await user(),b=await user(),sessions=new SessionService(pool);
    const [own,other]=await Promise.all([sessions.issue(a),sessions.issue(b)]);
    const cafe=(await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST HISTORY','test history',$1) RETURNING id",[randomUUID()])).rows[0].id;
    const program=(await pool.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe])).rows[0].id;
    await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,5)',[program,cafe]);
    const stamp=(await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,$4,2,'award','TEST PRIVATE STAFF REASON',clock_timestamp()) RETURNING id`,[a,cafe,program,randomUUID()])).rows[0].id;
    const tier=(await pool.query(`INSERT INTO tier_entries(user_id,qualification_year,operation_id,units,kind,reason,effective_at)
      VALUES($1,2026,$2,7,'award','TEST PRIVATE STAFF REASON',clock_timestamp()) RETURNING id`,[a,randomUUID()])).rows[0].id;
    const stars:string[]=[];
    for(let index=0;index<21;index++) stars.push((await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at,expires_at,recorded_at)
      VALUES($1,$2,3,'award','TEST PRIVATE STAFF REASON',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day','2026-01-01T00:00:00Z') RETURNING id`,[a,randomUUID()])).rows[0].id);
    stars.sort().reverse();
    const foreign=(await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,9,'award','TEST FOREIGN',clock_timestamp()) RETURNING id`,[b,randomUUID()])).rows[0].id;
    await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);roleCreated=true;
    await host.query(`GRANT ghahvehto_loyalty_reader TO ${login}`);
    url.username=login;url.password=password;runtime=new pg.Pool({connectionString:url.toString()});
    await assert.rejects(createApp({loyaltyReaderPool:pool}),/Dedicated restricted/);
    const standard=await createApp();
    try {
      await standard.app.listen(0,'127.0.0.1');
      assert.equal((await fetch((await standard.app.getUrl())+'/v1/internal/loyalty-history?ledger=star')).status,404);
    } finally {await standard.app.close();}
    server=await createApp({loyaltyReaderPool:runtime});await server.app.listen(0,'127.0.0.1');
    const api=await server.app.getUrl(),path=api+'/v1/internal/loyalty-history';
    const request=(query:string,token:string|undefined=own.accessToken)=>fetch(path+'?'+query,{headers:token?{authorization:'Bearer '+token}:{}});
    assert.equal((await fetch(path+'?ledger=star')).status,401);
    assert.equal((await request('ledger=unknown')).status,400);
    assert.equal((await request('ledger=star&userId='+b)).status,400);
    assert.equal((await request('ledger=star&after=bad')).status,400);
    assert.equal((await request('ledger=star&after='+foreign)).status,400);
    assert.equal((await request('ledger=star&after='+stamp)).status,400);
    const response=await request('ledger=star');
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const first=await response.json() as {ledger:string;items:{id:string;units:number;expiresAt:string}[];nextCursor:string|null};
    assert.equal(first.ledger,'star');assert.deepEqual(first.items.map(row=>row.id),stars.slice(0,20));
    assert.equal(first.nextCursor,stars[19]);
    assert.equal(first.items[0].units,3);assert.ok(Date.parse(first.items[0].expiresAt)<Date.now());
    assert.ok(!JSON.stringify(first).includes('TEST PRIVATE STAFF REASON'));
    assert.ok(!('balance' in first));
    const newer=(await pool.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,1,'award','TEST NEW',clock_timestamp()) RETURNING id`,[a,randomUUID()])).rows[0].id;
    const rest=await (await request('ledger=star&after='+first.nextCursor)).json();
    assert.deepEqual(rest.items.map((row:{id:string})=>row.id),[stars[20]]);assert.equal(rest.nextCursor,null);
    assert.ok(!rest.items.some((row:{id:string})=>row.id===newer));
    const stampPage=await (await request('ledger=stamp')).json();
    assert.equal(stampPage.items[0].id,stamp);assert.equal(stampPage.items[0].cafeId,cafe);
    assert.equal(stampPage.items[0].programId,program);assert.equal(stampPage.items[0].programVersion,1);
    const tierPage=await (await request('ledger=tier')).json();
    assert.equal(tierPage.items[0].id,tier);assert.equal(tierPage.items[0].qualificationYear,2026);
    assert.deepEqual(await (await request('ledger=stamp',other.accessToken)).json(),{ledger:'stamp',items:[],nextCursor:null});
    const otherStars=await (await request('ledger=star',other.accessToken)).json();
    assert.deepEqual(otherStars.items.map((row:{id:string})=>row.id),[foreign]);
    const web=await startWebPanel(api,false,false,false,false,true);
    try {
      const get=(query:string,token?:string)=>fetch(web.url+'/dashboard/loyalty?'+query,{headers:token?{Cookie:'__Host-ghahvehto-access='+token}:{}});
      assert.match(await (await get('ledger=star')).text(),/نشست معتبر/);
      for(const [ledger,label] of [['stamp','مهرهای کافه'],['star','ستاره‌های قابل‌خرج'],['tier','امتیاز عضویت']]) {
        const page=await get('ledger='+ledger,own.accessToken),html=await page.text();
        assert.equal(page.status,200);assert.match(html,/noindex/);assert.ok(html.includes(label));
        assert.ok(!html.includes(own.accessToken));assert.ok(!html.includes('TEST PRIVATE STAFF REASON'));
        assert.ok(!html.includes('تاریخچه فعلاً در دسترس نیست'));
        if(ledger==='stamp') assert.ok(html.includes(cafe));
        if(ledger==='star') assert.ok(html.includes('سوابق قدیمی‌تر'));
        if(ledger==='tier') assert.ok(html.includes('سال احراز میلادی'));
      }
      assert.equal((await get('ledger=__proto__',own.accessToken)).status,404);
      assert.equal((await get('ledger=star&after=bad',own.accessToken)).status,404);
      assert.match(await (await get('ledger=stamp',other.accessToken)).text(),/هنوز سابقه‌ای/);
    } finally {await web.close();}
    for(const table of ['stamp_entries','star_entries','tier_entries']) {
      await assert.rejects(pool.query('DELETE FROM '+table),{code:'55000'});
      const client=await runtime.connect();
      try {
        await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_loyalty_reader');
        await assert.rejects(client.query('SELECT * FROM '+table),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
    }
    await sessions.revoke(own.accessToken);
    assert.equal((await request('ledger=star')).status,401);
    await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[b]);
    assert.equal((await request('ledger=star',other.accessToken)).status,401);
  } finally {
    await server?.app.close();await runtime?.end();await db?.end();
    if(created) await dropDisposableDatabase(host,database);
    if(roleCreated) await host.query('DROP ROLE '+login);
    await host.end();
  }
});
