import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('cafe attribution counts touches, verified identity and confirmed interactions separately',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_tracking_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});let db:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);await migrate(db);const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const owner=await user(),preexisting=await user();
    const {rows:[cafe]}=await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test',$1) RETURNING id",[randomUUID()]);
    const {rows:[branch,other]}=await pool.query("INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST A','TEST','TEST'),($1,'TEST B','TEST','TEST') RETURNING id",[cafe.id]);
    const {rows:[claim]}=await pool.query("INSERT INTO ownership_claims(user_id,cafe_id,branch_id,decision) VALUES($1,$2,$3,'verified') RETURNING id",[owner,cafe.id,branch.id]);
    const {rows:[membership]}=await pool.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner') RETURNING id",[owner,cafe.id]);
    const {rows:[grant]}=await pool.query('INSERT INTO ownership_access_grants(claim_id,cafe_id,membership_id) VALUES($1,$2,$3) RETURNING id',[claim.id,cafe.id,membership.id]);
    const link=async(active=true,expired=false)=>{
      const hash=randomBytes(32);
      const {rows:[l]}=await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
        VALUES($1,$2,$3,$4,clock_timestamp()+CASE WHEN $5 THEN interval '-1 hour' ELSE interval '1 hour' END,3600) RETURNING id`,
        [cafe.id,branch.id,hash,active,expired]);return {...l,hash};
    };
    const touch='SELECT public.record_cafe_tracking_touch($1,$2,$3) AS id';
    const attribute='SELECT public.attribute_cafe_tracking_registration($1,$2)';
    const interact='SELECT public.attribute_cafe_tracking_interaction($1,$2)';
    const metrics='SELECT * FROM public.inspect_cafe_tracking_metrics($1)';
    const proof=async(who:string,where=branch.id)=>{
      const {rows:[program]}=await pool.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
      await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,5)',[program.id,cafe.id]);
      const {rows:[qr]}=await pool.query('SELECT public.issue_stamp_qr($1,$2,$3,$4,1) AS token',[who,cafe.id,where,program.id]);
      return (await pool.query('SELECT public.consume_stamp_qr($1,$2,$3) AS id',[owner,where,qr.token])).rows[0].id as string;
    };
    const main=await link();
    await t.test('touch replay is exact and never accepts installation or verification claims',async()=>{
      const args=[main.hash,'qr_scan',randomUUID()];
      const results=await Promise.all([pool.query(touch,args),pool.query(touch,args)]);
      assert.deepEqual(results[0].rows,results[1].rows);
      await assert.rejects(pool.query(touch,[main.hash,'store_click',args[2]]),{code:'23505'});
      for(const kind of ['install','registration','phone_verified','interaction_confirmed'])
        await assert.rejects(pool.query(touch,[main.hash,kind,randomUUID()]),{code:'22023'});
      await pool.query(touch,[main.hash,'store_click',randomUUID()]);
      assert.deepEqual((await pool.query(metrics,[main.id])).rows,[{qr_scans:'1',store_clicks:'1',registrations:'0',phone_verifications:'0',confirmed_interactions:'0'}]);
    });
    await t.test('identity facts derive from a new verified account and confirmed QR, with no inferred installs',async()=>{
      const {rows:[scan]}=await pool.query(touch,[main.hash,'qr_scan',randomUUID()]);
      await assert.rejects(pool.query(attribute,[preexisting,scan.id]),{code:'22023'});
      const who=await user();
      await Promise.all([pool.query(attribute,[who,scan.id]),pool.query(attribute,[who,scan.id])]);
      const otherLink=await link(),{rows:[otherTouch]}=await pool.query(touch,[otherLink.hash,'qr_scan',randomUUID()]);
      await assert.rejects(pool.query(attribute,[who,otherTouch.id]),{code:'23505'});
      const wrongBranchProof=await proof(who,other.id);
      await assert.rejects(pool.query(interact,[who,wrongBranchProof]),{code:'22023'});
      await assert.rejects(pool.query(interact,[who,randomUUID()]),{code:'22023'});
      const confirmed=await proof(who);
      await Promise.all([pool.query(interact,[who,confirmed]),pool.query(interact,[who,confirmed])]);
      assert.deepEqual((await pool.query(metrics,[main.id])).rows,[{qr_scans:'2',store_clicks:'1',registrations:'1',phone_verifications:'1',confirmed_interactions:'1'}]);
      assert.deepEqual((await pool.query('SELECT fact FROM cafe_tracking_identity_facts WHERE user_id=$1 ORDER BY fact',[who])).rows,[{fact:'phone_verified'},{fact:'registration'}]);
      for(const sql of ['UPDATE cafe_tracking_touches SET kind=kind','DELETE FROM cafe_tracking_identity_facts','TRUNCATE cafe_tracking_interactions'])
        await assert.rejects(pool.query(sql),{code:'55000'});
      await assert.rejects(pool.query('UPDATE cafe_tracking_links SET attribution_window_seconds=7200 WHERE id=$1',[main.id]),{code:'55000'});
    });
    await t.test('late registration and genuine interaction outside the configured attribution window stay unattributed',async()=>{
      const l=await link();
      // Disposable historical evidence; public touch callers cannot supply a timestamp.
      const {rows:[old]}=await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at)
        VALUES($1,$2,'qr_scan',clock_timestamp()-interval '2 hours') RETURNING id`,[l.id,randomUUID()]);
      await assert.rejects(pool.query(attribute,[await user(),old.id]),{code:'22023'});
      const {rows:[historical]}=await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,created_at,phone_verified_at)
        VALUES($1,$2,clock_timestamp()-interval '119 minutes',clock_timestamp()-interval '118 minutes') RETURNING id`,[randomBytes(32),randomBytes(32)]);
      await pool.query(attribute,[historical.id,old.id]);
      const lateProof=await proof(historical.id);
      await assert.rejects(pool.query(interact,[historical.id,lateProof]),{code:'22023'});
      assert.deepEqual((await pool.query(metrics,[l.id])).rows,[{qr_scans:'1',store_clicks:'0',registrations:'1',phone_verifications:'1',confirmed_interactions:'0'}]);
    });
    await t.test('expired, inactive and ownership-revoked links reject new touches; runtime cannot forge facts',async()=>{
      for(const l of [await link(false),await link(true,true)]) await assert.rejects(pool.query(touch,[l.hash,'qr_scan',randomUUID()]),{code:'22023'});
      const l=await link();
      await pool.query('UPDATE ownership_access_grants SET revoked_at=clock_timestamp(),membership_id=NULL WHERE id=$1',[grant.id]);
      await assert.rejects(pool.query(touch,[l.hash,'qr_scan',randomUUID()]),{code:'22023'});
      const client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          for(const [sql,args] of [[touch,[l.hash,'qr_scan',randomUUID()]],[attribute,[owner,randomUUID()]],[interact,[owner,randomUUID()]],[metrics,[main.id]]] as const){
            await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
            await assert.rejects(client.query(sql,[...args]),{code:'42501'});await client.query('ROLLBACK');
          }
        }
      } finally {await client.query('ROLLBACK');client.release();}
      for(const table of ['star_entries','tier_entries']) assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0);
    });
  } finally {
    await db?.end();if(created) for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19)throw error;await delay(50);}
    }
    await host.end();
  }
});
