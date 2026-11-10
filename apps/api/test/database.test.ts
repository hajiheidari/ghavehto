import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';
import { readDirectory } from '../src/nest/directory-controller.js';

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
