import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate, schemaReady } from '../src/nest/migrations.js';
import { createApp } from '../src/nest/app.js';
import { OtpCrypto } from '../src/nest/otp.js';
import { OtpChallengeService } from '../src/nest/otp-challenges.js';
import { PhoneVault } from '../src/nest/phone-vault.js';
import { IdentityService } from '../src/nest/identity.js';
import { SessionService } from '../src/nest/sessions.js';
import { validateRuntimePool } from '../src/nest/tenant-access.js';
import { fetchCafeAccess, fetchBranchAccess, updateCafeProfile } from '@ghahvehto/contracts/access-client';

test('real HTTP tenant authorization uses verified sessions and restricted runtime login', async () => {
  assert.ok(process.env.DATABASE_URL);
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const login = `gh_test_${randomBytes(8).toString('hex')}`, password = randomBytes(24).toString('hex');
  let runtime: pg.Pool | undefined, server: Awaited<ReturnType<typeof createApp>> | undefined;
  const vault = new PhoneVault(randomBytes(32), new Map([['test', randomBytes(32)]]), 'test');
  const crypto = new OtpCrypto(randomBytes(32)), ip = '192.0.2.20';
  const cafeA = randomUUID(), cafeB = randomUUID(), branchA = randomUUID(), branchOther = randomUUID();
  const identities: string[] = [];
  const phones = ['+989120000001', '+989120000002', '+989120000003'];
  let roleCreated = false;
  try {
    await migrate(admin);
    await assert.rejects(validateRuntimePool(admin), /Restricted identity runtime/);
    // Generated identifiers/passwords contain only known safe characters; no configured credentials are printed.
    await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
    roleCreated = true;
    await admin.query(`GRANT ghahvehto_identity,ghahvehto_app TO ${login}`);
    const connection = new URL(process.env.DATABASE_URL); connection.username = login; connection.password = password;
    runtime = new pg.Pool({ connectionString: connection.toString(), max: 2 });
    await validateRuntimePool(runtime);
    let code = '';
    const otp = new OtpChallengeService(runtime, crypto, { enabled: true, async send(input) { code = input.code; } });
    const identity = new IdentityService(runtime, otp, vault);
    const verified = [];
    for (const phone of phones) {
      const receipt = await otp.request(phone, ip);
      const result = await identity.verify(receipt.challengeId, phone, code, ip);
      assert.ok(result); identities.push(result.userId); verified.push(result);
    }
    const [owner, staff, consumer] = verified;
    await admin.query("INSERT INTO cafes(id,name,normalized_name,slug) VALUES($1,'TEST A','test a',$3),($2,'TEST B','test b',$4)", [cafeA, cafeB, `test-${cafeA}`, `test-${cafeB}`]);
    await admin.query("INSERT INTO branches(id,cafe_id,name,province,city) VALUES($1,$3,'TEST FIRST','TEST','TEST'),($2,$3,'TEST OTHER','TEST','TEST')", [branchA, branchOther, cafeA]);
    await admin.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner')", [owner.userId, cafeA]);
    await admin.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff')", [staff.userId, cafeA, branchA]);
    server = await createApp({ runtimePool: runtime });
    await server.app.listen(0, '127.0.0.1');
    const base = await server.app.getUrl();
    const request = (path: string, token?: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}) => fetch(base + path, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? {'Content-Type':'application/json'} : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const path = `/v1/cafes/${cafeA}/access`, profile = `/v1/cafes/${cafeA}/profile`;
    assert.equal((await request('/health/ready')).status, 200);
    const readinessFixture = await admin.connect();
    try {
      await readinessFixture.query('BEGIN');
      await readinessFixture.query("UPDATE schema_migrations SET checksum='test-mismatch' WHERE version='007_runtime_readiness'");
      await readinessFixture.query('SET LOCAL ROLE ghahvehto_identity');
      assert.equal(await schemaReady(readinessFixture), false);
    } finally { await readinessFixture.query('ROLLBACK'); readinessFixture.release(); }
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, 'a'.repeat(43))).status, 401);
    assert.equal((await request(path, owner.tokens.refreshToken)).status, 401);
    const ownSession = await request('/v1/session', owner.tokens.accessToken);
    assert.equal(ownSession.status, 200);
    assert.equal((await ownSession.json()).userId, owner.userId);
    assert.equal((await request('/v1/session/refresh', undefined, 'POST', {refreshToken:consumer.tokens.refreshToken,userId:owner.userId})).status, 400);
    const refreshed = await request('/v1/session/refresh', undefined, 'POST', {refreshToken:consumer.tokens.refreshToken});
    assert.equal(refreshed.status, 201);
    assert.equal(refreshed.headers.get('cache-control'), 'no-store');
    const newTokens = await refreshed.json() as {accessToken:string;refreshToken:string};
    assert.equal((await request('/v1/session', consumer.tokens.accessToken)).status, 401);
    assert.equal((await request('/v1/session', newTokens.accessToken)).status, 200);
    assert.equal((await request('/v1/session/refresh', undefined, 'POST', {refreshToken:consumer.tokens.refreshToken})).status, 401);
    assert.equal((await request('/v1/session', newTokens.accessToken)).status, 401, 'HTTP refresh reuse revokes the descendant family');
    assert.equal((await request(path, consumer.tokens.accessToken)).status, 404);
    const response = await request(path, owner.tokens.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { cafeId: cafeA, name: 'TEST A' });
    assert.equal((await request(`/v1/cafes/${cafeB}/access`, owner.tokens.accessToken)).status, 404);
    assert.equal((await request(`/v1/cafes/${cafeA}/branches/${branchA}/access`, staff.tokens.accessToken)).status, 200);
    assert.equal((await request(`/v1/cafes/${cafeA}/branches/${branchOther}/access`, staff.tokens.accessToken, 'GET', undefined, {'x-user-id':owner.userId})).status, 404);
    assert.equal((await request(`/v1/cafes/${cafeB}/branches/${branchA}/access`, staff.tokens.accessToken)).status, 404);
    assert.equal((await request(profile, staff.tokens.accessToken, 'PATCH', {name:'TEST FORBIDDEN'})).status, 404);
    assert.equal((await request(profile, owner.tokens.accessToken, 'PATCH', {name:'TEST', userId:owner.userId, role:'owner'})).status, 400);
    assert.equal((await request(profile, owner.tokens.accessToken, 'PATCH', {name:'   '})).status, 400);
    assert.equal((await request(profile, owner.tokens.accessToken, 'PATCH', {name:'x'.repeat(121)})).status, 400);
    assert.deepEqual(await fetchCafeAccess(base, cafeA, owner.tokens.accessToken), {cafeId:cafeA, name:'TEST A'});
    assert.equal((await fetchBranchAccess(base, cafeA, branchA, staff.tokens.accessToken)).branchId, branchA);
    assert.equal((await updateCafeProfile(base, cafeA, 'TEST UPDATED', owner.tokens.accessToken)).name, 'TEST UPDATED');
    assert.equal((await admin.query("SELECT id FROM audit_events WHERE actor_id=$1 AND cafe_id=$2 AND action='cafe.profile_updated'", [owner.userId, cafeA])).rowCount, 1);
    assert.equal((await request('/v1/dashboards/admin', owner.tokens.accessToken)).status, 401);
    assert.equal((await request('/v1/dashboards/agents', owner.tokens.accessToken)).status, 401);
    assert.equal((await request('/v1/session/logout', owner.tokens.accessToken, 'POST')).status, 201);
    assert.equal((await request('/v1/session/logout', owner.tokens.accessToken, 'POST')).status, 201);
    assert.equal((await admin.query("SELECT id FROM audit_events WHERE actor_id=$1 AND action='session.revoked'", [owner.userId])).rowCount, 1);
    assert.equal((await request(path, owner.tokens.accessToken)).status, 401);
    await admin.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1', [staff.userId]);
    assert.equal((await request(path, staff.tokens.accessToken)).status, 401);
    const client = await runtime.connect();
    try {
      const context = (await client.query("SELECT current_user,current_setting('app.user_id',true) AS actor")).rows[0];
      assert.equal(context.current_user, login); assert.ok(!context.actor, 'Tenant context must reset on success and errors');
      await assert.rejects(client.query('SELECT * FROM users'), {code:'42501'});
    } finally { client.release(); }
  } finally {
    await server?.app.close();
    await runtime?.end();
    await admin.query('DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[]) OR cafe_id=ANY($2::uuid[])', [identities, [cafeA,cafeB]]);
    await admin.query('DELETE FROM cafe_memberships WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM branches WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM cafes WHERE id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [identities]);
    await admin.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [identities]);
    await admin.query('DELETE FROM otp_challenges WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
    await admin.query('DELETE FROM otp_verification_limits WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
    if (roleCreated) await admin.query(`DROP ROLE ${login}`);
    await admin.end();
  }
});
