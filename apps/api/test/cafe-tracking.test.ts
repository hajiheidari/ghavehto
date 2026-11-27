import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';
import {prepareCafeTrackingQr} from '../src/nest/cafe-tracking-qr.js';
import {createApp} from '../src/nest/app.js';
import {IdentityService} from '../src/nest/identity.js';
import {OtpChallengeService} from '../src/nest/otp-challenges.js';
import {OtpCrypto} from '../src/nest/otp.js';
import {PhoneVault} from '../src/nest/phone-vault.js';
import {SessionService} from '../src/nest/sessions.js';
import {createHash} from 'node:crypto';
import {startWebPanel} from './web-panel.js';

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
    await t.test('printable drafts store only hashes and stay inactive until separately authorized',async()=>{
      const draft=await prepareCafeTrackingQr(pool,{cafeId:cafe.id,branchId:branch.id,publicOrigin:'https://example.invalid',lifetimeSeconds:3600,attributionWindowSeconds:600});
      const code=new URL(draft.url).pathname.split('/').at(-1)!;
      const hash=createHash('sha256').update(code,'ascii').digest();
      assert.deepEqual((await pool.query('SELECT active,code_hash,attribution_window_seconds FROM cafe_tracking_links WHERE id=$1',[draft.id])).rows,
        [{active:false,code_hash:hash,attribution_window_seconds:600}]);
      await assert.rejects(pool.query(touch,[hash,'qr_scan',randomUUID()]),{code:'22023'});
    });
    await t.test('verified identity creation attaches tracking once, atomically, without changing returning users',async()=>{
      const code=randomBytes(32).toString('hex'),hash=createHash('sha256').update(code,'ascii').digest();
      const {rows:[l]}=await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
        VALUES($1,$2,$3,true,clock_timestamp()+interval '1 hour',3600) RETURNING id`,[cafe.id,branch.id,hash]);
      const operation=randomUUID();
      const {rows:[scan]}=await pool.query(touch,[hash,'qr_scan',operation]);
      const legacyVisitor=randomBytes(32);
      await pool.query('INSERT INTO cafe_tracking_consents(operation_id,visitor_hash) VALUES($1,$2)',[operation,legacyVisitor]);
      const {rows:[legacy]}=await pool.query("SELECT public.record_consented_cafe_touch($1,'qr_scan',$2,$3,true) AS result",[hash,operation,legacyVisitor]);
      assert.deepEqual(legacy.result,{state:'recorded',touchId:scan.id});
      const {rows:[unconsented]}=await pool.query(touch,[hash,'qr_scan',randomUUID()]);
      const vault=new PhoneVault(randomBytes(32),new Map([['test',randomBytes(32)]]),'test');
      const ip='192.0.2.18',phone='+989120000018';
      const service=()=>{
        let captured='';
        const otp=new OtpChallengeService(pool,new OtpCrypto(randomBytes(32)),{enabled:true,async send(input){captured=input.code;}});
        return {otp,identity:new IdentityService(pool,otp,vault),code:()=>captured};
      };
      const a=service(),b=service();
      const [ca,cb]=await Promise.all([a.otp.request(phone,ip),b.otp.request(phone,ip)]);
      const tracking={code,touchId:scan.id};
      const [ra,rb]=await Promise.all([a.identity.verify(ca.challengeId,phone,a.code(),ip,{tracking}),b.identity.verify(cb.challengeId,phone,b.code(),ip,{tracking})]);
      assert.ok(ra);assert.ok(rb);assert.equal(ra.userId,rb.userId);
      assert.equal(await a.identity.verify(ca.challengeId,phone,a.code(),ip,{tracking}),null);
      assert.equal((await new SessionService(pool).authenticate(ra.tokens.accessToken))?.userId,ra.userId);
      assert.deepEqual((await pool.query(metrics,[l.id])).rows,[{qr_scans:'2',store_clicks:'0',registrations:'1',phone_verifications:'1',confirmed_interactions:'0'}]);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='tracking.registration_attributed' AND metadata->>'touchId'=$1",[scan.id])).rowCount,1);
      const factsBefore=(await pool.query('SELECT * FROM cafe_tracking_identity_facts WHERE user_id=$1',[ra.userId])).rows;
      const returning=service(),cr=await returning.otp.request(phone,ip);
      assert.ok(await returning.identity.verify(cr.challengeId,phone,returning.code(),ip,{tracking:{code,touchId:randomUUID()}}));
      assert.deepEqual((await pool.query('SELECT * FROM cafe_tracking_identity_facts WHERE user_id=$1',[ra.userId])).rows,factsBefore);
      // An account first created without attribution never acquires a registration later.
      const oldPhone='+989120000019',old=service(),co=await old.otp.request(oldPhone,ip);
      const ro=await old.identity.verify(co.challengeId,oldPhone,old.code(),ip);assert.ok(ro);
      const again=service(),cg=await again.otp.request(oldPhone,ip);
      assert.ok(await again.identity.verify(cg.challengeId,oldPhone,again.code(),ip,{tracking}));
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_identity_facts WHERE user_id=$1',[ro.userId])).rowCount,0);
      const rollbackPhone='+989120000020',failed=service(),cf=await failed.otp.request(rollbackPhone,ip);
      const auditCount=(await pool.query("SELECT 1 FROM audit_events WHERE action='tracking.registration_attributed'")).rowCount;
      let rolledBackId='';
      await assert.rejects(failed.identity.verify(cf.challengeId,rollbackPhone,failed.code(),ip,{tracking,onRegistration:async(client,id)=>{
        rolledBackId=id;
        // Fail after attribution AND session insertion to demonstrate the whole commit boundary.
        await new SessionService(pool).issueInTransaction(client,id);
        throw new Error('TEST rollback tracking');
      }}),/TEST rollback tracking/);
      for(const table of ['users','sessions','cafe_tracking_identity_facts'])
        assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE ${table==='users'?'id':'user_id'}=$1`,[rolledBackId])).rowCount,0);
      assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE action='tracking.registration_attributed'")).rowCount,auditCount);
      assert.equal((await pool.query('SELECT status FROM otp_challenges WHERE id=$1',[cf.challengeId])).rows[0].status,'sent');
      assert.ok(await failed.identity.verify(cf.challengeId,rollbackPhone,failed.code(),ip,{tracking}));
      const invalid=[undefined,{code:'bad',touchId:'bad'},{code,touchId:randomUUID()},{code:randomBytes(32).toString('hex'),touchId:scan.id},{code,touchId:unconsented.id}];
      for(let i=0;i<invalid.length;i++){
        const p='+98912000003'+(i+1),svc=service(),ch=await svc.otp.request(p,ip);
        const result=await svc.identity.verify(ch.challengeId,p,svc.code(),ip,{tracking:invalid[i]});assert.ok(result);
        assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_identity_facts WHERE user_id=$1',[result.userId])).rowCount,0);
      }
      for(const change of ["expires_at=clock_timestamp()-interval '1 second'",'active=false']){
        await pool.query(`UPDATE cafe_tracking_links SET ${change} WHERE id=$1`,[l.id]);
        const p=change.startsWith('expires')?'+989120000025':'+989120000026',svc=service(),ch=await svc.otp.request(p,ip);
        const result=await svc.identity.verify(ch.challengeId,p,svc.code(),ip,{tracking});assert.ok(result);
        assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_identity_facts WHERE user_id=$1',[result.userId])).rowCount,0);
      }
      // A valid link with an out-of-window touch is also optional, not a login failure.
      const staleCode=randomBytes(32).toString('hex'),staleHash=createHash('sha256').update(staleCode,'ascii').digest();
      const {rows:[staleLink]}=await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
        VALUES($1,$2,$3,true,clock_timestamp()+interval '1 hour',1) RETURNING id`,[cafe.id,branch.id,staleHash]);
      const staleOperation=randomUUID();
      const {rows:[staleTouch]}=await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at) VALUES($1,$2,'qr_scan',clock_timestamp()-interval '1 hour') RETURNING id`,[staleLink.id,staleOperation]);
      await pool.query('INSERT INTO cafe_tracking_consents(operation_id,visitor_hash) VALUES($1,$2)',[staleOperation,randomBytes(32)]);
      const stale=service(),p='+989120000027',ch=await stale.otp.request(p,ip);
      const result=await stale.identity.verify(ch.challengeId,p,stale.code(),ip,{tracking:{code:staleCode,touchId:staleTouch.id}});assert.ok(result);
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_identity_facts WHERE user_id=$1',[result.userId])).rowCount,0);
    });
    await t.test('explicit landing consent is rate limited across links and replicas, with read-only GET and rejection',async()=>{
      const login='gh_tracking_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
      await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      await host.query(`GRANT ghahvehto_tracking TO ${login}`);
      const address=new URL(base);address.username=login;address.password=password;
      const runtime=new pg.Pool({connectionString:address.toString()});
      let server:Awaited<ReturnType<typeof createApp>>|undefined;
      try {
        const key=randomBytes(32),config={pool:runtime,ipKey:key,publicOrigin:'https://example.invalid'};
        server=await createApp({tracking:config});await server.app.listen(0,'127.0.0.1');
        let url=await server.app.getUrl();
        const code=randomBytes(32).toString('hex'),hash=createHash('sha256').update(code,'ascii').digest();
        await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
          VALUES($1,$2,$3,true,clock_timestamp()+interval '1 hour',3600)`,[cafe.id,branch.id,hash]);
        const post=(body:object,origin:string|null=config.publicOrigin,linkCode=code)=>fetch(`${url}/q/${linkCode}`,{
          method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),'X-Forwarded-For':`192.0.2.${Math.floor(Math.random()*200)+1}`},body:JSON.stringify(body),
        });
        const before=(await pool.query('SELECT 1 FROM cafe_tracking_touches')).rowCount;
        const consentBefore=(await pool.query('SELECT 1 FROM cafe_tracking_consents')).rowCount ?? 0;
        const page=await fetch(`${url}/q/${code}`);assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');
        assert.match(await page.text(),/dir="rtl"/);assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_touches')).rowCount,before);
        const body={consent:'yes',kind:'qr_scan',operationId:randomUUID()};
        for(const origin of [null,'https://foreign.invalid']) assert.equal((await post(body,origin)).status,400);
        const refusal=await post({...body,consent:'no'});
        assert.equal(refusal.status,201);
        assert.deepEqual(await refusal.json(),{tracked:false,touchId:null,registrationTracking:null});
        assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_rate_limits')).rowCount,0);
        assert.equal((await post({...body,consent:true})).status,400);
        const declinedForm=await fetch(`${url}/q/${code}`,{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({...body,consent:'no'})});
        assert.equal(declinedForm.status,201);assert.match(declinedForm.headers.get('content-type')??'',/text\/html/);
        assert.match(await declinedForm.text(),/بدون ثبت رهگیری/);
        assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_consents')).rowCount,consentBefore);
        // An unavailable but syntactically valid code consumes the shared abuse budget.
        assert.equal((await post({...body,operationId:randomUUID()},config.publicOrigin,randomBytes(32).toString('hex'))).status,400);
        const responses=await Promise.all([post(body),post(body)]);
        assert.deepEqual(responses.map(r=>r.status),[201,201]);
        const [a,b]=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(a,b);
        assert.deepEqual(a.registrationTracking,{trackingCode:code,trackingTouchId:a.touchId});
        let proof='';
        const otp=new OtpChallengeService(pool,new OtpCrypto(randomBytes(32)),{enabled:true,async send(input){proof=input.code;}});
        const vault=new PhoneVault(randomBytes(32),new Map([['test',randomBytes(32)]]),'test');
        const phone='+989120000040',ip='192.0.2.40';
        const challenge=await otp.request(phone,ip);
        const {trackingCode,trackingTouchId}=a.registrationTracking;
        const registration=await new IdentityService(pool,otp,vault).verify(challenge.challengeId,phone,proof,ip,
          {tracking:{code:trackingCode,touchId:trackingTouchId}});
        assert.ok(registration);
        const facts=await pool.query('SELECT fact FROM cafe_tracking_identity_facts WHERE user_id=$1 AND touch_id=$2 ORDER BY fact',
          [registration.userId,trackingTouchId]);
        assert.deepEqual(facts.rows,[{fact:'phone_verified'},{fact:'registration'}]);
        assert.equal((await post({...body,kind:'store_click'})).status,409);
        await server.app.close();server=await createApp({tracking:config});await server.app.listen(0,'127.0.0.1');url=await server.app.getUrl();
        const clicks=await Promise.all(Array.from({length:29},()=>post({...body,kind:'store_click',operationId:randomUUID()})));
        assert.equal(clicks.filter(r=>r.status===201).length,28);assert.equal(clicks.filter(r=>r.status===429).length,1);
        const secondCode=randomBytes(32).toString('hex');
        await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
          VALUES($1,$2,$3,true,clock_timestamp()+interval '1 hour',3600)`,[cafe.id,branch.id,createHash('sha256').update(secondCode,'ascii').digest()]);
        const limited=await post({...body,operationId:randomUUID()},config.publicOrigin,secondCode);
        assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'3600');
        // Exact retry remains usable after quota exhaustion and service restart.
        assert.deepEqual(await (await post(body)).json(),a);
        assert.deepEqual((await pool.query('SELECT attempts FROM cafe_tracking_rate_limits')).rows,[{attempts:30}]);
        assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_consents')).rowCount,consentBefore+29);
        const {rows:[digests]}=await pool.query(`SELECT count(DISTINCT c.visitor_hash)::integer AS distinct_receipts,
          count(*) FILTER (WHERE q.visitor_hash IS NOT NULL)::integer AS quota_matches
          FROM cafe_tracking_consents c LEFT JOIN cafe_tracking_rate_limits q USING(visitor_hash)
          WHERE c.operation_scoped`);
        assert.deepEqual(digests,{distinct_receipts:29,quota_matches:0});
        await assert.rejects(pool.query("SELECT public.record_consented_cafe_touch($1,'qr_scan',$2,$3,true)",
          [hash,body.operationId,randomBytes(32)]),{code:'23505'});
        await pool.query("UPDATE cafe_tracking_rate_limits SET window_started_at=clock_timestamp()-interval '2 hours'");
        const acceptedForm=await fetch(`${url}/q/${code}`,{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({...body,operationId:randomUUID()})});
        assert.equal(acceptedForm.status,201);assert.match(await acceptedForm.text(),/رهگیری انتخاب‌شده ثبت شد/);
        assert.deepEqual((await pool.query('SELECT attempts FROM cafe_tracking_rate_limits')).rows,[{attempts:1}]);
        for(const sql of ['SELECT * FROM users','SELECT * FROM cafe_tracking_touches','UPDATE cafe_tracking_links SET active=true']){
          const client=await runtime.connect();try{
            await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_tracking');
            await assert.rejects(client.query(sql),{code:'42501'});await client.query('ROLLBACK');
          }finally{await client.query('ROLLBACK');client.release();}
        }
      }finally {
        await server?.app.close();await runtime.end();
        await pool.query(`REASSIGN OWNED BY ${login} TO CURRENT_USER`);await pool.query(`DROP OWNED BY ${login}`);
        await host.query(`DROP ROLE ${login}`);
      }
    });
    await t.test('retention inventory counts dependency types without exposing or changing records',async()=>{
      const report='SELECT public.inspect_tracking_retention($1) AS inventory';
      const cutoff=new Date();
      const expected=await pool.query(`SELECT
        (SELECT count(*)::integer FROM cafe_tracking_touches WHERE recorded_at<$1) AS touches,
        (SELECT count(*)::integer FROM cafe_tracking_consents c JOIN cafe_tracking_touches t USING(operation_id) WHERE t.recorded_at<$1) AS "consentReceipts",
        (SELECT count(*)::integer FROM cafe_tracking_consents c JOIN cafe_tracking_touches t USING(operation_id) WHERE t.recorded_at<$1 AND NOT c.operation_scoped) AS "legacyConsentReceipts",
        (SELECT count(*)::integer FROM cafe_tracking_identity_facts f JOIN cafe_tracking_touches t ON t.id=f.touch_id WHERE t.recorded_at<$1) AS "identityFacts",
        (SELECT count(*)::integer FROM cafe_tracking_interactions i JOIN cafe_tracking_touches t ON t.id=i.touch_id WHERE t.recorded_at<$1) AS interactions`,[cutoff]);
      const {rows:[{inventory}]}=await pool.query(report,[cutoff]);
      for(const [key,value] of Object.entries(expected.rows[0])) {
        assert.ok(Number(value)>0);
        assert.equal(inventory[key],value);
      }
      assert.ok(Object.values(inventory).every(value=>typeof value==='number'));
      assert.ok(inventory.withinAttributionWindow>0);
      assert.equal((await pool.query(report,['2000-01-01T00:00:00Z'])).rows[0].inventory.touches,0);
      for(const invalid of [null,'infinity','9999-01-01T00:00:00Z']) await assert.rejects(pool.query(report,[invalid]),{code:'22023'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_tracking');
        await assert.rejects(client.query(report,[cutoff]),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
      assert.deepEqual((await pool.query(report,[cutoff])).rows[0].inventory,inventory);
    });
    await t.test('maintenance prunes old quota buckets in bounded batches and preserves active windows and consent',async()=>{
      const prune='SELECT public.prune_expired_tracking_buckets() AS removed';
      const consentCount=(await pool.query('SELECT count(*) FROM public.cafe_tracking_consents')).rows[0].count;
      await pool.query(`INSERT INTO public.cafe_tracking_rate_limits(visitor_hash,window_started_at,attempts)
        SELECT sha256(convert_to('retention-test-'||n,'UTF8')),clock_timestamp()-interval '2 hours',30
        FROM generate_series(1,1001) AS n`);
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_tracking');
        await assert.rejects(client.query(prune),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
      const active=(await pool.query("SELECT count(*) FROM public.cafe_tracking_rate_limits WHERE window_started_at>clock_timestamp()-interval '1 hour'")).rows[0].count;
      assert.equal((await pool.query(prune)).rows[0].removed,1000);
      assert.equal((await pool.query(prune)).rows[0].removed,1);
      assert.equal((await pool.query(prune)).rows[0].removed,0);
      assert.equal((await pool.query('SELECT count(*) FROM public.cafe_tracking_rate_limits')).rows[0].count,active);
      assert.equal((await pool.query('SELECT count(*) FROM public.cafe_tracking_consents')).rows[0].count,consentCount);
    });
    await t.test('verified owners can stop a link once while preserving existing receipts',async()=>{
      const l=await link(),op=randomUUID();
      const {rows:[existing]}=await pool.query(touch,[l.hash,'qr_scan',op]);
      const stop='SELECT public.stop_cafe_tracking_link($1,$2,$3) AS changed';
      await assert.rejects(pool.query(stop,[await user(),l.id,'TEST foreign owner']),{code:'42501'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_tracking');
        await assert.rejects(client.query(stop,[owner,l.id,'TEST restricted runtime']),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
      const results=await Promise.all(Array.from({length:2},()=>pool.query(stop,[owner,l.id,'TEST stop link'])));
      assert.deepEqual(results.map(result=>result.rows[0].changed).sort(),[false,true]);
      await assert.rejects(pool.query(touch,[l.hash,'qr_scan',randomUUID()]),{code:'22023'});
      assert.deepEqual((await pool.query(touch,[l.hash,'qr_scan',op])).rows,[existing]);
      const audit=await pool.query("SELECT actor_id FROM audit_events WHERE action='tracking.link_stopped' AND metadata->>'linkId'=$1",[l.id]);
      assert.deepEqual(audit.rows,[{actor_id:owner}]);
    });
    await t.test('private owner transport authenticates stop requests using a dedicated restricted login',async()=>{
      const login='gh_tracking_owner_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
      await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      const address=new URL(base);address.username=login;address.password=password;
      const runtime=new pg.Pool({connectionString:address.toString()});
      try {
        await host.query(`GRANT ghahvehto_tracking_owner TO ${login}`);
        await assert.rejects(createApp({trackingOwnerPool:pool}),/Dedicated restricted/);
        const standard=await createApp();
        try {
          await standard.app.listen(0,'127.0.0.1');
          assert.equal((await fetch((await standard.app.getUrl())+'/v1/internal/tracking-owner/stop',{method:'POST'})).status,404);
        } finally {await standard.app.close();}
        const {app}=await createApp({trackingOwnerPool:runtime});
        try {
          await app.listen(0,'127.0.0.1');
          const sessions=new SessionService(pool);
          const [ownerSession,foreignSession]=await Promise.all([sessions.issue(owner),sessions.issue(await user())]);
          const l=await link();
          const send=async(token?:string,extra:object={})=>fetch((await app.getUrl())+'/v1/internal/tracking-owner/stop',{
            method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
            body:JSON.stringify({linkId:l.id,reason:'TEST owner stop',...extra}),
          });
          assert.equal((await send()).status,401);
          assert.equal((await send(foreignSession.accessToken)).status,403);
          assert.equal((await send(ownerSession.accessToken,{actorId:owner})).status,400);
          const listing=async(token:string,query:string)=>fetch((await app.getUrl())+'/v1/internal/tracking-owner/links?'+query,
            {headers:{authorization:'Bearer '+token}});
          assert.equal((await listing(foreignSession.accessToken,'cafeId='+cafe.id)).status,403);
          const first=await listing(ownerSession.accessToken,'cafeId='+cafe.id);
          assert.equal(first.status,200);
          const page=await first.json() as {items:Record<string,unknown>[];nextCursor:string|null};
          assert.ok(page.items.length>0);
          for(const item of page.items) assert.deepEqual(Object.keys(item).sort(),['active','branchId','expiresAt','linkId']);
          assert.equal((await listing(ownerSession.accessToken,'cafeId='+cafe.id+'&after='+randomUUID())).status,400);
          const web=await startWebPanel(await app.getUrl(),false,true);
          try {
            const path='/dashboard/cafe/'+cafe.id+'/tracking';
            const get=(token?:string)=>fetch(web.url+path,{headers:token?{Cookie:'__Host-ghahvehto-access='+token}:{}});
            const ownerPage=await get(ownerSession.accessToken);
            assert.match(ownerPage.headers.get('cache-control')??'',/no-store/);
            const html=await ownerPage.text();
            assert.match(html,/dir="rtl"/);
            assert.match(html,/توقف پیوند/);
            assert.ok(!html.includes(ownerSession.accessToken));
            const denied=await (await get(foreignSession.accessToken)).text();
            assert.match(denied,/مجوز مالک ندارید/);
            assert.ok(!denied.includes(l.id));
            assert.match(await (await get()).text(),/به نشست معتبر نیاز دارید/);
            await pool.query(touch,[l.hash,'qr_scan',randomUUID()]);
            await pool.query(touch,[l.hash,'store_click',randomUUID()]);
            const metricsPath='/v1/internal/tracking-owner/metrics?'+new URLSearchParams({cafeId:cafe.id,linkId:l.id});
            const readMetrics=async(token?:string,path=metricsPath)=>fetch((await app.getUrl())+path,{headers:token?{authorization:'Bearer '+token}:{}});
            assert.equal((await readMetrics()).status,401);
            assert.equal((await readMetrics(foreignSession.accessToken)).status,403);
            assert.equal((await readMetrics(ownerSession.accessToken,'/v1/internal/tracking-owner/metrics?'+
              new URLSearchParams({cafeId:randomUUID(),linkId:l.id}))).status,403);
            const measured=await readMetrics(ownerSession.accessToken);
            assert.equal(measured.headers.get('cache-control'),'no-store');
            assert.deepEqual(await measured.json(),{linkId:l.id,qrScans:'1',storeClicks:'1',registrations:'0',phoneVerifications:'0',confirmedInteractions:'0'});
            const metricPage=await fetch(web.url+path+'/metrics?link='+l.id,{headers:{Cookie:'__Host-ghahvehto-access='+ownerSession.accessToken}});
            const metricHtml=await metricPage.text();
            assert.match(metricHtml,/اسکن ثبت‌شده/);assert.match(metricHtml,/تعامل تأییدشده/);
            assert.ok(metricHtml.includes(new Intl.NumberFormat('fa-IR').format(1)));
            const foreignMetrics=await (await fetch(web.url+path+'/metrics?link='+l.id,{headers:{Cookie:'__Host-ghahvehto-access='+foreignSession.accessToken}})).text();
            assert.match(foreignMetrics,/مجوز مالک ندارید/);
            const webLink=await link();
            const submit=(token:string,origin?:string)=>fetch(web.url+path+'/stop',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,...(origin?{Origin:origin}:{})},
              body:new URLSearchParams({linkId:webLink.id,reason:'TEST stop from panel'}),
            });
            const mismatch=await fetch(web.url+'/dashboard/cafe/'+randomUUID()+'/tracking/stop',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+ownerSession.accessToken,Origin:'https://panel.example.test'},
              body:new URLSearchParams({linkId:webLink.id,reason:'TEST mismatched cafe'}),
            });
            assert.match(mismatch.headers.get('location')??'',/stop=unconfirmed/);
            assert.equal((await pool.query('SELECT active FROM cafe_tracking_links WHERE id=$1',[webLink.id])).rows[0].active,true);
            assert.equal((await submit(ownerSession.accessToken)).status,403);
            assert.equal((await submit(ownerSession.accessToken,'https://foreign.invalid')).status,403);
            assert.match((await submit(foreignSession.accessToken,'https://panel.example.test')).headers.get('location')??'',/stop=unconfirmed/);
            assert.match((await submit(ownerSession.accessToken,'https://panel.example.test')).headers.get('location')??'',/stop=saved/);
            assert.equal((await pool.query('SELECT active FROM cafe_tracking_links WHERE id=$1',[webLink.id])).rows[0].active,false);
          } finally {await web.close();}
          for(let i=0;i<21;i++) await link();
          const firstPage=await (await listing(ownerSession.accessToken,'cafeId='+cafe.id)).json() as typeof page;
          assert.equal(firstPage.items.length,20);
          assert.ok(firstPage.nextCursor);
          const secondPage=await (await listing(ownerSession.accessToken,'cafeId='+cafe.id+'&after='+firstPage.nextCursor)).json() as typeof page;
          const ids=[...firstPage.items,...secondPage.items].map(item=>item.linkId);
          assert.equal(new Set(ids).size,ids.length);
          const stopped=await send(ownerSession.accessToken);
          assert.equal(stopped.status,201);
          assert.equal(stopped.headers.get('cache-control'),'no-store');
          assert.deepEqual(await stopped.json(),{changed:true});
          assert.deepEqual(await (await send(ownerSession.accessToken)).json(),{changed:false});
          await sessions.revoke(ownerSession.accessToken);
          assert.equal((await send(ownerSession.accessToken)).status,401);
          await assert.rejects(runtime.query('SELECT * FROM users'),{code:'42501'});
        } finally {await app.close();}
      } finally {await runtime.end();await host.query(`DROP ROLE ${login}`);}
    });
    await t.test('configured retention prunes only expired unattributed touches and preserves counts and retry retirement',async()=>{
      const l=await link(),oldOperation=randomUUID();
      const oldTouch=(await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at)
        VALUES($1,$2,'qr_scan',clock_timestamp()-interval '3 days') RETURNING id`,[l.id,oldOperation])).rows[0].id;
      await pool.query('INSERT INTO cafe_tracking_consents(operation_id,visitor_hash) VALUES($1,$2)',[oldOperation,randomBytes(32)]);
      await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at)
        SELECT $1,gen_random_uuid(),'qr_scan',clock_timestamp()-interval '3 days' FROM generate_series(1,1002)`,[l.id]);
      const linked=(await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at)
        VALUES($1,gen_random_uuid(),'qr_scan',clock_timestamp()-interval '3 days') RETURNING id`,[l.id])).rows[0].id;
      const who=await user();
      await pool.query(`INSERT INTO cafe_tracking_identity_facts(user_id,touch_id,fact,fact_at)
        VALUES($1,$2,'registration',clock_timestamp()),($1,$2,'phone_verified',clock_timestamp())`,[who,linked]);
      const {rows:[longLink]}=await pool.query(`INSERT INTO cafe_tracking_links(cafe_id,branch_id,code_hash,active,expires_at,attribution_window_seconds)
        VALUES($1,$2,$3,true,clock_timestamp()+interval '7 days',604800) RETURNING id`,[cafe.id,branch.id,randomBytes(32)]);
      const withinWindow=(await pool.query(`INSERT INTO cafe_tracking_touches(link_id,operation_id,kind,recorded_at)
        VALUES($1,gen_random_uuid(),'qr_scan',clock_timestamp()-interval '3 days') RETURNING id`,[longLink.id])).rows[0].id;
      const before=(await pool.query(metrics,[l.id])).rows;
      const prune="SELECT public.prune_unattributed_tracking(clock_timestamp()-interval '2 days') AS removed";
      const transaction=await pool.connect();
      try {
        await transaction.query('BEGIN');
        assert.equal((await transaction.query(prune)).rows[0].removed,1000);
        assert.equal((await transaction.query("SELECT current_setting('ghahvehto.tracking_retention',true) AS flag")).rows[0].flag,'');
        await transaction.query('ROLLBACK');
      } finally {await transaction.query('ROLLBACK');transaction.release();}
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_touches WHERE id=$1',[oldTouch])).rowCount,1);
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_retired_operations WHERE operation_id=$1',[oldOperation])).rowCount,0);
      assert.equal((await pool.query(prune)).rows[0].removed,1000);
      assert.equal((await pool.query(prune)).rows[0].removed,3);
      assert.equal((await pool.query(prune)).rows[0].removed,0);
      assert.deepEqual((await pool.query(metrics,[l.id])).rows,before);
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_touches WHERE id=ANY($1::uuid[])',[[linked,withinWindow]])).rowCount,2);
      assert.equal((await pool.query('SELECT 1 FROM cafe_tracking_consents WHERE operation_id=$1',[oldOperation])).rowCount,0);
      await assert.rejects(pool.query(touch,[l.hash,'qr_scan',oldOperation]),{code:'22023'});
      await assert.rejects(pool.query('DELETE FROM cafe_tracking_touches'),{code:'55000'});
      await assert.rejects(pool.query('SELECT public.prune_unattributed_tracking(clock_timestamp())'),{code:'22023'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_tracking');
        await assert.rejects(client.query(prune),{code:'42501'});
        await client.query('ROLLBACK');
        await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_tracking');
        await client.query("SELECT set_config('ghahvehto.tracking_retention','active',true)");
        await assert.rejects(client.query('DELETE FROM cafe_tracking_touches'),{code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
    });
    await t.test('expired, inactive and ownership-revoked links reject new touches; runtime cannot forge facts',async()=>{
      for(const l of [await link(false),await link(true,true)]) await assert.rejects(pool.query(touch,[l.hash,'qr_scan',randomUUID()]),{code:'22023'});
      const l=await link();
      await pool.query('UPDATE ownership_access_grants SET revoked_at=clock_timestamp(),membership_id=NULL WHERE id=$1',[grant.id]);
      await assert.rejects(pool.query(touch,[l.hash,'qr_scan',randomUUID()]),{code:'22023'});
      const client=await pool.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity']){
          for(const [sql,args] of [[touch,[l.hash,'qr_scan',randomUUID()]],[attribute,[owner,randomUUID()]],[interact,[owner,randomUUID()]],[metrics,[main.id]],['SELECT public.register_cafe_tracking_draft($1,$2,$3,$4,$5,$6)',[cafe.id,branch.id,null,l.hash,3600,600]]] as const){
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
