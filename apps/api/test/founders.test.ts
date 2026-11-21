import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('member and cafe founder cohorts keep permanent badges separate from temporary benefits',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_founder_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});let db:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);await migrate(db);const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const member=await user();
    const make=async(audience:'member'|'cafe',options:{active?:boolean,closed?:boolean,qualificationClosed?:boolean}={})=>{
      const {rows:[p]}=await pool.query('INSERT INTO founder_programs(audience,active) VALUES($1,$2) RETURNING id',[audience,options.active??false]);
      const {rows:[v]}=await pool.query(`INSERT INTO founder_program_versions(program_id,audience,version,qualification_starts_at,qualification_ends_at,enrollment_starts_at,enrollment_ends_at,benefits_ends_at)
        VALUES($1,$2,1,clock_timestamp()-interval '1 day',CASE WHEN $4 THEN clock_timestamp()-interval '1 hour' ELSE clock_timestamp()+interval '1 hour' END,
          clock_timestamp()-interval '1 hour',CASE WHEN $3 THEN clock_timestamp()-interval '1 minute' ELSE clock_timestamp()+interval '1 hour' END,
          clock_timestamp()+interval '1 day') RETURNING benefits_ends_at::text`,[p.id,audience,options.closed??false,options.qualificationClosed??false]);
      return {...p,...v};
    };
    await t.test('member enrollment is once per program, replayable and does not expire its badge',async()=>{
      const enroll='SELECT public.enroll_member_founder($1,$2,$3,$4) AS id';
      const inactive=await make('member');
      await assert.rejects(pool.query(enroll,[member,inactive.id,1,randomUUID()]),{code:'22023'});
      const p=await make('member',{active:true}),args=[member,p.id,1,randomUUID()];
      const results=await Promise.all([pool.query(enroll,args),pool.query(enroll,args)]);
      assert.deepEqual(results[0].rows,results[1].rows);
      await assert.rejects(pool.query(enroll,[member,p.id,1,randomUUID()]),{code:'23505'});
      await assert.rejects(pool.query(enroll,[await user(),p.id,1,args[3]]),{code:'23505'});
      const read='SELECT * FROM public.inspect_member_founder($1,$2,$3)';
      const current=(await pool.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
      assert.deepEqual((await pool.query(read,[member,p.id,current])).rows,[{badge:true,benefits:true}]);
      assert.deepEqual((await pool.query(read,[member,p.id,p.benefits_ends_at])).rows,[{badge:true,benefits:false}]);
      assert.deepEqual((await pool.query(read,[member,p.id,'2001-01-01T00:00:00Z'])).rows,[{badge:false,benefits:false}]);
      await pool.query('UPDATE founder_programs SET active=false WHERE id=$1',[p.id]);
      assert.deepEqual((await pool.query(enroll,args)).rows,results[0].rows);
      assert.deepEqual((await pool.query(read,[member,p.id,current])).rows,[{badge:true,benefits:false}]);
      for(const sql of ['UPDATE member_founder_badges SET version=version','DELETE FROM member_founder_badges','TRUNCATE member_founder_badges'])
        await assert.rejects(pool.query(sql),{code:'55000'});
      for(const options of [{closed:true},{qualificationClosed:true}]){
        const outside=await make('member',{active:true,...options});
        await assert.rejects(pool.query(enroll,[await user(),outside.id,1,randomUUID()]),{code:'22023'});
      }
    });
    await t.test('cafe founder eligibility requires live verified ownership and independent cohort policy',async()=>{
      const owner=await user();
      const {rows:[cafe]}=await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test',$1) RETURNING id",[randomUUID()]);
      const {rows:[branch]}=await pool.query("INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST','TEST','TEST') RETURNING id",[cafe.id]);
      const p=await make('cafe',{active:true}),enroll='SELECT public.enroll_cafe_founder($1,$2,$3,$4) AS id';
      await assert.rejects(pool.query(enroll,[cafe.id,p.id,1,randomUUID()]),{code:'42501'});
      const {rows:[claim]}=await pool.query("INSERT INTO ownership_claims(user_id,cafe_id,branch_id,decision) VALUES($1,$2,$3,'verified') RETURNING id",[owner,cafe.id,branch.id]);
      const {rows:[membership]}=await pool.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner') RETURNING id",[owner,cafe.id]);
      const {rows:[grant]}=await pool.query('INSERT INTO ownership_access_grants(claim_id,cafe_id,membership_id) VALUES($1,$2,$3) RETURNING id',[claim.id,cafe.id,membership.id]);
      const args=[cafe.id,p.id,1,randomUUID()];
      const race=await Promise.allSettled([pool.query(enroll,args),pool.query(enroll,[cafe.id,p.id,1,randomUUID()])]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await pool.query('SELECT 1 FROM cafe_founder_badges WHERE cafe_id=$1',[cafe.id])).rowCount,1);
      assert.deepEqual((await pool.query('SELECT * FROM public.inspect_cafe_founder($1,$2,$3)',[cafe.id,p.id,p.benefits_ends_at])).rows,[{badge:true,benefits:false}]);
      const next=await make('cafe',{active:true});
      await pool.query('UPDATE ownership_access_grants SET revoked_at=clock_timestamp(),membership_id=NULL WHERE id=$1',[grant.id]);
      await assert.rejects(pool.query(enroll,[cafe.id,next.id,1,randomUUID()]),{code:'42501'});
      assert.equal((await pool.query('SELECT 1 FROM cafe_founder_badges WHERE cafe_id=$1',[cafe.id])).rowCount,1);
      assert.deepEqual((await pool.query('SELECT * FROM public.inspect_cafe_founder($1,$2,clock_timestamp())',[cafe.id,p.id])).rows,[{badge:true,benefits:false}]);
      for(const sql of ['UPDATE founder_program_versions SET version=version','DELETE FROM founder_program_versions','TRUNCATE founder_program_versions CASCADE'])
        await assert.rejects(pool.query(sql),{code:'55000'});
    });
    await t.test('deleted members retain the journaled badge but lose temporary benefit eligibility',async()=>{
      const who=await user(),p=await make('member',{active:true});
      await pool.query('SELECT public.enroll_member_founder($1,$2,1,$3)',[who,p.id,randomUUID()]);
      await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[who]);
      assert.deepEqual((await pool.query('SELECT * FROM public.inspect_member_founder($1,$2,clock_timestamp())',[who,p.id])).rows,[{badge:true,benefits:false}]);
    });
    await t.test('runtime cannot enroll or inspect founder records and loyalty journals stay untouched',async()=>{
      const p=await make('member',{active:true}),client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query('SELECT public.enroll_member_founder($1,$2,1,$3)',[member,p.id,randomUUID()]),{code:'42501'});await client.query('ROLLBACK');
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query('SELECT * FROM public.inspect_member_founder($1,$2,clock_timestamp())',[member,p.id]),{code:'42501'});await client.query('ROLLBACK');
        }
      } finally {await client.query('ROLLBACK');client.release();}
      for(const table of ['star_entries','stamp_entries','tier_entries']) assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0);
    });
  } finally {
    await db?.end();if(created) for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19)throw error;await delay(50);}
    }
    await host.end();
  }
});
