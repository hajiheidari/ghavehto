import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createApp} from '../src/nest/app.js';
import {SessionService} from '../src/nest/sessions.js';
import {startWebPanel} from './web-panel.js';
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
    const make=async(options:{first?:boolean,active?:boolean,stock?:number,budget?:number,cafe?:string,branch?:string|null,ends?:string}={})=>{
      const scope=options.cafe??cafe.id;
      const {rows:[experience]}=await pool.query('INSERT INTO experiences(cafe_id,active) VALUES($1,$2) RETURNING id',[scope,options.active??false]);
      const {rows:[v]}=await pool.query(`INSERT INTO experience_versions(experience_id,cafe_id,version,branch_id,starts_at,ends_at,first_recorded_visit_only,per_member_limit,budget_units_per_claim)
        VALUES($1,$2,1,$3,$4::timestamptz-interval '1 hour',coalesce($6::timestamptz,$4::timestamptz+interval '1 hour'),$5,1,2) RETURNING starts_at::text,ends_at::text`,
        [experience.id,scope,options.branch??null,at,options.first??false,options.ends??null]);
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
    await t.test('atomic claims serialize stock and budget, preserve replay and enforce per-member limits',async()=>{
      const claim='SELECT public.claim_experience($1,$2,$3,$4,$5) AS id';
      const x=await make({active:true,stock:1,budget:2});
      const people=[await user(),await user()];
      const ops=[randomUUID(),randomUUID()];
      const race=await Promise.allSettled(people.map((who,i)=>pool.query(claim,[who,x.id,1,branch.id,ops[i]])));
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      const winner=race.findIndex(r=>r.status==='fulfilled'),won=race[winner];assert.ok(won.status==='fulfilled');
      const args=[people[winner],x.id,1,branch.id,ops[winner]];
      await pool.query('UPDATE experiences SET active=false WHERE id=$1',[x.id]);
      for(const r of await Promise.all([pool.query(claim,args),pool.query(claim,args)])) assert.deepEqual(r.rows,won.value.rows);
      await assert.rejects(pool.query(claim,[people[winner],x.id,1,other.id,ops[winner]]),{code:'23505'});
      assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[x.id])).rows,
        [{remaining_stock:0,remaining_budget_units:'0'}]);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='experience.claimed' AND metadata->>'experienceId'=$1",[x.id])).rowCount,1);
      const limited=await make({active:true,stock:3,budget:6}),who=await user();
      await pool.query(claim,[who,limited.id,1,branch.id,randomUUID()]);
      await assert.rejects(pool.query(claim,[who,limited.id,1,branch.id,randomUUID()]),{code:'22023'});
      // A new immutable policy version does not erase prior participation in the same experience.
      await pool.query(`INSERT INTO experience_versions(experience_id,cafe_id,version,starts_at,ends_at,first_recorded_visit_only,per_member_limit,budget_units_per_claim)
        SELECT experience_id,cafe_id,2,starts_at,ends_at,false,1,2 FROM experience_versions WHERE experience_id=$1`,[limited.id]);
      await pool.query(`INSERT INTO experience_capacity VALUES($1,$2,2,2,2,4,4)`,[limited.id,cafe.id]);
      await assert.rejects(pool.query(claim,[who,limited.id,2,branch.id,randomUUID()]),{code:'22023'});
      const funded=await make({active:true,stock:2,budget:2});
      const budgetRace=await Promise.allSettled([user(),user()].map(async who=>pool.query(claim,[await who,funded.id,1,branch.id,randomUUID()])));
      assert.equal(budgetRace.filter(r=>r.status==='fulfilled').length,1);
      assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[funded.id])).rows,
        [{remaining_stock:1,remaining_budget_units:'0'}]);
      for(const sql of ['UPDATE experience_claims SET version=version','DELETE FROM experience_claims','TRUNCATE experience_claims CASCADE'])
        await assert.rejects(pool.query(sql),{code:'55000'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_app');
        await assert.rejects(client.query(claim,args),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
    });
    await t.test('first recorded participation is exclusive across different campaigns',async()=>{
      const who=await user(),campaigns=await Promise.all([make({active:true,first:true}),make({active:true,first:true})]);
      const race=await Promise.allSettled(campaigns.map(x=>pool.query('SELECT public.claim_experience($1,$2,1,$3,$4)',[who,x.id,branch.id,randomUUID()])));
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await pool.query('SELECT 1 FROM experience_first_visits WHERE user_id=$1 AND cafe_id=$2',[who,cafe.id])).rowCount,1);
      assert.equal((await pool.query('SELECT count(*) AS n FROM experience_claims WHERE user_id=$1',[who])).rows[0].n,'1');
      for(const sql of ['UPDATE experience_first_visits SET cafe_id=cafe_id','DELETE FROM experience_first_visits','TRUNCATE experience_first_visits'])
        await assert.rejects(pool.query(sql),{code:'55000'});
    });
    await t.test('a consumed QR counts as prior interaction for first-recorded-visit policies',async()=>{
      const who=await user(),x=await make({active:true,first:true});
      const {rows:[program]}=await pool.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
      await pool.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,5)',[program.id,cafe.id]);
      const {rows:[token]}=await pool.query('SELECT public.issue_stamp_qr($1,$2,$3,$4,1) AS token',[who,cafe.id,branch.id,program.id]);
      await pool.query('SELECT public.consume_stamp_qr($1,$2,$3)',[owner,branch.id,token.token]);
      const current=(await pool.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
      assert.equal(await eligibility(x.id,who,branch.id,current),'prior_participation');
      await assert.rejects(pool.query('SELECT public.claim_experience($1,$2,1,$3,$4)',[who,x.id,branch.id,randomUUID()]),{code:'22023'});
      assert.equal((await pool.query('SELECT 1 FROM experience_claims WHERE user_id=$1',[who])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM stamp_entries WHERE user_id=$1',[who])).rowCount,1);
    });
    await t.test('end time is checked after capacity lock waits and failure consumes nothing',async()=>{
      const ends=(await pool.query("SELECT (clock_timestamp()+interval '1.5 seconds')::text AS at")).rows[0].at;
      const x=await make({active:true,ends}),who=await user(),operation=randomUUID();
      const lock=await pool.connect();
      try {
        await lock.query('BEGIN');await lock.query('SELECT 1 FROM experience_capacity WHERE experience_id=$1 FOR UPDATE',[x.id]);
        const rejected=assert.rejects(pool.query('SELECT public.claim_experience($1,$2,1,$3,$4)',[who,x.id,branch.id,operation]),{code:'22023'});
        await delay(1700);await lock.query('COMMIT');await rejected;
        assert.equal((await pool.query('SELECT 1 FROM experience_claims WHERE operation_id=$1',[operation])).rowCount,0);
        assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[x.id])).rows,
          [{remaining_stock:2,remaining_budget_units:'4'}]);
      } finally {await lock.query('ROLLBACK');lock.release();}
    });
    await t.test('cancelled participation restores internal stock and budget once, preserving history and replay',async()=>{
      const who=await user(),x=await make({active:true,first:true,stock:1,budget:2}),operation=randomUUID();
      const claimSql='SELECT public.claim_experience($1,$2,1,$3,$4) AS id';
      const {rows:[receipt]}=await pool.query(claimSql,[who,x.id,branch.id,operation]);
      const recover='SELECT public.recover_experience_claim($1,$2) AS receipt';
      assert.equal((await pool.query(recover,[who,operation])).rows[0].receipt.state,'reserved');
      assert.deepEqual((await pool.query(recover,[await user(),operation])).rows,[{receipt:null}]);
      await pool.query('UPDATE experiences SET active=false WHERE id=$1',[x.id]);
      const cancel='SELECT public.cancel_experience_claim($1,$2,$3,$4) AS id';
      const args=[who,receipt.id,randomUUID(),'TEST interrupted participation'];
      const race=await Promise.allSettled([pool.query(cancel,args),pool.query(cancel,[who,receipt.id,randomUUID(),args[3]])]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      const {rows:[c]}=await pool.query('SELECT * FROM experience_cancellations WHERE claim_id=$1',[receipt.id]);
      const retry=[who,receipt.id,c.operation_id,c.reason];
      for(const result of await Promise.all([pool.query(cancel,retry),pool.query(cancel,retry)])) assert.deepEqual(result.rows,[{id:c.id}]);
      await assert.rejects(pool.query(cancel,[...retry.slice(0,3),'TEST changed reason']),{code:'23505'});
      await assert.rejects(pool.query(cancel,[await user(),receipt.id,randomUUID(),'TEST foreign']),{code:'22023'});
      assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[x.id])).rows,[{remaining_stock:1,remaining_budget_units:'2'}]);
      assert.equal((await pool.query(recover,[who,operation])).rows[0].receipt.state,'cancelled');
      assert.deepEqual((await pool.query(claimSql,[who,x.id,branch.id,operation])).rows,[{id:receipt.id}]);
      assert.equal((await pool.query('SELECT 1 FROM experience_first_visits WHERE claim_id=$1',[receipt.id])).rowCount,1);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='experience.cancelled' AND metadata->>'claimId'=$1",[receipt.id])).rowCount,1);
      await pool.query('UPDATE experiences SET active=true WHERE id=$1',[x.id]);
      await assert.rejects(pool.query(claimSql,[who,x.id,branch.id,randomUUID()]),{code:'22023'});
      for(const sql of ['UPDATE experience_cancellations SET reason=reason','DELETE FROM experience_cancellations','TRUNCATE experience_cancellations'])
        await assert.rejects(pool.query(sql),{code:'55000'});
      for(const role of ['ghahvehto_app','ghahvehto_identity','ghahvehto_tracking']){
        const client=await pool.connect();try{
          for(const [sql,values] of [[cancel,retry],[recover,[who,operation]]] as const){
            await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
            await assert.rejects(client.query(sql,[...values]),{code:'42501'});await client.query('ROLLBACK');
          }
        }finally{await client.query('ROLLBACK');client.release();}
      }
    });
    await t.test('cancellation and new claims serialize capacity; failed recovery rolls back all writes',async()=>{
      const claimSql='SELECT public.claim_experience($1,$2,1,$3,$4) AS id',cancel='SELECT public.cancel_experience_claim($1,$2,$3,$4) AS id';
      const who=await user(),next=await user(),x=await make({active:true,stock:1,budget:2});
      const {rows:[receipt]}=await pool.query(claimSql,[who,x.id,branch.id,randomUUID()]);
      const results=await Promise.allSettled([pool.query(cancel,[who,receipt.id,randomUUID(),'TEST recovery']),pool.query(claimSql,[next,x.id,branch.id,randomUUID()])]);
      assert.equal(results[0].status,'fulfilled');
      const remaining=results[1].status==='fulfilled'?0:1;
      assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[x.id])).rows,[{remaining_stock:remaining,remaining_budget_units:String(remaining*2)}]);
      const broken=await make({active:true,stock:1,budget:2}),actor=await user();
      const {rows:[r]}=await pool.query(claimSql,[actor,broken.id,branch.id,randomUUID()]);
      // Disposable projection corruption; recovery must not manufacture an over-funded balance.
      await pool.query('UPDATE experience_capacity SET remaining_budget_units=funded_budget_units WHERE experience_id=$1',[broken.id]);
      const op=randomUUID();await assert.rejects(pool.query(cancel,[actor,r.id,op,'TEST overflow']),{code:'22023'});
      assert.equal((await pool.query('SELECT 1 FROM experience_cancellations WHERE operation_id=$1',[op])).rowCount,0);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='experience.cancelled' AND metadata->>'claimId'=$1",[r.id])).rowCount,0);
      assert.deepEqual((await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[broken.id])).rows,[{remaining_stock:0,remaining_budget_units:'2'}]);
      await pool.query('UPDATE experience_capacity SET remaining_budget_units=0 WHERE experience_id=$1',[broken.id]);
      assert.ok((await pool.query(cancel,[actor,r.id,op,'TEST overflow'])).rows[0].id);
    });
    await t.test('private fulfillment is branch scoped, immutable and mutually exclusive with cancellation',async()=>{
      const x=await make({active:true,stock:2,budget:4}),who=await user(),otherStaff=await user();
      await pool.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff')",[otherStaff,cafe.id,other.id]);
      const claimSql='SELECT public.claim_experience($1,$2,1,$3,$4) AS id';
      const fulfill='SELECT public.record_experience_fulfillment($1,$2,$3,$4) AS id';
      const cancel='SELECT public.cancel_experience_claim($1,$2,$3,$4) AS id';
      const recover='SELECT public.recover_experience_claim($1,$2) AS receipt';
      const operation=randomUUID();
      const {rows:[c]}=await pool.query(claimSql,[who,x.id,branch.id,operation]);
      const args=[owner,c.id,randomUUID(),'TEST recorded delivery'];
      for(const unauthorized of [who,otherStaff]) await assert.rejects(pool.query(fulfill,[unauthorized,...args.slice(1)]),{code:'42501'});
      const receipts=await Promise.all([pool.query(fulfill,args),pool.query(fulfill,args)]);
      assert.deepEqual(receipts[0].rows,receipts[1].rows);
      const recovered=(await pool.query(recover,[who,operation])).rows[0].receipt;
      assert.equal(recovered.state,'fulfilled');
      assert.equal(recovered.fulfillmentId,receipts[0].rows[0].id);
      await assert.rejects(pool.query(fulfill,[...args.slice(0,3),'TEST changed']),{code:'23505'});
      await assert.rejects(pool.query(cancel,[who,c.id,randomUUID(),'TEST late cancellation']),{code:'22023'});
      await assert.rejects(pool.query('DELETE FROM experience_fulfillments'),{code:'55000'});
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='experience.fulfilled' AND metadata->>'claimId'=$1",[c.id])).rowCount,1);

      const second=await user(),secondOperation=randomUUID();
      const {rows:[d]}=await pool.query(claimSql,[second,x.id,branch.id,secondOperation]);
      const race=await Promise.allSettled([
        pool.query(fulfill,[owner,d.id,randomUUID(),'TEST racing fulfillment']),
        pool.query(cancel,[second,d.id,randomUUID(),'TEST racing cancellation']),
      ]);
      assert.equal(race.filter(outcome=>outcome.status==='fulfilled').length,1);
      const final=(await pool.query(recover,[second,secondOperation])).rows[0].receipt.state;
      assert.equal(final,race[0].status==='fulfilled'?'fulfilled':'cancelled');
      const {rows:[capacity]}=await pool.query('SELECT remaining_stock,remaining_budget_units FROM experience_capacity WHERE experience_id=$1',[x.id]);
      assert.deepEqual(capacity,final==='fulfilled'?{remaining_stock:0,remaining_budget_units:'0'}:{remaining_stock:1,remaining_budget_units:'2'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_app');
        await assert.rejects(client.query(fulfill,args),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
    });
    await t.test('opt-in participation HTTP derives member and staff from restricted live sessions',async()=>{
      const login='gh_participation_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
      await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      const address=new URL(base);address.username=login;address.password=password;
      const runtime=new pg.Pool({connectionString:address.toString()});
      try {
        await host.query(`GRANT ghahvehto_participation TO ${login}`);
        await assert.rejects(createApp({participationPool:pool}),/Dedicated restricted participation login/);
        const standard=await createApp();
        try {
          await standard.app.listen(0,'127.0.0.1');
          assert.equal((await fetch((await standard.app.getUrl())+'/v1/internal/participation/reservations/'+randomUUID())).status,404);
        } finally {await standard.app.close();}
        const {app}=await createApp({participationPool:runtime});
        try {
          await app.listen(0,'127.0.0.1');
          const origin=(await app.getUrl())+'/v1/internal/participation/';
          const sessions=new SessionService(pool);
          const [memberSession,ownerSession,foreignSession]=await Promise.all([sessions.issue(await user()),sessions.issue(owner),sessions.issue(await user())]);
          const request=(path:string,token?:string,input?:object)=>fetch(origin+path,{
            method:input?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),...(input?{'content-type':'application/json'}:{})},
            body:input?JSON.stringify(input):undefined,
          });
          const x=await make({active:true}),input={experienceId:x.id,branchId:branch.id,version:1,operationId:randomUUID()};
          assert.equal((await request('reservations',undefined,input)).status,401);
          assert.equal((await request('reservations',memberSession.accessToken,{...input,actorId:owner})).status,400);
          const reserved=await request('reservations',memberSession.accessToken,input);
          assert.equal(reserved.status,201);
          const {id}=await reserved.json() as {id:string};
          const path='reservations/'+input.operationId;
          assert.equal((await request(path,foreignSession.accessToken)).status,404);
          const initial=await request(path,memberSession.accessToken);
          assert.equal(initial.headers.get('cache-control'),'no-store');
          assert.equal((await initial.json() as {state:string}).state,'reserved');
          const resolution={claimId:id,operationId:randomUUID(),reason:'TEST witnessed delivery'};
          assert.equal((await request('fulfillments',memberSession.accessToken,resolution)).status,403);
          assert.equal((await request('fulfillments',ownerSession.accessToken,resolution)).status,201);
          assert.equal((await (await request(path,memberSession.accessToken)).json() as {state:string}).state,'fulfilled');
          const other=await make({active:true});
          const cancelInput={...input,experienceId:other.id,operationId:randomUUID()};
          const second=await request('reservations',memberSession.accessToken,cancelInput);
          assert.equal(second.status,201);
          const secondReceipt=await second.json() as {id:string};
          const cancellation={...resolution,claimId:secondReceipt.id,operationId:randomUUID()};
          assert.equal((await request('cancellations',memberSession.accessToken,cancellation)).status,201);
          const cancelled=await request('reservations/'+cancelInput.operationId,memberSession.accessToken);
          assert.equal((await cancelled.json() as {state:string}).state,'cancelled');
          const web=await startWebPanel(await app.getUrl(),true);
          try {
            const page=(operation:string,token?:string)=>fetch(web.url+'/dashboard/participation?operation='+operation,{
              headers:token?{Cookie:'__Host-ghahvehto-access='+token}:{},
            });
            const campaign=await make({active:true,branch:branch.id});
            await pool.query("UPDATE experiences SET title='TEST <b>پیشنهاد خصوصی</b>' WHERE id=$1",[campaign.id]);
            const offerQuery=(branchId:string)=>new URLSearchParams({experienceId:campaign.id,branchId,version:'1'});
            assert.equal((await request('offer?'+offerQuery(branch.id))).status,401);
            assert.equal((await request('offer?'+offerQuery(foreign.id),memberSession.accessToken)).status,404);
            const formPage=await fetch(web.url+'/dashboard/participation?'+new URLSearchParams({
              experience:campaign.id,branch:branch.id,version:'1',
            }),{headers:{Cookie:'__Host-ghahvehto-access='+memberSession.accessToken}});
            const formHtml=await formPage.text();
            assert.match(formHtml,/رزرو این تجربه/);
            assert.match(formHtml,/TEST &lt;b&gt;پیشنهاد خصوصی&lt;\/b&gt;/);
            assert.match(formHtml,/قابل رزرو/);
            const operationId=/<input(?=[^>]*name="operationId")[^>]*value="([^"]+)"/.exec(formHtml)?.[1];
            assert.ok(operationId);
            const form=new URLSearchParams({experienceId:campaign.id,branchId:branch.id,operationId,version:'1'});
            const submit=(origin?:string)=>fetch(web.url+'/dashboard/participation/reserve',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+memberSession.accessToken,
                ...(origin?{Origin:origin}:{})},body:form,
            });
            assert.equal((await submit()).status,403);
            assert.equal((await submit('https://foreign.invalid')).status,403);
            const submissions=await Promise.all([submit('https://panel.example.test'),submit('https://panel.example.test')]);
            for(const submission of submissions) {
              assert.equal(submission.status,303);
              assert.equal(submission.headers.get('location'),'/dashboard/participation?operation='+operationId);
            }
            assert.match(await (await page(operationId,memberSession.accessToken)).text(),/رزرو شده/);
            assert.equal((await pool.query('SELECT 1 FROM experience_claims WHERE operation_id=$1',[operationId])).rowCount,1);
            const exhausted=await request('offer?'+offerQuery(branch.id),memberSession.accessToken);
            assert.equal((await exhausted.json() as {eligibility:string}).eligibility,'limit_reached');
            const response=await page(input.operationId,memberSession.accessToken);
            assert.equal(response.status,200);
            assert.match(response.headers.get('cache-control')??'',/no-store/);
            const html=await response.text();
            assert.match(html,/dir="rtl"/);
            assert.match(html,/تحویل ثبت شده/);
            assert.ok(html.includes(id));
            assert.ok(!html.includes(memberSession.accessToken));
            assert.match(await (await page(cancelInput.operationId,memberSession.accessToken)).text(),/لغو شده/);
            const foreignHtml=await (await page(input.operationId,foreignSession.accessToken)).text();
            assert.match(foreignHtml,/رسید مشارکت در دسترس نیست/);
            assert.ok(!foreignHtml.includes(id));
            assert.match(await (await page(input.operationId)).text(),/به نشست معتبر نیاز دارید/);
          } finally {await web.close();}
          await sessions.revoke(memberSession.accessToken);
          assert.equal((await request(path,memberSession.accessToken)).status,401);
        } finally {await app.close();}
      } finally {await runtime.end();await host.query(`DROP ROLE ${login}`);}
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
      for(const table of ['star_entries','tier_entries']) assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0);
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
