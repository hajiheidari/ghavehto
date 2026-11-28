import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {createApp} from '../src/nest/app.js';
import {SessionService} from '../src/nest/sessions.js';
import {dropDisposableDatabase} from './disposable-database.js';
import {startWebPanel} from './web-panel.js';

test('private reward receipt recovery reads historical units and cancellation without granting redemption or fulfillment',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const url=new URL(process.env.DATABASE_URL),suffix=randomBytes(8).toString('hex');
  const database='gh_history_'+suffix,login='gh_receipts_'+suffix,password=randomBytes(24).toString('hex');
  const host=new pg.Pool({connectionString:url.toString()});
  let db:pg.Pool|undefined,runtime:pg.Pool|undefined,server:Awaited<ReturnType<typeof createApp>>|undefined;
  let created=false,roleCreated=false;
  try {
    await host.query('CREATE DATABASE '+database);created=true;url.pathname='/'+database;
    db=new pg.Pool({connectionString:url.toString()});await migrate(db);await migrate(db);
    const pool=db;
    const user=async()=>(await pool.query('INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at) VALUES($1,$2,clock_timestamp()) RETURNING id',
      [randomBytes(32),randomBytes(48)])).rows[0].id as string;
    const a=await user(),b=await user(),empty=await user(),sessions=new SessionService(pool);
    const [own,other,unused]=await Promise.all([sessions.issue(a),sessions.issue(b),sessions.issue(empty)]);
    const budget=(await pool.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(50,50,true) RETURNING id')).rows[0].id;
    for(const actor of [a,b]) await pool.query('SELECT public.award_funded_stars($1,$2,$3,25,NULL)',[actor,budget,randomUUID()]);
    const reward=(await pool.query('INSERT INTO star_rewards(cost,stock,active) VALUES(1,30,true) RETURNING id')).rows[0].id;
    const operations:string[]=[],receipts:string[]=[];
    for(let index=0;index<21;index++) {
      const operation=randomUUID();operations.push(operation);
      receipts.push((await pool.query('SELECT public.redeem_star_reward($1,$2,$3) AS id',[a,reward,operation])).rows[0].id);
    }
    assert.equal((await pool.query('SELECT public.redeem_star_reward($1,$2,$3) AS id',[a,reward,operations[0]])).rows[0].id,receipts[0]);
    const foreignOperation=randomUUID();
    const foreign=(await pool.query('SELECT public.redeem_star_reward($1,$2,$3) AS id',[b,reward,foreignOperation])).rows[0].id;
    await pool.query("SELECT public.cancel_star_reservation($1,$2,$3,'TEST PRIVATE CANCELLATION REASON')",[a,receipts[0],randomUUID()]);
    const cafe=(await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST RECEIPT','test receipt',$1) RETURNING id",[randomUUID()])).rows[0].id;
    const program=(await pool.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe])).rows[0].id;
    await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,1)',[program,cafe]);
    await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,$4,2,'award','TEST receipt source',clock_timestamp())`,[a,cafe,program,randomUUID()]);
    const stampReward=(await pool.query('INSERT INTO stamp_rewards(cafe_id,program_id,program_version,stock,active) VALUES($1,$2,1,1,true) RETURNING id',[cafe,program])).rows[0].id;
    // The two independent journals may use the same operation UUID without mixing receipts.
    const stampOperation=operations[1],stampReceipt=(await pool.query('SELECT public.redeem_stamp_reward($1,$2,$3) AS id',[a,stampReward,stampOperation])).rows[0].id;
    await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);roleCreated=true;
    await host.query(`GRANT ghahvehto_loyalty_reader TO ${login}`);
    url.username=login;url.password=password;runtime=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:2000});
    server=await createApp({loyaltyReaderPool:runtime});await server.app.listen(0,'127.0.0.1');
    const api=await server.app.getUrl(),root=api+'/v1/internal/loyalty-history';
    const get=(path:string,token=own.accessToken)=>fetch(root+path,{headers:{authorization:'Bearer '+token}});
    const recover=(ledger:string,operation:string,token=own.accessToken)=>get('/reservation?'+new URLSearchParams({ledger,operationId:operation}),token);
    assert.equal((await fetch(root+'/reservations?ledger=star')).status,401);
    assert.equal((await get('/reservations?ledger=tier')).status,400);
    assert.equal((await get('/reservations?ledger=star&userId='+b)).status,400);
    assert.equal((await get('/reservations?ledger=star&after='+foreign)).status,400);
    assert.equal((await get('/reservations?ledger=star&after='+stampReceipt)).status,400);
    assert.equal((await recover('star',foreignOperation)).status,404);
    assert.equal((await recover('star',randomUUID())).status,404);
    assert.equal((await recover('stamp',operations[0])).status,404);
    assert.equal((await (await recover('star',stampOperation)).json()).id,receipts[1]);
    const firstResponse=await get('/reservations?ledger=star');
    assert.equal(firstResponse.headers.get('cache-control'),'no-store');
    const first=await firstResponse.json();
    assert.deepEqual(first.items.map((row:{id:string})=>row.id),receipts.slice(1).reverse());
    assert.equal(first.nextCursor,receipts[1]);
    await pool.query('SELECT public.redeem_star_reward($1,$2,$3)',[a,reward,randomUUID()]);
    await pool.query('UPDATE star_rewards SET cost=77,active=false WHERE id=$1',[reward]);
    const last=await (await get('/reservations?ledger=star&after='+first.nextCursor)).json();
    assert.equal(last.items.length,1);assert.equal(last.items[0].id,receipts[0]);assert.equal(last.nextCursor,null);
    assert.equal(last.items[0].state,'cancelled');assert.ok(last.items[0].cancellationId);assert.ok(last.items[0].cancelledAt);
    const exact=await (await recover('star',operations[0])).json();
    assert.deepEqual(exact,last.items[0]);assert.equal(exact.reservedUnits,1,'Use immutable debit, not current reward cost');
    assert.ok(!JSON.stringify(exact).includes('TEST PRIVATE CANCELLATION REASON'));
    assert.ok(!('operationId' in exact));assert.ok(!('stock' in exact));assert.ok(!('fulfilled' in exact));
    const stamp=await (await recover('stamp',stampOperation)).json();
    assert.equal(stamp.id,stampReceipt);assert.equal(stamp.cafeId,cafe);assert.equal(stamp.programId,program);
    assert.equal(stamp.reservedUnits,1);assert.equal(stamp.state,'reserved');assert.equal(stamp.cancellationId,null);
    assert.deepEqual(await (await get('/reservations?ledger=star',unused.accessToken)).json(),{ledger:'star',items:[],nextCursor:null});
    const snapshot=async()=>(await pool.query(`SELECT (SELECT sum(units)::text FROM star_entries) AS star_units,
      (SELECT sum(units)::text FROM stamp_entries) AS stamp_units,(SELECT count(*)::int FROM tier_entries) AS tier_entries,
      (SELECT count(*)::int FROM audit_events) AS audits,(SELECT count(*)::int FROM star_redemptions) AS reservations,
      (SELECT stock FROM star_rewards WHERE id=$1) AS stock`,[reward])).rows[0];
    const before=await snapshot();
    const web=await startWebPanel(api,false,false,false,false,true);
    try {
      assert.match(await (await fetch(web.url+'/dashboard/loyalty/reservations')).text(),/نشست معتبر/);
      const page=(query:string,token=own.accessToken)=>fetch(web.url+'/dashboard/loyalty/reservations?'+query,
        {headers:{Cookie:'__Host-ghahvehto-access='+token}});
      const html=await (await page('ledger=star&operation='+operations[0])).text();
      assert.ok(html.includes(receipts[0]));assert.match(html,/رزرو لغوشده/);assert.match(html,/پرداخت واقعی/);
      assert.ok(!html.includes(own.accessToken));assert.ok(!html.includes('TEST PRIVATE CANCELLATION REASON'));
      const stampHtml=await (await page('ledger=stamp')).text();assert.ok(stampHtml.includes(stampReceipt));assert.match(stampHtml,/دفتر مهر این برنامه/);
      assert.match(await (await page('ledger=star')).text(),/رسیدهای قدیمی‌تر/);
      assert.equal((await page('ledger=tier')).status,404);
      assert.equal((await page('ledger=star&operation=bad')).status,404);
      assert.match(await (await page('ledger=star&operation='+operations[0],other.accessToken)).text(),/قابل‌نمایش نیستند/);
    } finally {await web.close();}
    assert.deepEqual(await snapshot(),before,'Reading/recovering must not mutate accounting, stock or audit');
    const restricted=await runtime.connect();
    try {
      await restricted.query('BEGIN');await restricted.query('SET LOCAL ROLE ghahvehto_loyalty_reader');
      assert.equal((await restricted.query("SELECT has_function_privilege(current_user,'public.redeem_star_reward(uuid,uuid,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
      assert.equal((await restricted.query("SELECT has_function_privilege(current_user,'public.redeem_stamp_reward(uuid,uuid,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
      await assert.rejects(restricted.query('SELECT * FROM private_reward_receipts'),{code:'42501'});
    } finally {await restricted.query('ROLLBACK');restricted.release();}
    await sessions.revoke(own.accessToken);
    assert.equal((await recover('star',operations[0])).status,401);
    await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[b]);
    assert.equal((await recover('star',foreignOperation,other.accessToken)).status,401);
  } finally {
    await server?.app.close();await runtime?.end();await db?.end();
    if(created) await dropDisposableDatabase(host,database);
    if(roleCreated) await host.query('DROP ROLE '+login);
    await host.end();
  }
});
