import {OtpCrypto} from '../src/nest/otp.js';
import {PhoneVault} from '../src/nest/phone-vault.js';
import {identityTransaction} from '../src/nest/identity-transaction.js';
import {hashReferralCode,issueReferralLink} from '../src/nest/referral-links.js';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
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
    let loginCode='';
    server=await createApp({runtimePool:runtime,enableStampQr:true,initialLogin:{
      crypto:new OtpCrypto(randomBytes(32)),vault:new PhoneVault(randomBytes(32),new Map([['test',randomBytes(32)]]),'test'),
      provider:{enabled:true,async send({code}){loginCode=code;}},
    }});
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
    const {rows:[soon,later,expired]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),6,'award','TEST soon',now(),now()+interval '1 hour'),
            ($1,$2,$3,1,gen_random_uuid(),5,'award','TEST later',now(),now()+interval '2 hours'),
            ($1,$2,$3,1,gen_random_uuid(),100,'award','TEST expired',now()-interval '2 hours',now()-interval '1 hour')
      RETURNING id`,[customer.id,cafe.id,program.id]);
    const {rows:rewards}=await db.query<{id:string}>(`INSERT INTO stamp_rewards(cafe_id,program_id,program_version,stock,active)
      VALUES($1,$2,1,1,true),($1,$2,1,1,true) RETURNING id`,[cafe.id,program.id]);
    const sql='SELECT public.redeem_stamp_reward($1,$2,$3) AS id';
    const redeem=async (rewardId:string,operation:string)=>{
      const client=await db!.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_stamp_redeemer');
        const {rows:[row]}=await client.query<{id:string}>(sql,[customer.id,rewardId,operation]);
        await client.query('COMMIT');
        return row.id;
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    };
    const attempts=rewards.map(({id})=>({id,operation:randomUUID()}));
    const results=await Promise.allSettled(attempts.map(a=>redeem(a.id,a.operation)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const winner=results.findIndex(r=>r.status==='fulfilled');
    const won=results[winner],lost=results[1-winner];
    assert.equal(won.status,'fulfilled');
    assert.equal(lost.status,'rejected');
    assert.equal(lost.reason.code,'22023');
    assert.equal(await redeem(attempts[winner].id,attempts[winner].operation),won.value);
    await assert.rejects(redeem(attempts[1-winner].id,attempts[winner].operation),{code:'23505'});
    assert.deepEqual((await db.query('SELECT stock FROM stamp_rewards ORDER BY stock')).rows,[{stock:0},{stock:1}]);
    assert.deepEqual((await db.query("SELECT units FROM stamp_entries WHERE kind='spend'")).rows,[{units:-10}]);
    const allocations=(await db.query('SELECT award_id,units FROM stamp_spend_allocations')).rows;
    assert.equal(allocations.length,2);
    assert.equal(allocations.find(row=>row.award_id===soon.id)?.units,6);
    assert.equal(allocations.find(row=>row.award_id===later.id)?.units,4);
    assert.equal(allocations.some(row=>row.award_id===expired.id),false);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_redeemed'")).rowCount,1);
    await assert.rejects(runtime.query(sql,[customer.id,attempts[winner].id,randomUUID()]),{code:'42501'});
    await assert.rejects(runtime.query('SELECT * FROM stamp_spend_allocations'),{code:'42501'});
    await assert.rejects(db.query('UPDATE stamp_spend_allocations SET units=1'),{code:'55000'});
    await assert.rejects(db.query('DELETE FROM stamp_spend_allocations'),{code:'55000'});
    await assert.rejects(db.query('TRUNCATE stamp_spend_allocations'),{code:'55000'});

    const inspect='SELECT * FROM public.inspect_stamp_reconciliation($1,$2,$3,1,now())';
    const scope=[customer.id,cafe.id,program.id];
    assert.deepEqual((await db.query(inspect,scope)).rows,[{
      legacy_spend_count:'0',reversal_count:'0',expiry_entry_count:'0',
      expired_unspent_units:'100',active_unspent_units:'2',
    }]);
    await assert.rejects(runtime.query(inspect,scope),{code:'42501'});
    const {rows:[legacy]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),-1,'spend','TEST legacy',now()) RETURNING id`,scope);
    const allocate='SELECT public.allocate_legacy_stamp_spend($1,$2,$3)';
    await assert.rejects(runtime.query(allocate,[legacy.id,[later.id],[1]]),{code:'42501'});
    await assert.rejects(db.query(allocate,[legacy.id,[expired.id],[1]]),{code:'22023'});
    await assert.rejects(db.query(allocate,[legacy.id,[soon.id],[1]]),{code:'22023'});
    assert.equal((await db.query(inspect,scope)).rows[0].legacy_spend_count,'1');
    await Promise.all([1,2].map(()=>db!.query(allocate,[legacy.id,[later.id],[1]])));
    await assert.rejects(db.query(allocate,[legacy.id,[entryId],[1]]),{code:'23505'});
    assert.equal((await db.query(inspect,scope)).rows[0].legacy_spend_count,'0');
    const {rows:[historical]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      SELECT $1,$2,$3,1,gen_random_uuid(),-30,'spend','TEST dated spend',effective_at FROM stamp_entries WHERE id=$4
      RETURNING id`,[...scope,expired.id]);
    const expire='SELECT public.record_stamp_award_expiry($1) AS id';
    await assert.rejects(runtime.query(expire,[expired.id]),{code:'42501'});
    await assert.rejects(db.query(expire,[soon.id]),{code:'22023'});
    await assert.rejects(db.query(expire,[expired.id]),{code:'22023'});
    await db.query(allocate,[historical.id,[expired.id],[30]]);
    const expiryRuns=await Promise.all([1,2].map(()=>db!.query(expire,[expired.id])));
    const expiryId=expiryRuns[0].rows[0].id;
    assert.ok(expiryId);
    assert.equal(expiryRuns[1].rows[0].id,expiryId);
    assert.deepEqual((await db.query("SELECT id,units FROM stamp_entries WHERE kind='expire'")).rows,[{id:expiryId,units:-70}]);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_expired'")).rowCount,1);
    assert.equal((await db.query(inspect,scope)).rows[0].expired_unspent_units,'0');
    await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),9,'award','TEST after expiry',now())`,scope);
    assert.ok(await redeem(attempts[1-winner].id,randomUUID()));
    assert.equal((await db.query(inspect,scope)).rows[0].active_unspent_units,'0');
    const {rows:[oldAward]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),2,'award','TEST legacy award',now()-interval '2 hours',now()-interval '1 hour') RETURNING id`,scope);
    const {rows:[oldExpiry]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),-1,'expire','TEST legacy expiry',now()) RETURNING id`,scope);
    const link='SELECT public.link_legacy_stamp_expiry($1,$2)';
    await assert.rejects(runtime.query(link,[oldExpiry.id,oldAward.id]),{code:'42501'});
    await assert.rejects(db.query(link,[oldExpiry.id,expired.id]),{code:'22023'});
    await assert.rejects(db.query(link,[oldExpiry.id,oldAward.id]),{code:'22023'});
    const {rows:[oldSpend]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      SELECT $1,$2,$3,1,gen_random_uuid(),-1,'spend','TEST before legacy expiry',effective_at FROM stamp_entries WHERE id=$4
      RETURNING id`,[...scope,oldAward.id]);
    await assert.rejects(db.query(link,[oldExpiry.id,oldAward.id]),{code:'22023'});
    await db.query(allocate,[oldSpend.id,[oldAward.id],[1]]);
    await Promise.all([1,2].map(()=>db!.query(link,[oldExpiry.id,oldAward.id])));
    await assert.rejects(db.query(link,[oldExpiry.id,expired.id]),{code:'23505'});
    assert.deepEqual((await db.query('SELECT award_id,units FROM stamp_spend_allocations WHERE debit_id=$1',[oldExpiry.id])).rows,
      [{award_id:oldAward.id,units:1}]);
    assert.equal((await db.query(expire,[oldAward.id])).rows[0].id,oldExpiry.id);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_expiry_linked'")).rowCount,1);
    const {rows:combinedAwards}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      SELECT $1,$2,$3,1,gen_random_uuid(),units,'award','TEST combined lot',now()-interval '2 hours',now()-interval '1 hour'
      FROM (VALUES (2),(3)) AS lots(units) RETURNING id,units`,scope);
    const {rows:[combinedExpiry]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),-5,'expire','TEST combined expiry',now()) RETURNING id`,scope);
    const pair=combinedAwards.map(a=>a.id);
    const linkCombined='SELECT public.link_legacy_stamp_expiry_awards($1,$2)';
    await assert.rejects(runtime.query(linkCombined,[combinedExpiry.id,pair]),{code:'42501'});
    for(const invalid of [[pair[0]],[pair[0],pair[0]],[...pair,soon.id]]){
      await assert.rejects(db.query(linkCombined,[combinedExpiry.id,invalid]),{code:'22023'});
    }
    assert.equal((await db.query('SELECT 1 FROM stamp_spend_allocations WHERE debit_id=$1',[combinedExpiry.id])).rowCount,0);
    await Promise.all([pair,[...pair].reverse()].map(ids=>db!.query(linkCombined,[combinedExpiry.id,ids])));
    await assert.rejects(db.query(link,[combinedExpiry.id,pair[0]]),{code:'23505'});
    assert.deepEqual((await db.query('SELECT award_id AS id,units FROM stamp_spend_allocations WHERE debit_id=$1 ORDER BY units',
      [combinedExpiry.id])).rows,combinedAwards.sort((a,b)=>a.units-b.units));
    for(const award of pair) assert.equal((await db.query(expire,[award])).rows[0].id,combinedExpiry.id);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_expiry_linked'")).rowCount,2);
    const {rows:[unused]}=await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,expires_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),10,'award','TEST unused',now(),now()+interval '1 hour') RETURNING id`,scope);
    const reverseAward=async (awardId:string,units:number)=>{
      const {rows:[row]}=await db!.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,reversal_of)
        VALUES($1,$2,$3,1,gen_random_uuid(),$4,'reversal','TEST reversal',now(),$5) RETURNING id`,[...scope,units,awardId]);
      return row.id;
    };
    const linkReversal='SELECT public.link_stamp_award_reversal($1)';
    const unusedReversal=await reverseAward(unused.id,-10);
    await assert.rejects(runtime.query(linkReversal,[unusedReversal]),{code:'42501'});
    await Promise.all([1,2].map(()=>db!.query(linkReversal,[unusedReversal])));
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_award_reversal_linked'")).rowCount,1);
    assert.equal((await db.query(inspect,scope)).rows[0].active_unspent_units,'0');
    const {rows:[newReward]}=await db.query(`INSERT INTO stamp_rewards(cafe_id,program_id,program_version,stock,active)
      VALUES($1,$2,1,1,true) RETURNING id`,[cafe.id,program.id]);
    await assert.rejects(redeem(newReward.id,randomUUID()),{code:'22023'});
    await db.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,gen_random_uuid(),10,'award','TEST after reversal',now())`,scope);
    const restoredReceipt=await redeem(newReward.id,randomUUID());
    const {rows:[restoredSpend]}=await db.query('SELECT entry_id FROM stamp_redemptions WHERE id=$1',[restoredReceipt]);
    const linkSpend='SELECT public.link_stamp_spend_reversal($1)';
    const restore=await reverseAward(restoredSpend.entry_id,10);
    await assert.rejects(runtime.query(linkSpend,[restore]),{code:'42501'});
    await Promise.all([1,2].map(()=>db!.query(linkSpend,[restore])));
    assert.equal((await db.query(inspect,scope)).rows[0].active_unspent_units,'10');
    assert.equal((await db.query('SELECT stock FROM stamp_rewards WHERE id=$1',[newReward.id])).rows[0].stock,0);
    const {rows:[nextReward]}=await db.query(`INSERT INTO stamp_rewards(cafe_id,program_id,program_version,stock,active)
      VALUES($1,$2,1,1,true) RETURNING id`,[cafe.id,program.id]);
    assert.ok(await redeem(nextReward.id,randomUUID()));
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stamp_spend_reversal_linked'")).rowCount,1);
    const expiredRestore=await reverseAward(historical.id,30);
    await assert.rejects(db.query(linkSpend,[expiredRestore]),{code:'22023'});
    const spentReversal=await reverseAward(entryId,-1);
    await assert.rejects(db.query(linkReversal,[spentReversal]),{code:'22023'});
    assert.deepEqual((await db.query(inspect,scope)).rows,[{
      legacy_spend_count:'0',reversal_count:'4',expiry_entry_count:'3',
      expired_unspent_units:'0',active_unspent_units:'0',
    }]);
    assert.deepEqual((await db.query(inspect,[staff.id,cafe.id,program.id])).rows,[{
      legacy_spend_count:'0',reversal_count:'0',expiry_entry_count:'0',
      expired_unspent_units:'0',active_unspent_units:'0',
    }]);
    const {rows:[budget]}=await db.query(`INSERT INTO star_award_budgets(funded_units,remaining_units,active)
      VALUES(7,7,true) RETURNING id`);
    const awardStars='SELECT public.award_funded_stars($1,$2,$3,$4,$5) AS id';
    const starOps=[randomUUID(),randomUUID()];
    const starArgs=(op:string,amount:number)=>[customer.id,budget.id,op,amount,null];
    await assert.rejects(runtime.query(awardStars,starArgs(starOps[0],5)),{code:'42501'});
    await assert.rejects(db.query(awardStars,[...starArgs(randomUUID(),2).slice(0,4),new Date(0)]),{code:'22023'});
    const starRace=await Promise.allSettled(starOps.map(op=>db!.query(awardStars,starArgs(op,5))));
    const starWinner=starRace.findIndex(result=>result.status==='fulfilled');
    assert.notEqual(starWinner,-1);
    assert.equal(starRace.filter(result=>result.status==='fulfilled').length,1);
    const starWon=starRace[starWinner];
    assert.equal(starWon.status,'fulfilled');
    assert.deepEqual((await db.query(awardStars,starArgs(starOps[starWinner],5))).rows,starWon.value.rows);
    await assert.rejects(db.query(awardStars,starArgs(starOps[starWinner],1)),{code:'23505'});
    assert.equal((await db.query('SELECT remaining_units FROM star_award_budgets WHERE id=$1',[budget.id])).rows[0].remaining_units,2);
    assert.equal((await db.query('SELECT units FROM star_entries')).rows[0].units,5);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.stars_awarded'")).rowCount,1);
    assert.equal((await db.query('SELECT 1 FROM tier_entries')).rowCount,0);
    const awardTier='SELECT public.award_tier_points($1,$2,$3,$4) AS id';
    const inspectTier='SELECT public.inspect_tier_qualification($1,$2,$3) AS units';
    const tierArgs=[customer.id,randomUUID(),8,'2025-01-01T00:00:00Z'];
    await assert.rejects(runtime.query(awardTier,tierArgs),{code:'42501'});
    await assert.rejects(runtime.query(inspectTier,[customer.id,2025,'2025-12-31T00:00:00Z']),{code:'42501'});
    const tierRuns=await Promise.all([1,2].map(()=>db!.query(awardTier,tierArgs)));
    assert.deepEqual(tierRuns[0].rows,tierRuns[1].rows);
    await assert.rejects(db.query(awardTier,[customer.id,tierArgs[1],9,tierArgs[3]]),{code:'23505'});
    await db.query(awardTier,[customer.id,randomUUID(),3,'2024-12-31T23:59:59Z']);
    for(const [recipient,year,at,units] of [
      [customer.id,2024,'2025-12-31T00:00:00Z','3'],
      [customer.id,2025,'2025-12-31T00:00:00Z','8'],
      [customer.id,2025,'2024-12-31T23:59:59Z','0'],
      [staff.id,2025,'2025-12-31T00:00:00Z','0'],
    ]) assert.deepEqual((await db.query(inspectTier,[recipient,year,at])).rows,[{units}]);
    assert.equal((await db.query('SELECT 1 FROM star_entries')).rowCount,1);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.tier_awarded'")).rowCount,2);
    const issuedLink=await issueReferralLink(db,staff.id,60);
    assert.match(issuedLink.code,/^[0-9a-f]{64}$/);
    assert.deepEqual((await db.query('SELECT code_hash FROM referral_links WHERE id=$1',[issuedLink.id])).rows,
      [{code_hash:hashReferralCode(issuedLink.code)}]);
    const revoke='SELECT public.revoke_referral_link($1,$2) AS revoked';
    await assert.rejects(runtime.query(revoke,[staff.id,issuedLink.id]),{code:'42501'});
    await assert.rejects(issueReferralLink(runtime,staff.id,60),{code:'42501'});
    assert.equal((await db.query(revoke,[customer.id,issuedLink.id])).rows[0].revoked,false);
    assert.equal((await db.query(revoke,[staff.id,issuedLink.id])).rows[0].revoked,true);
    assert.equal((await db.query(revoke,[staff.id,issuedLink.id])).rows[0].revoked,false);
    await assert.rejects(db.query('SELECT public.attribute_verified_referral($1,$2)',
      [customer.id,hashReferralCode(issuedLink.code)]),{code:'22023'});
    const codes=[randomBytes(32),randomBytes(32),randomBytes(32)];
    await db.query(`INSERT INTO referral_links(inviter_id,code_hash,expires_at)
      VALUES($1,$2,now()+interval '1 hour'),($1,$3,now()+interval '1 hour'),($1,$4,now()-interval '1 hour')`,
      [staff.id,...codes]);
    const referral='SELECT public.attribute_verified_referral($1,$2) AS id';
    await assert.rejects(runtime.query(referral,[customer.id,codes[0]]),{code:'42501'});
    await assert.rejects(db.query(referral,[staff.id,codes[0]]),{code:'22023'});
    await assert.rejects(db.query(referral,[customer.id,codes[2]]),{code:'22023'});
    const referralRace=await Promise.allSettled(codes.slice(0,2).map(code=>db!.query(referral,[customer.id,code])));
    const referralWinner=referralRace.findIndex(result=>result.status==='fulfilled');
    const referralWon=referralRace[referralWinner],referralLost=referralRace[1-referralWinner];
    assert.equal(referralWon?.status,'fulfilled');
    assert.equal(referralLost?.status,'rejected');
    assert.equal(referralLost.reason.code,'23505');
    assert.deepEqual((await db.query(referral,[customer.id,codes[referralWinner]])).rows,referralWon.value.rows);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='loyalty.referral_attributed'")).rowCount,1);
    assert.equal((await db.query('SELECT 1 FROM star_entries')).rowCount,1);
    assert.equal((await db.query('SELECT 1 FROM tier_entries')).rowCount,2);
    const inspectStars='SELECT public.inspect_funded_star_balance($1,$2) AS units';
    const future=(await db.query("SELECT (clock_timestamp()+interval '2 hours')::text AS at")).rows[0].at;
    const starExpiry=(await db.query("SELECT (clock_timestamp()+interval '1 hour')::text AS at")).rows[0].at;
    await db.query(awardStars,[customer.id,budget.id,randomUUID(),2,starExpiry]);
    const now=(await db.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
    await assert.rejects(runtime.query(inspectStars,[customer.id,now]),{code:'42501'});
    for(const [who,at,units] of [[customer.id,now,'7'],[customer.id,starExpiry,'5'],
      [customer.id,future,'5'],[staff.id,now,'0'],[customer.id,'2001-01-01T00:00:00Z','0']]){
      assert.deepEqual((await db.query(inspectStars,[who,at])).rows,[{units}]);
    }
    await db.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
      VALUES($1,gen_random_uuid(),-1,'spend','TEST legacy star spend',now())`,[customer.id]);
    assert.deepEqual((await db.query(inspectStars,[customer.id,future])).rows,[{units:null}]);
    const registrationLink=await issueReferralLink(db,staff.id,60);
    const invitee=await identityTransaction(runtime,async client=>{
      await client.query("SELECT set_config('ghahvehto.registration_referral',$1,true)",[hashReferralCode(registrationLink.code).toString('hex')]);
      const {rows:[row]}=await client.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
        VALUES($1,$2,now()) RETURNING id`,[randomBytes(32),randomBytes(32)]);
      return row.id;
    });
    assert.deepEqual((await db.query('SELECT inviter_id,link_id FROM referral_attributions WHERE invitee_id=$1',[invitee])).rows,
      [{inviter_id:staff.id,link_id:registrationLink.id}]);
    const skipped=await identityTransaction(runtime,async client=>{
      await client.query("SELECT set_config('ghahvehto.registration_referral',$1,true)",[hashReferralCode(issuedLink.code).toString('hex')]);
      const {rows:[row]}=await client.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
        VALUES($1,$2,now()) RETURNING id`,[randomBytes(32),randomBytes(32)]);
      return row.id;
    });
    assert.equal((await db.query('SELECT 1 FROM referral_attributions WHERE invitee_id=$1',[skipped])).rowCount,0);
    const loginPost=(action:string,body:object)=>fetch(`${url}/v1/auth/otp/${action}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    });
    const mobile='+989120000041';
    const challenge=await loginPost('request',{mobile});
    assert.equal(challenge.status,201);
    const {challengeId}=await challenge.json() as {challengeId:string};
    const proof={mobile,challengeId,code:loginCode};
    assert.equal((await loginPost('verify',{...proof,referralCode:'invalid'})).status,400);
    const verifiedLogin=await loginPost('verify',{...proof,referralCode:registrationLink.code});
    assert.equal(verifiedLogin.status,201);
    const {accessToken}=await verifiedLogin.json() as {accessToken:string};
    const registered=await sessions.authenticate(accessToken);
    assert.ok(registered);
    assert.deepEqual((await db.query('SELECT link_id FROM referral_attributions WHERE invitee_id=$1',[registered.userId])).rows,
      [{link_id:registrationLink.id}]);
  } finally {
    try {
      await server?.app.close();
      await runtime?.end();
      await db?.end();
      if(databaseCreated) {
        // PostgreSQL can still be processing the pools' disconnects.
        for(let attempt=0;;attempt++){
          try {await host.query(`DROP DATABASE ${database}`);break;}
          catch(error){
            if((error as pg.DatabaseError).code!=='55006'||attempt>=19) throw error;
            await delay(50);
          }
        }
      }
      if(loginCreated) await host.query(`DROP ROLE ${login}`);
    } finally {await host.end();}
  }
});
