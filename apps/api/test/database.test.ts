import { test } from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';
import { readDirectory, readDirectoryBranch } from '../src/nest/directory-controller.js';

// Use a disposable local/CI database only. Fixtures are explicitly synthetic and rolled back.
test('PostgreSQL migrations are repeatable; RLS isolates café and branch access', async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required; database tests must not silently skip');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    await migrate(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = {
        owner: '10000000-0000-0000-0000-000000000001', staff: '10000000-0000-0000-0000-000000000002',
        a: '20000000-0000-0000-0000-000000000001', b: '20000000-0000-0000-0000-000000000002',
        branchA: '30000000-0000-0000-0000-000000000001', branchB: '30000000-0000-0000-0000-000000000002',
      };
      await client.query("INSERT INTO users(id,phone_hash,phone_ciphertext) VALUES($1,'\\x01','\\x01'),($2,'\\x02','\\x02')", [ids.owner,ids.staff]);
      await client.query("INSERT INTO cafes(id,name,normalized_name,slug) VALUES($1,'TEST ONLY A','test a','test-only-a'),($2,'TEST ONLY B','test b','test-only-b')", [ids.a,ids.b]);
      await client.query("INSERT INTO branches(id,cafe_id,name,province,city) VALUES($1,$3,'TEST BRANCH A','TEST','TEST'),($2,$3,'TEST BRANCH B','TEST','TEST')", [ids.branchA, ids.branchB, ids.a]);
      await client.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner')", [ids.owner,ids.a]);
      await client.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff')", [ids.staff,ids.a,ids.branchA]);
      const {rows:[source]} = await client.query("INSERT INTO source_records(cafe_id,source_url,retrieved_at,rights_status) VALUES($1,'https://example.invalid/test',now(),'permitted') RETURNING id", [ids.a]);
      await client.query("INSERT INTO directory_listings(branch_id,cafe_id,source_id,cafe_name,branch_name,province,city,reviewed_at) VALUES($1,$2,$3,'تست كافه','شعبه ۲','آزمایشی','شهر تست',now())", [ids.branchA,ids.a,source.id]);
      await client.query('SET LOCAL ROLE ghahvehto_identity');
      assert.deepEqual(await readDirectory(client,'کافه',1), {items:[{
        id:ids.branchA,cafeName:'تست كافه',branchName:'شعبه ۲',province:'آزمایشی',city:'شهر تست',neighborhood:'',
      }],hasMore:false});
      assert.equal((await readDirectory(client,'شعبه 2',1)).items.length,1);
      assert.equal((await readDirectoryBranch(client,ids.branchA))?.branchName,'شعبه ۲');
      assert.equal(await readDirectoryBranch(client,ids.branchB),null);
      assert.equal((await readDirectory(client,"' OR 1=1 --",1)).items.length,0);
      assert.equal((await readDirectory(client,'',2)).items.length,0);
      await client.query('RESET ROLE');
      assert.equal((await client.query("SELECT has_table_privilege('ghahvehto_identity','directory_listings','UPDATE') AS writable")).rows[0].writable,false);
      await client.query("UPDATE directory_listings SET withdrawn_at=now() WHERE branch_id=$1", [ids.branchA]);
      await client.query('SET LOCAL ROLE ghahvehto_identity');
      assert.deepEqual(await readDirectory(client,'کافه',1), {items:[],hasMore:false});
      await client.query('RESET ROLE');
      await client.query("UPDATE directory_listings SET withdrawn_at=NULL WHERE branch_id=$1", [ids.branchA]);
      await client.query("UPDATE source_records SET rights_status='denied' WHERE id=$1", [source.id]);
      await client.query('SET LOCAL ROLE ghahvehto_identity');
      assert.deepEqual(await readDirectory(client,'کافه',1), {items:[],hasMore:false});
      await client.query('RESET ROLE');
      const review = 'SELECT public.review_directory_listing($1,$2,$3,$4,$5,$6) AS revision';
      const correction = {cafeName:'کافه اصلاح‌شده',branchName:'شعبه ۲',province:'آزمایشی',city:'شهر تست',neighborhood:''};
      assert.equal((await client.query("SELECT has_function_privilege('ghahvehto_app','public.review_directory_listing(uuid,integer,text,text,uuid,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false);
      await client.query('SET LOCAL ROLE ghahvehto_directory_review');
      await client.query('SAVEPOINT denied_source');
      await assert.rejects(client.query(review,[ids.branchA,1,'publish','TEST review',source.id,correction]),{code:'22023'});
      await client.query('ROLLBACK TO SAVEPOINT denied_source');
      await client.query('RESET ROLE');
      await client.query("UPDATE source_records SET rights_status='permitted' WHERE id=$1", [source.id]);
      await client.query('SET LOCAL ROLE ghahvehto_directory_review');
      assert.equal((await client.query(review,[ids.branchA,1,'publish','TEST correction',source.id,correction])).rows[0].revision,2);
      await client.query('SAVEPOINT stale_revision');
      await assert.rejects(client.query(review,[ids.branchA,1,'withdraw','TEST stale',null,null]),{code:'40001'});
      await client.query('ROLLBACK TO SAVEPOINT stale_revision');
      assert.equal((await client.query(review,[ids.branchA,2,'withdraw','TEST removal',null,null])).rows[0].revision,3);
      await client.query('RESET ROLE');
      assert.deepEqual((await client.query("SELECT action,metadata->>'revision' AS revision FROM audit_events WHERE cafe_id=$1 AND action LIKE 'directory.%' ORDER BY created_at, metadata->>'revision'", [ids.a])).rows,
        [{action:'directory.publish',revision:'2'},{action:'directory.withdraw',revision:'3'}]);
      await client.query('SET LOCAL ROLE ghahvehto_identity');
      assert.deepEqual(await readDirectory(client,'اصلاح',1), {items:[],hasMore:false});
      assert.equal(await readDirectoryBranch(client,ids.branchA),null);
      await client.query('RESET ROLE');
      const {rows:[program]}=await client.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[ids.a]);
      await client.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,10)',[program.id,ids.a]);
      const stamp=`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
        VALUES($1,$2,$3,1,gen_random_uuid(),1,'award','TEST',now())`;
      await client.query(stamp,[ids.owner,ids.a,program.id]);
      const {rows:[star]}=await client.query(`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at)
        VALUES($1,gen_random_uuid(),5,'award','TEST',now()) RETURNING id,operation_id`,[ids.owner]);
      await client.query(`INSERT INTO tier_entries(user_id,qualification_year,operation_id,units,kind,reason,effective_at)
        VALUES($1,2026,$2,5,'award','TEST',now())`,[ids.owner,star.operation_id]);
      const reversal=`INSERT INTO star_entries(user_id,operation_id,units,kind,reason,effective_at,reversal_of)
        VALUES($1,gen_random_uuid(),$2,'reversal','TEST',now(),$3)`;
      for(const [query,params,code] of [
        [stamp,[ids.owner,ids.b,program.id],'23503'],
        [reversal,[ids.staff,-5,star.id],'23503'],
        [reversal,[ids.owner,-4,star.id],'23503'],
        ["INSERT INTO tier_entries(user_id,qualification_year,operation_id,units,kind,reason,effective_at) VALUES($1,2026,gen_random_uuid(),-1,'spend','TEST',now())",[ids.owner],'23514'],
        ["UPDATE stamp_entries SET reason='TEST EDIT'",[],'55000'],
        ['DELETE FROM star_entries',[],'55000'],
        ['TRUNCATE tier_entries',[],'55000'],
      ] as const) {
        await client.query('SAVEPOINT journal_guard');
        await assert.rejects(client.query(query,[...params]),{code});
        await client.query('ROLLBACK TO SAVEPOINT journal_guard');
        await client.query('RELEASE SAVEPOINT journal_guard');
      }
      await client.query(reversal,[ids.owner,-5,star.id]);
      assert.equal((await client.query('SELECT sum(units) AS balance FROM star_entries WHERE user_id=$1',[ids.owner])).rows[0].balance,'0');
      assert.equal((await client.query("SELECT has_table_privilege('ghahvehto_app','star_entries','INSERT') AS allowed")).rows[0].allowed,false);
      await client.query('UPDATE users SET phone_verified_at=now() WHERE id IN ($1,$2)',[ids.owner,ids.staff]);
      const issue='SELECT public.award_branch_stamp($1,$2,$3,$4,$5,$6,$7) AS id';
      const operation=randomUUID();
      const award=[ids.staff,ids.owner,ids.a,ids.branchA,program.id,1,operation];
      assert.equal((await client.query("SELECT has_function_privilege('ghahvehto_app','public.award_branch_stamp(uuid,uuid,uuid,uuid,uuid,integer,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
      await client.query('SET LOCAL ROLE ghahvehto_stamp_issuer');
      const first=(await client.query(issue,award)).rows[0].id;
      assert.equal((await client.query(issue,award)).rows[0].id,first);
      for(const [params,code] of [
        [[ids.staff,ids.owner,ids.a,ids.branchB,program.id,1,randomUUID()],'42501'],
        [[ids.staff,ids.owner,ids.a,ids.branchA,program.id,2,operation],'23505'],
        [[ids.staff,ids.owner,ids.a,ids.branchA,program.id,2,randomUUID()],'22023'],
        [[ids.staff,ids.staff,ids.a,ids.branchA,program.id,1,randomUUID()],'22023'],
      ] as const) {
        await client.query('SAVEPOINT stamp_guard');
        await assert.rejects(client.query(issue,[...params]),{code});
        await client.query('ROLLBACK TO SAVEPOINT stamp_guard');
        await client.query('RELEASE SAVEPOINT stamp_guard');
      }
      await client.query('RESET ROLE');
      assert.deepEqual((await client.query('SELECT units,award_branch_id,award_actor_id FROM stamp_entries WHERE operation_id=$1',[operation])).rows,
        [{units:1,award_branch_id:ids.branchA,award_actor_id:ids.staff}]);
      assert.equal((await client.query("SELECT id FROM audit_events WHERE action='loyalty.stamp_awarded' AND metadata->>'operationId'=$1",[operation])).rowCount,1);
      const issueQr='SELECT public.issue_stamp_qr($1,$2,$3,$4,1) AS token';
      const consumeQr='SELECT public.consume_stamp_qr($1,$2,$3) AS id';
      const qrParams=[ids.owner,ids.a,ids.branchA,program.id];
      assert.equal((await client.query("SELECT has_function_privilege('ghahvehto_app','public.consume_stamp_qr(uuid,uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
      await client.query('SET LOCAL ROLE ghahvehto_stamp_qr');
      const {rows:[qr]}=await client.query(issueQr,qrParams);
      const {rows:[expired]}=await client.query(issueQr,qrParams);
      assert.match(qr.token,/^[0-9a-f]{64}$/);
      assert.notEqual(qr.token,expired.token);
      await client.query('RESET ROLE');
      await client.query("UPDATE stamp_qr_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=sha256(convert_to($1,'UTF8'))",[expired.token]);
      await client.query('SET LOCAL ROLE ghahvehto_stamp_qr');
      for(const params of [[ids.staff,ids.branchB,qr.token],[ids.staff,ids.branchA,expired.token]]) {
        await client.query('SAVEPOINT qr_guard');
        await assert.rejects(client.query(consumeQr,params),{code:'22023'});
        await client.query('ROLLBACK TO SAVEPOINT qr_guard');
        await client.query('RELEASE SAVEPOINT qr_guard');
      }
      const {rows:[receipt]}=await client.query(consumeQr,[ids.staff,ids.branchA,qr.token]);
      await client.query('SAVEPOINT qr_replay');
      await assert.rejects(client.query(consumeQr,[ids.staff,ids.branchA,qr.token]),{code:'22023'});
      await client.query('ROLLBACK TO SAVEPOINT qr_replay');
      await client.query('RESET ROLE');
      assert.deepEqual((await client.query('SELECT entry_id,consumed_at IS NOT NULL AS consumed FROM stamp_qr_tokens WHERE token_hash=sha256(convert_to($1,\'UTF8\'))',[qr.token])).rows,
        [{entry_id:receipt.id,consumed:true}]);
      assert.equal((await client.query('SELECT id FROM stamp_entries WHERE id=$1 AND units=1',[receipt.id])).rowCount,1);
      await client.query('SET LOCAL ROLE ghahvehto_stamp_qr');
      for(let i=0;i<3;i++) await client.query(issueQr,[ids.owner,ids.a,ids.branchB,program.id]);
      await client.query('SAVEPOINT qr_rate');
      await assert.rejects(client.query(issueQr,qrParams),{code:'54000'});
      await client.query('ROLLBACK TO SAVEPOINT qr_rate');
      await client.query('RELEASE SAVEPOINT qr_rate');
      await client.query('RESET ROLE');
      assert.equal((await client.query('SELECT count(*)::int AS total FROM stamp_qr_tokens WHERE recipient_id=$1',[ids.owner])).rows[0].total,5);
      await client.query("UPDATE stamp_qr_tokens SET issued_at=clock_timestamp()-interval '61 seconds' WHERE recipient_id=$1",[ids.owner]);
      await client.query('SET LOCAL ROLE ghahvehto_stamp_qr');
      assert.match((await client.query(issueQr,qrParams)).rows[0].token,/^[0-9a-f]{64}$/);
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE ghahvehto_app');
      assert.equal((await client.query('SELECT id FROM cafes')).rowCount, 0);
      await client.query("SELECT set_config('app.user_id',$1,true)", [ids.owner]);
      assert.deepEqual((await client.query('SELECT id FROM cafes')).rows.map(r=>r.id), [ids.a]);
      assert.equal((await client.query("UPDATE cafes SET name = 'TEST UPDATED' WHERE id = $1", [ids.b])).rowCount, 0);
      assert.equal((await client.query("UPDATE cafes SET name = 'TEST UPDATED' WHERE id = $1", [ids.a])).rowCount, 1);
      assert.equal((await client.query('SELECT id FROM users')).rowCount, 1);
      await client.query("SELECT set_config('app.user_id',$1,true)", [ids.staff]);
      assert.deepEqual((await client.query('SELECT id FROM branches')).rows.map(r=>r.id), [ids.branchA]);
      assert.equal((await client.query("UPDATE cafes SET name = 'TEST STAFF' WHERE id = $1", [ids.a])).rowCount, 0);
    } finally { await client.query('ROLLBACK'); client.release(); }
  } finally { await pool.end(); }
});
