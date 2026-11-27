import assert from 'node:assert/strict';
import {dropDisposableDatabase} from './disposable-database.js';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {createApp} from '../src/nest/app.js';
import {SessionService} from '../src/nest/sessions.js';
import {startWebPanel} from './web-panel.js';

test('private in-app preferences use live user scope, exact state retry and audited optimistic updates',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),suffix=randomBytes(8).toString('hex');
  const database='gh_preferences_'+suffix,login='gh_preferences_'+suffix,password=randomBytes(24).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined,runtime:pg.Pool|undefined,server:Awaited<ReturnType<typeof createApp>>|undefined;
  let created=false,roleCreated=false;
  try {
    await host.query('CREATE DATABASE '+database);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);await migrate(db);
    const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(48)])).rows[0].id as string;
    const a=await user(),b=await user(),sessions=new SessionService(pool);
    const [first,foreign]=await Promise.all([sessions.issue(a),sessions.issue(b)]);
    await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);roleCreated=true;
    await host.query(`GRANT ghahvehto_preferences TO ${login}`);
    base.username=login;base.password=password;
    runtime=new pg.Pool({connectionString:base.toString()});
    await assert.rejects(createApp({preferencesPool:pool}),/Dedicated restricted/);
    const standard=await createApp();
    try {
      await standard.app.listen(0,'127.0.0.1');
      assert.equal((await fetch((await standard.app.getUrl())+'/v1/internal/preferences')).status,404);
    } finally {await standard.app.close();}
    server=await createApp({preferencesPool:runtime});await server.app.listen(0,'127.0.0.1');
    const api=await server.app.getUrl(),path=api+'/v1/internal/preferences';
    const request=(token?:string,body?:object)=>fetch(path,{method:body?'PUT':'GET',headers:{
      ...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal((await request()).status,401);
    const initial={revision:0,loyalty:false,experiences:false,editorial:false,dailyLimit:0};
    assert.deepEqual(await (await request(first.accessToken)).json(),initial);
    assert.equal((await pool.query('SELECT 1 FROM notification_preferences')).rowCount,0);
    const change={expectedRevision:0,loyalty:true,experiences:false,editorial:false,dailyLimit:3};
    assert.equal((await request(first.accessToken,{...change,userId:b})).status,400);
    assert.equal((await request(first.accessToken,{...change,dailyLimit:0})).status,400);
    const duplicates=await Promise.all([request(first.accessToken,change),request(first.accessToken,change)]);
    for(const response of duplicates){
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(await response.json(),{...initial,revision:1,loyalty:true,dailyLimit:3});
    }
    assert.deepEqual(await (await request(foreign.accessToken)).json(),initial);
    assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='notifications.preferences_changed'",[a])).rowCount,1);
    const races=await Promise.all([
      request(first.accessToken,{...change,expectedRevision:1,experiences:true}),
      request(first.accessToken,{...change,expectedRevision:1,editorial:true}),
    ]);
    assert.deepEqual(races.map(response=>response.status).sort(),[200,409]);
    assert.equal((await request(first.accessToken,{...change,expectedRevision:0,dailyLimit:4})).status,409);
    const web=await startWebPanel(api,false,false,false,true);
    try {
      const html=await (await fetch(web.url+'/dashboard/preferences',{headers:{Cookie:'__Host-ghahvehto-access='+first.accessToken}})).text();
      assert.match(html,/اعلان‌های درون‌برنامه‌ای/);
      assert.ok(!html.includes(first.accessToken));
      const form=new URLSearchParams({expectedRevision:'2',loyalty:'false',experiences:'false',editorial:'false',dailyLimit:'0'});
      const submit=(origin:string)=>fetch(web.url+'/dashboard/preferences/change',{method:'POST',redirect:'manual',
        headers:{Cookie:'__Host-ghahvehto-access='+first.accessToken,Origin:origin},body:form});
      assert.equal((await submit('https://foreign.invalid')).status,403);
      assert.match((await submit('https://panel.example.test')).headers.get('location')??'',/result=saved/);
      assert.deepEqual(await (await request(first.accessToken)).json(),{...initial,revision:3});
    } finally {await web.close();}
    const restricted=await runtime.connect();
    try {
      await restricted.query('BEGIN');await restricted.query('SET LOCAL ROLE ghahvehto_preferences');
      await assert.rejects(restricted.query('SELECT * FROM users'),{code:'42501'});
      await restricted.query('ROLLBACK');
      await restricted.query('BEGIN');await restricted.query('SET LOCAL ROLE ghahvehto_preferences');
      await assert.rejects(restricted.query('SELECT * FROM notification_preferences'),{code:'42501'});
    } finally {await restricted.query('ROLLBACK');restricted.release();}
    await sessions.revoke(first.accessToken);
    assert.equal((await request(first.accessToken)).status,401);
  } finally {
    await server?.app.close();await runtime?.end();await db?.end();
    if(created) await dropDisposableDatabase(host,database);
    if(roleCreated) await host.query('DROP ROLE '+login);
    await host.end();
  }
});
