import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';

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
