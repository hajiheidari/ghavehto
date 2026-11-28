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
    const a=await user(),b=await user(),c=await user(),empty=await user(),sessions=new SessionService(pool);
    const [own,other,funded,unused]=await Promise.all([sessions.issue(a),sessions.issue(b),sessions.issue(c),sessions.issue(empty)]);
    const budget=(await pool.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(5,5,true) RETURNING id')).rows[0].id;
    await pool.query('SELECT public.award_funded_stars($1,$2,$3,5,NULL)',[c,budget,randomUUID()]);
    await pool.query("SELECT public.spend_funded_stars($1,$2,2,'TEST summary debit')",[c,randomUUID()]);
    await pool.query('SELECT public.award_tier_points($1,$2,5,clock_timestamp())',[c,randomUUID()]);
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
    const summary=(token:string,query='')=>fetch(path+'/summary'+query,{headers:{authorization:'Bearer '+token}});
    assert.equal((await fetch(path+'/summary')).status,401);
    assert.equal((await summary(own.accessToken,'?year=1999')).status,400);
    assert.equal((await summary(own.accessToken,'?year=2026&userId='+b)).status,400);
    assert.equal((await summary(own.accessToken,'?asOf=2020-01-01')).status,400);
    const knownResponse=await summary(funded.accessToken);
    assert.equal(knownResponse.headers.get('cache-control'),'no-store');
    const known=await knownResponse.json();
    assert.equal(known.stars.availableUnits,'3');assert.equal(known.tier.points,'5');
    assert.equal(known.tier.year,new Date(known.asOf).getUTCFullYear());
    const unknown=await (await summary(own.accessToken)).json();
    assert.equal(unknown.stars.availableUnits,null,'Legacy journal totals must not become an available balance');
    assert.equal(unknown.tier.points,unknown.tier.year===2026?'7':'0');
    assert.equal((await (await summary(own.accessToken,'?year=2000')).json()).tier.points,'0');
    const zero=await (await summary(unused.accessToken)).json();
    assert.deepEqual(zero.stars,{availableUnits:'0'});assert.equal(zero.tier.points,'0');
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
    const stampQuery=new URLSearchParams({cafeId:cafe,programId:program,version:'1'});
    const stampSummary=(token=own.accessToken,query=stampQuery)=>fetch(path+'/stamp-summary?'+query,{headers:{authorization:'Bearer '+token}});
    const programHistory=(query=stampQuery,token=own.accessToken)=>request('ledger=stamp&'+query,token);
    const firstStampResponse=await stampSummary();
    assert.equal(firstStampResponse.status,200);assert.equal(firstStampResponse.headers.get('cache-control'),'no-store');
    const firstStamp=await firstStampResponse.json();
    assert.equal(firstStamp.availableUnits,'2');assert.equal(firstStamp.stampsRequired,5);
    assert.equal((await stampSummary(other.accessToken)).status,404);
    assert.equal((await stampSummary(own.accessToken,new URLSearchParams({cafeId:cafe,programId:randomUUID(),version:'1'}))).status,404);
    assert.equal((await stampSummary(own.accessToken,new URLSearchParams({...Object.fromEntries(stampQuery),userId:b}))).status,400);
    assert.equal((await stampSummary(own.accessToken,new URLSearchParams({...Object.fromEntries(stampQuery),version:'2147483648'}))).status,400);
    assert.equal((await programHistory(stampQuery,other.accessToken)).status,404);
    assert.equal((await programHistory(new URLSearchParams({...Object.fromEntries(stampQuery),version:'99'}))).status,404);
    assert.equal((await request('ledger=stamp&cafeId='+cafe)).status,400);
    assert.equal((await request('ledger=star&'+stampQuery)).status,400);
    assert.equal((await (await programHistory()).json()).items[0].id,stamp);
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
        if(ledger==='star') assert.ok(html.includes('ماندهٔ ستاره فعلاً قابل‌نمایش نیست'));
        if(ledger==='tier') assert.ok(html.includes('سال احراز میلادی'));
      }
      assert.equal((await get('ledger=__proto__',own.accessToken)).status,404);
      assert.equal((await get('ledger=star&after=bad',own.accessToken)).status,404);
      assert.match(await (await get('ledger=stamp',other.accessToken)).text(),/هنوز سابقه‌ای/);
      assert.match(await (await get('ledger=star',funded.accessToken)).text(),/ستارهٔ معتبر در زمان بررسی/);
      const stampHtml=await (await fetch(web.url+'/dashboard/loyalty/stamp?'+stampQuery,{headers:{Cookie:'__Host-ghahvehto-access='+own.accessToken}})).text();
      assert.match(stampHtml,/مهر معتبر در زمان بررسی/);assert.match(stampHtml,/مهر لازم در این نسخه/);
      assert.ok(!stampHtml.includes(own.accessToken));
      const scopedHtml=await (await fetch(web.url+'/dashboard/loyalty/stamp/history?'+stampQuery,
        {headers:{Cookie:'__Host-ghahvehto-access='+own.accessToken}})).text();
      assert.match(scopedHtml,/سوابق مهر این برنامه/);assert.match(scopedHtml,/دریافت/);
      assert.ok(!scopedHtml.includes('قابل‌نمایش نیستند'));assert.ok(!scopedHtml.includes(own.accessToken));
    } finally {await web.close();}
    await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,2,8)',[program,cafe]);
    const newerVersion=(await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,2,$4,8,'award','TEST separate version',clock_timestamp()) RETURNING id`,[a,cafe,program,randomUUID()])).rows[0].id;
    assert.equal((await (await stampSummary()).json()).availableUnits,'2','Program versions must never share a balance');
    await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      VALUES($1,$2,$3,1,$4,4,'award','TEST expired stamp',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day')`,[a,cafe,program,randomUUID()]);
    assert.equal((await (await stampSummary()).json()).availableUnits,'2');
    const spentStamp=(await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,$4,-1,'spend','TEST allocated stamp',clock_timestamp()) RETURNING id`,[a,cafe,program,randomUUID()])).rows[0].id;
    await pool.query('INSERT INTO stamp_spend_allocations(debit_id,award_id,units) VALUES($1,$2,1)',[spentStamp,stamp]);
    assert.equal((await (await stampSummary()).json()).availableUnits,'1');
    await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,$4,-1,'spend','TEST unsupported legacy stamp',clock_timestamp())`,[a,cafe,program,randomUUID()]);
    assert.equal((await (await stampSummary()).json()).availableUnits,null);
    const versionTwo=new URLSearchParams({...Object.fromEntries(stampQuery),version:'2'});
    assert.equal((await (await stampSummary(own.accessToken,versionTwo)).json()).availableUnits,'8');
    const tamperedForeign=(await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,2,$4,-1,'spend','TEST foreign allocation',clock_timestamp()) RETURNING id`,[b,cafe,program,randomUUID()])).rows[0].id;
    await pool.query('INSERT INTO stamp_spend_allocations(debit_id,award_id,units) VALUES($1,$2,1)',[tamperedForeign,newerVersion]);
    assert.equal((await (await stampSummary(own.accessToken,versionTwo)).json()).availableUnits,null);
    await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,3,5)',[program,cafe]);
    const scopedIds:string[]=[];
    for(let index=0;index<21;index++) scopedIds.push((await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,
      units,kind,reason,effective_at,recorded_at) VALUES($1,$2,$3,3,$4,1,'award','TEST scoped history',clock_timestamp(),'2020-01-01T00:00:00.123456Z') RETURNING id`,
      [a,cafe,program,randomUUID()])).rows[0].id);
    scopedIds.sort().reverse();
    const versionThree=new URLSearchParams({...Object.fromEntries(stampQuery),version:'3'});
    const scopedResponse=await programHistory(versionThree);
    assert.equal(scopedResponse.status,200);assert.equal(scopedResponse.headers.get('cache-control'),'no-store');
    const scopedFirst=await scopedResponse.json();
    assert.deepEqual(scopedFirst.items.map((row:{id:string})=>row.id),scopedIds.slice(0,20));
    assert.equal(scopedFirst.nextCursor,scopedIds[19]);
    assert.ok(scopedFirst.items.every((row:{programVersion:number;cafeId:string;programId:string})=>row.programVersion===3&&row.cafeId===cafe&&row.programId===program));
    const scopedLast=await (await programHistory(new URLSearchParams({...Object.fromEntries(versionThree),after:scopedFirst.nextCursor}))).json();
    assert.deepEqual(scopedLast.items.map((row:{id:string})=>row.id),[scopedIds[20]]);assert.equal(scopedLast.nextCursor,null);
    assert.equal((await programHistory(new URLSearchParams({...Object.fromEntries(versionThree),after:stamp}))).status,400);
    assert.equal((await programHistory(new URLSearchParams({...Object.fromEntries(versionThree),after:foreign}))).status,400);
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
    assert.equal((await summary(own.accessToken)).status,401);
    assert.equal((await stampSummary()).status,401);
    assert.equal((await programHistory()).status,401);
    await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[b]);
    assert.equal((await request('ledger=star',other.accessToken)).status,401);
  } finally {
    await server?.app.close();await runtime?.end();await db?.end();
    if(created) await dropDisposableDatabase(host,database);
    if(roleCreated) await host.query('DROP ROLE '+login);
    await host.end();
  }
});
