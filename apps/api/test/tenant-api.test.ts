import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate, schemaReady } from '../src/nest/migrations.js';
import { createApp } from '../src/nest/app.js';
import { OtpCrypto } from '../src/nest/otp.js';
import { PhoneVault } from '../src/nest/phone-vault.js';
import { SessionService } from '../src/nest/sessions.js';
import { validateRuntimePool } from '../src/nest/tenant-access.js';
import { fetchCafeAccess, fetchBranchAccess, updateCafeProfile } from '@ghahvehto/contracts/access-client';

test('real HTTP tenant authorization uses verified sessions and restricted runtime login', async () => {
  assert.ok(process.env.DATABASE_URL);
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const login = `gh_test_${randomBytes(8).toString('hex')}`, password = randomBytes(24).toString('hex');
  let runtime: pg.Pool | undefined, server: Awaited<ReturnType<typeof createApp>> | undefined;
  const vault = new PhoneVault(randomBytes(32), new Map([['test', randomBytes(32)]]), 'test');
  const crypto = new OtpCrypto(randomBytes(32)), ip = '127.0.0.1';
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
    await admin.query(`ALTER ROLE ${login} INHERIT`);
    try { await assert.rejects(validateRuntimePool(runtime), /Restricted identity runtime/); }
    finally { await admin.query(`ALTER ROLE ${login} NOINHERIT`); }
    await admin.query(`GRANT ghahvehto_identity TO ${login} WITH INHERIT TRUE`);
    try { await assert.rejects(validateRuntimePool(runtime), /Restricted identity runtime/); }
    finally { await admin.query(`GRANT ghahvehto_identity TO ${login} WITH INHERIT FALSE`); }
    let code = '';
    server = await createApp({ runtimePool: runtime, initialLogin: {
      crypto, vault, provider: { enabled: true, async send(input) { code = input.code; } },
    } });
    await server.app.listen(0, '127.0.0.1');
    const base = await server.app.getUrl();
    const directory = await fetch(`${base}/v1/directory?q=unpublished-fixture`);
    assert.equal(directory.status, 200);
    assert.deepEqual(await directory.json(), {items:[],hasMore:false});
    const unknownBranch = await fetch(`${base}/v1/directory/branches/${branchA}`);
    assert.equal(unknownBranch.status,404);
    assert.equal(unknownBranch.headers.get('cache-control'),'no-store');
    const loginRequest = (route: string, body: object) => fetch(`${base}/v1/auth/otp/${route}`, {
      method: 'POST', headers: {'Content-Type':'application/json', 'X-Forwarded-For':'not-a-valid-ip'},
      body: JSON.stringify(body),
    });
    assert.equal((await loginRequest('request', {mobile:phones[0], ip:'192.0.2.20'})).status, 400);
    assert.equal((await loginRequest('request', {mobile:'invalid-mobile'})).status, 400);
    const verified = [];
    for (const phone of phones) {
      const challenge = await loginRequest('request', {mobile:phone});
      assert.equal(challenge.status, 201);
      assert.equal(challenge.headers.get('cache-control'), 'no-store');
      const {challengeId} = await challenge.json() as {challengeId:string};
      const proof = {challengeId, mobile:phone, code};
      const verification = await loginRequest('verify', proof);
      assert.equal(verification.status, 201);
      assert.equal(verification.headers.get('cache-control'), 'no-store');
      const tokens = await verification.json() as Awaited<ReturnType<SessionService['issueInTransaction']>>;
      const status = await fetch(`${base}/v1/session`, {headers:{Authorization:`Bearer ${tokens.accessToken}`}});
      assert.equal(status.status, 200);
      const {userId} = await status.json() as {userId:string};
      identities.push(userId); verified.push({userId, tokens});
      assert.equal((await loginRequest('verify', proof)).status, 401);
    }
    const [owner, staff, consumer] = verified;
    await admin.query("INSERT INTO cafes(id,name,normalized_name,slug) VALUES($1,'TEST A','test a',$3),($2,'TEST B','test b',$4)", [cafeA, cafeB, `test-${cafeA}`, `test-${cafeB}`]);
    await admin.query("INSERT INTO branches(id,cafe_id,name,province,city) VALUES($1,$3,'TEST FIRST','TEST','TEST'),($2,$3,'TEST OTHER','TEST','TEST')", [branchA, branchOther, cafeA]);
    const {rows:[source]} = await admin.query("INSERT INTO source_records(cafe_id,source_url,retrieved_at,rights_status) VALUES($1,'https://example.invalid/claim',now(),'permitted') RETURNING id", [cafeA]);
    await admin.query("INSERT INTO directory_listings(branch_id,cafe_id,source_id,cafe_name,branch_name,province,city,reviewed_at) VALUES($1,$2,$3,'TEST A','TEST FIRST','TEST','TEST',now())", [branchA,cafeA,source.id]);
    await admin.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner')", [owner.userId, cafeA]);
    await admin.query("INSERT INTO cafe_memberships(user_id,cafe_id,branch_id,role) VALUES($1,$2,$3,'staff')", [staff.userId, cafeA, branchA]);
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
    assert.equal((await request(path, consumer.tokens.accessToken)).status, 404);
    const claimPath = '/v1/ownership-claims';
    assert.equal((await request(claimPath,undefined,'POST',{branchId:branchA})).status,401);
    assert.equal((await request(claimPath,consumer.tokens.accessToken,'POST',{branchId:branchOther})).status,404);
    const publicBranch = await request(`/v1/directory/branches/${branchA}`);
    assert.equal(publicBranch.status,200);
    assert.equal((await publicBranch.json()).branchName,'TEST FIRST');
    const claim = await request(claimPath,consumer.tokens.accessToken,'POST',{branchId:branchA});
    assert.equal(claim.status,201);
    const {claimId} = await claim.json() as {claimId:string};
    const duplicate = await request(claimPath,consumer.tokens.accessToken,'POST',{branchId:branchA});
    assert.equal(duplicate.status,201);
    assert.deepEqual(await duplicate.json(),{claimId});
    assert.deepEqual(await (await request(claimPath,staff.tokens.accessToken)).json(),[]);
    assert.deepEqual(await (await request(claimPath,consumer.tokens.accessToken)).json(),[{claimId,branchId:branchA,status:'pending'}]);
    assert.equal((await request(`${claimPath}/${claimId}`,staff.tokens.accessToken,'DELETE')).status,404);
    assert.equal((await request(path,consumer.tokens.accessToken)).status,404);
    assert.equal((await request(`${claimPath}/${claimId}`,consumer.tokens.accessToken,'DELETE')).status,200);
    assert.deepEqual(await (await request(claimPath,consumer.tokens.accessToken)).json(),[{claimId,branchId:branchA,status:'withdrawn'}]);
    const newClaim = await request(claimPath,consumer.tokens.accessToken,'POST',{branchId:branchA});
    assert.equal(newClaim.status,201);
    const reviewedId = (await newClaim.json()).claimId;
    const review = await admin.connect();
    try {
      await review.query('BEGIN');
      assert.equal((await review.query("SELECT has_function_privilege('ghahvehto_app','public.review_ownership_claim(uuid,text,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
      await review.query('SET LOCAL ROLE ghahvehto_ownership_review');
      assert.equal((await review.query('SELECT id FROM ownership_review_queue WHERE id=$1',[reviewedId])).rowCount,1);
      await review.query('SAVEPOINT withdrawn_claim');
      await assert.rejects(review.query("SELECT public.review_ownership_claim($1,'verified',$2)",[claimId,randomUUID()]),{code:'40001'});
      await review.query('ROLLBACK TO SAVEPOINT withdrawn_claim');
      assert.equal((await review.query("SELECT public.review_ownership_claim($1,'verified',$2) AS verdict",[reviewedId,randomUUID()])).rows[0].verdict,'verified');
      assert.equal((await review.query('SELECT id FROM ownership_review_queue WHERE id=$1',[reviewedId])).rowCount,0);
      await review.query('COMMIT');
    } catch (error) { await review.query('ROLLBACK'); throw error; }
    finally { review.release(); }
    const statuses = await (await request(claimPath,consumer.tokens.accessToken)).json() as {claimId:string;status:string}[];
    assert.equal(statuses.find(row=>row.claimId===reviewedId)?.status,'verified');
    assert.equal((await request(`${claimPath}/${reviewedId}`,consumer.tokens.accessToken,'DELETE')).status,404);
    assert.equal((await request(path,consumer.tokens.accessToken)).status,404);
    assert.equal((await admin.query("SELECT id FROM audit_events WHERE cafe_id=$1 AND action='ownership.claim_reviewed'",[cafeA])).rowCount,1);
    const changeAccess = async (operation:string) => {
      const operator = await admin.connect();
      try {
        await operator.query('BEGIN');
        await operator.query('SET LOCAL ROLE ghahvehto_ownership_access');
        const result = await operator.query('SELECT public.change_ownership_access($1,$2,$3) AS id',[reviewedId,operation,'TEST access decision']);
        await operator.query('COMMIT');
        return result.rows[0].id;
      } catch(error) { await operator.query('ROLLBACK'); throw error; }
      finally { operator.release(); }
    };
    for (const role of ['ghahvehto_app','ghahvehto_ownership_review']) {
      assert.equal((await admin.query("SELECT has_function_privilege($1,'public.change_ownership_access(uuid,text,text)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
    }
    await assert.rejects(changeAccess('grant'),{code:'40001'}); // Existing owner must not be replaced.
    await admin.query("DELETE FROM cafe_memberships WHERE cafe_id=$1 AND user_id=$2 AND role='owner'",[cafeA,owner.userId]);
    const grantId = await changeAccess('grant');
    assert.equal(await changeAccess('grant'),grantId);
    assert.equal((await request(path,consumer.tokens.accessToken)).status,200);
    assert.equal((await request(`/v1/cafes/${cafeB}/access`,consumer.tokens.accessToken)).status,404);
    assert.equal(await changeAccess('revoke'),grantId);
    assert.equal((await request(path,consumer.tokens.accessToken)).status,404);
    assert.equal((await request('/v1/session',consumer.tokens.accessToken)).status,200);
    await assert.rejects(changeAccess('grant'),{code:'40001'});
    assert.equal((await admin.query("SELECT id FROM audit_events WHERE cafe_id=$1 AND action IN ('ownership.access_grant','ownership.access_revoke')",[cafeA])).rowCount,2);
    await admin.query("INSERT INTO cafe_memberships(user_id,cafe_id,role) VALUES($1,$2,'owner')",[owner.userId,cafeA]);
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
    await admin.query('DELETE FROM ownership_access_grants WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM cafe_memberships WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM ownership_claims WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM directory_listings WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
    await admin.query('DELETE FROM source_records WHERE cafe_id=ANY($1::uuid[])', [[cafeA,cafeB]]);
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
