import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {hashReferralCode,issueReferralLink} from '../src/nest/referral-links.js';

test('reviewed referrals receive funded stars once only after genuine QR interaction',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_referral_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});
  let db:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    db=new pg.Pool({connectionString:base.toString()});await migrate(db);await migrate(db);
    const pool=db;
    const user=async()=>(await pool.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const inviter=await user(),employee=await user();
    const {rows:[cafe]}=await pool.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST','test',$1) RETURNING id",[randomUUID()]);
    const {rows:[branch]}=await pool.query("INSERT INTO branches(cafe_id,name,province,city) VALUES($1,'TEST','TEST','TEST') RETURNING id",[cafe.id]);
    const {rows:[program]}=await pool.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
    await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,5)',[program.id,cafe.id]);
    await pool.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff'),($4,$2,$3,'staff')",[employee,cafe.id,branch.id,inviter]);
    const {rows:[budget]}=await pool.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(5,5,true) RETURNING id');
    const award='SELECT public.award_reviewed_referral($1,$2,$3,$4,$5,$6) AS id';
    const review='SELECT public.record_referral_review($1,$2,$3,$4)';
    const link=await issueReferralLink(pool,inviter,3600);
    const registration=async()=>{
      const invitee=await user();
      const {rows:[r]}=await pool.query('SELECT public.attribute_verified_referral($1,$2) AS id',[invitee,hashReferralCode(link.code)]);
      return {invitee,id:r.id as string};
    };
    const interact=async(invitee:string,actor=employee)=>{
      const {rows:[token]}=await pool.query('SELECT public.issue_stamp_qr($1,$2,$3,$4,1) AS token',[invitee,cafe.id,branch.id,program.id]);
      const {rows:[stamp]}=await pool.query('SELECT public.consume_stamp_qr($1,$2,$3) AS id',[actor,branch.id,token.token]);
      return stamp.id as string;
    };
    await t.test('review and independent consumed QR are mandatory; exact replay and budget exhaustion remain atomic',async()=>{
      const referral=await registration();
      const interaction=await interact(referral.invitee);
      const args=[referral.id,interaction,budget.id,randomUUID(),3,null];
      await assert.rejects(pool.query(award,args),{code:'22023'});
      await pool.query(review,[referral.id,'eligible',10,'TEST reviewed evidence']);
      await assert.rejects(pool.query(award,[referral.id,randomUUID(),budget.id,randomUUID(),3,null]),{code:'22023'});
      const selfConfirmed=await interact(referral.invitee,inviter);
      await assert.rejects(pool.query(award,[referral.id,selfConfirmed,budget.id,randomUUID(),3,null]),{code:'22023'});
      const race=await Promise.allSettled([pool.query(award,args),pool.query(award,[...args.slice(0,3),randomUUID(),3,null])]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      const {rows:[entry]}=await pool.query('SELECT e.* FROM star_entries e JOIN referral_star_awards r ON r.star_entry_id=e.id WHERE r.attribution_id=$1',[referral.id]);
      const retry=[referral.id,interaction,budget.id,entry.operation_id,3,null];
      const replays=await Promise.all([pool.query(award,retry),pool.query(award,retry)]);
      for(const r of replays) assert.deepEqual(r.rows,[{id:entry.id}]);
      await assert.rejects(pool.query(award,[...retry.slice(0,4),2,null]),{code:'23505'});
      assert.equal(entry.user_id,inviter);assert.equal(entry.units,3);
      assert.equal((await pool.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows[0].remaining_units,2);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='loyalty.referral_stars_awarded'")).rowCount,1);
      assert.equal((await pool.query('SELECT 1 FROM tier_entries')).rowCount,0);
      const second=await registration(),proof=await interact(second.invitee);
      await pool.query(review,[second.id,'eligible',10,'TEST second review']);
      const operation=randomUUID();
      await assert.rejects(pool.query(award,[second.id,proof,budget.id,operation,3,null]),{code:'22023'});
      assert.equal((await pool.query('SELECT 1 FROM referral_star_awards WHERE attribution_id=$1',[second.id])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM star_entries WHERE operation_id=$1',[operation])).rowCount,0);
      await pool.query(award,[second.id,proof,budget.id,operation,2,null]);
      assert.equal((await pool.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows[0].remaining_units,0);
    });
    await t.test('rejected review, stale interaction, account deletion and runtime access cannot issue',async()=>{
      const {rows:[denialBudget]}=await pool.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(5,5,true) RETURNING id');
      const referral=await registration();
      const proof=await interact(referral.invitee);
      await pool.query(review,[referral.id,'rejected',10,'TEST fraud rejection']);
      const args=[referral.id,proof,denialBudget.id,randomUUID(),1,null];
      await assert.rejects(pool.query(award,args),{code:'22023'});
      await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1',[referral.invitee]);
      await assert.rejects(pool.query(award,args),{code:'42501'});
      const earlyInvitee=await user(),earlyProof=await interact(earlyInvitee);
      const {rows:[earlyReferral]}=await pool.query('SELECT public.attribute_verified_referral($1,$2) AS id',[earlyInvitee,hashReferralCode(link.code)]);
      await pool.query(review,[earlyReferral.id,'eligible',10,'TEST later registration']);
      await assert.rejects(pool.query(award,[earlyReferral.id,earlyProof,denialBudget.id,randomUUID(),1,null]),{code:'22023'});
      const revoked=await registration(),revokedProof=await interact(revoked.invitee);
      await pool.query(review,[revoked.id,'eligible',10,'TEST later revocation']);
      await pool.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,reversal_of)
        VALUES($1,$2,$3,1,gen_random_uuid(),-1,'reversal','TEST revoked interaction',clock_timestamp(),$4)`,
        [revoked.invitee,cafe.id,program.id,revokedProof]);
      await assert.rejects(pool.query(award,[revoked.id,revokedProof,denialBudget.id,randomUUID(),1,null]),{code:'22023'});
      const reused=await registration(),reusedProof=await interact(reused.invitee),operation=randomUUID();
      await pool.query(review,[reused.id,'eligible',10,'TEST reviewed registration']);
      await pool.query('SELECT public.award_funded_stars($1,$2,$3,1,NULL)',[inviter,denialBudget.id,operation]);
      await assert.rejects(pool.query(award,[reused.id,reusedProof,denialBudget.id,operation,1,null]),{code:'23505'});
      assert.equal((await pool.query('SELECT 1 FROM referral_star_awards WHERE attribution_id=$1',[reused.id])).rowCount,0);
      const client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
          await assert.rejects(client.query(award,args),{code:'42501'});await client.query('ROLLBACK');
        }
      } finally {await client.query('ROLLBACK');client.release();}
      for(const sql of ['UPDATE referral_star_awards SET star_entry_id=star_entry_id','DELETE FROM referral_star_awards','TRUNCATE referral_star_awards'])
        await assert.rejects(pool.query(sql),{code:'55000'});
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
