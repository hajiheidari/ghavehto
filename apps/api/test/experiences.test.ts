import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('private experience policies enforce verified ownership, scope, dates and independent capacity',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_experience_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);await migrate(db);
    const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const owner=await user(),member=await user();
    const {rows:[cafe,unclaimed]}=await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test',$1),('TEST other','test',$2) RETURNING id",[randomUUID(),randomUUID()]);
    const {rows:[branch,other,foreign]}=await pool.query("INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST A','TEST','TEST'),($1,'TEST B','TEST','TEST'),($2,'TEST X','TEST','TEST') RETURNING id",[cafe.id,unclaimed.id]);
    const {rows:[claim]}=await pool.query("INSERT INTO ownership_claims(user_id,cafe_id,branch_id,decision) VALUES($1,$2,$3,'verified') RETURNING id",[owner,cafe.id,branch.id]);
    const {rows:[membership]}=await pool.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner') RETURNING id",[owner,cafe.id]);
    const {rows:[grant]}=await pool.query('INSERT INTO ownership_access_grants(claim_id,cafe_id,membership_id) VALUES($1,$2,$3) RETURNING id',[claim.id,cafe.id,membership.id]);
    const at=(await pool.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
    const make=async(options:{first?:boolean,active?:boolean,stock?:number,budget?:number,cafe?:string,branch?:string|null}={})=>{
      const scope=options.cafe??cafe.id;
      const {rows:[experience]}=await pool.query('INSERT INTO experiences(cafe_id,active) VALUES($1,$2) RETURNING id',[scope,options.active??false]);
      const {rows:[v]}=await pool.query(`INSERT INTO experience_versions(experience_id,cafe_id,version,branch_id,starts_at,ends_at,first_recorded_visit_only,per_member_limit,budget_units_per_claim)
        VALUES($1,$2,1,$3,$4::timestamptz-interval '1 hour',$4::timestamptz+interval '1 hour',$5,1,2) RETURNING starts_at::text,ends_at::text`,
        [experience.id,scope,options.branch??null,at,options.first??false]);
      await pool.query(`INSERT INTO experience_capacity(experience_id,cafe_id,version,stocked_units,remaining_stock,funded_budget_units,remaining_budget_units)
        VALUES($1,$2,1,$3,$3,$4,$4)`,[experience.id,scope,options.stock??2,options.budget??4]);
      return {...experience,...v};
    };
    const inspect='SELECT public.inspect_experience_eligibility($1,$2,1,$3,$4) AS status';
    const eligibility=async(experience:string,who=member,where=branch.id,when=at)=>(await pool.query(inspect,[who,experience,where,when])).rows[0].status;
    await t.test('default inactive, half-open dates, branch scopes and funded capacity are enforced',async()=>{
      const inactive=await make();assert.equal(await eligibility(inactive.id),'scope_unavailable');
      const active=await make({active:true,branch:branch.id});
      assert.equal(await eligibility(active.id),'eligible');
      assert.equal(await eligibility(active.id,member,branch.id,active.starts_at),'eligible');
      assert.equal(await eligibility(active.id,member,branch.id,active.ends_at),'outside_window');
      assert.equal(await eligibility(active.id,member,other.id),'scope_unavailable');
      assert.equal(await eligibility(active.id,member,foreign.id),'scope_unavailable');
      const empty=await make({active:true,stock:0}),unfunded=await make({active:true,budget:1});
      assert.equal(await eligibility(empty.id),'capacity_unavailable');assert.equal(await eligibility(unfunded.id),'capacity_unavailable');
      for(const sql of ['UPDATE experience_versions SET version=version','DELETE FROM experience_versions','TRUNCATE experience_versions CASCADE'])
        await assert.rejects(pool.query(sql),{code:'55000'});
    });
    await t.test('unclaimed or revoked ownership and deleted accounts cannot participate',async()=>{
      const x=await make({active:true});
      const unowned=await make({active:true,cafe:unclaimed.id});
      assert.equal(await eligibility(unowned.id,member,foreign.id),'ownership_unavailable');
      await pool.query('UPDATE ownership_access_grants SET revoked_at=clock_timestamp(),membership_id=NULL WHERE id=$1',[grant.id]);
      assert.equal(await eligibility(x.id),'ownership_unavailable');
      await pool.query('UPDATE ownership_access_grants SET revoked_at=NULL,membership_id=$2 WHERE id=$1',[grant.id,membership.id]);
      const deleted=await user();await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[deleted]);
      assert.equal(await eligibility(x.id,deleted),'account_unavailable');
      const client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query(inspect,[member,x.id,branch.id,at]),{code:'42501'});await client.query('ROLLBACK');
        }
      } finally {await client.query('ROLLBACK');client.release();}
      for(const table of ['star_entries','stamp_entries','tier_entries']) assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0);
    });
  } finally {
    await db?.end();
    if(created) for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19) throw error;await delay(50);}
    }
    await host.end();
  }
});
