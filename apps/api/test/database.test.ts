import { test } from 'node:test';
import assert from 'node:assert/strict';
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
