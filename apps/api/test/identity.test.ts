import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';
import { IdentityService } from '../src/nest/identity.js';
import { OtpChallengeService } from '../src/nest/otp-challenges.js';
import { OtpCrypto } from '../src/nest/otp.js';
import { PhoneVault } from '../src/nest/phone-vault.js';
import { SessionService } from '../src/nest/sessions.js';
import { identityTransaction } from '../src/nest/identity-transaction.js';

test('real identity verification is atomic, private and grants no commercial privileges', async t => {
  assert.ok(process.env.DATABASE_URL, 'Disposable database required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const phone = '+989120000000', ip = '192.0.2.10';
  const vault = new PhoneVault(randomBytes(32), new Map([['test', randomBytes(32)]]), 'test');
  const cryptos: OtpCrypto[] = [];
  function service() {
    const crypto = new OtpCrypto(randomBytes(32)); cryptos.push(crypto);
    let code = '';
    const otp = new OtpChallengeService(pool, crypto, { enabled: true, async send(input) { code = input.code; } });
    return { otp, identity: new IdentityService(pool, otp, vault), code: () => code };
  }
  try {
    await migrate(pool);
    await t.test('concurrent valid challenges converge on one identity; replay cannot issue twice', async () => {
      // Separate OTP key epochs model overlapping challenges across a key rotation.
      const a = service(), b = service();
      const [ca, cb] = await Promise.all([a.otp.request(phone, ip), b.otp.request(phone, ip)]);
      const [ra, rb] = await Promise.all([a.identity.verify(ca.challengeId, phone, a.code(), ip), b.identity.verify(cb.challengeId, phone, b.code(), ip)]);
      assert.ok(ra); assert.ok(rb); assert.equal(ra.userId, rb.userId);
      assert.notEqual(ra.tokens.accessToken, rb.tokens.accessToken);
      assert.equal(await a.identity.verify(ca.challengeId, phone, a.code(), ip), null);
      assert.equal((await new SessionService(pool).authenticate(ra.tokens.accessToken))?.userId, ra.userId);
      const stored = (await pool.query('SELECT * FROM users WHERE id=$1', [ra.userId])).rows[0];
      assert.equal(vault.open(ra.userId, stored.phone_ciphertext), phone);
      assert.equal(stored.phone_ciphertext.includes(phone), false);
      assert.equal((await pool.query('SELECT id FROM cafe_memberships WHERE user_id=$1', [ra.userId])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM users WHERE phone_hash=$1', [vault.lookup(phone)])).rowCount, 1);
    });
    await t.test('failed transaction rolls back OTP, identity, sessions and audit together', async () => {
      const a = service(), id = randomUUID();
      const receipt = await a.otp.request(phone, ip);
      await assert.rejects(a.otp.complete(receipt.challengeId, phone, a.code(), ip, async (client) => {
        await client.query('INSERT INTO users(id,phone_hash,phone_ciphertext,phone_verified_at) VALUES($1,$2,$3,clock_timestamp())', [id, randomBytes(32), vault.seal(id, phone)]);
        await new SessionService(pool).issueInTransaction(client, id);
        throw new Error('Synthetic rollback after session creation');
      }), /Synthetic rollback/);
      assert.equal((await pool.query('SELECT id FROM users WHERE id=$1', [id])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM sessions WHERE user_id=$1', [id])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM audit_events WHERE actor_id=$1', [id])).rowCount, 0);
      assert.equal((await pool.query('SELECT status FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rows[0].status, 'sent');
      assert.ok(await a.identity.verify(receipt.challengeId, phone, a.code(), ip));
    });
    await t.test('deleted identities cannot be reactivated or receive new sessions', async () => {
      const existing = (await pool.query('SELECT id FROM users WHERE phone_hash=$1', [vault.lookup(phone)])).rows[0].id;
      await pool.query('UPDATE users SET deleted_at=clock_timestamp() WHERE id=$1', [existing]);
      const count = (await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [existing])).rows[0].n;
      const a = service(), receipt = await a.otp.request(phone, ip);
      assert.equal(await a.identity.verify(receipt.challengeId, phone, a.code(), ip), null);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [existing])).rows[0].n, count);
      assert.ok((await pool.query('SELECT deleted_at FROM users WHERE id=$1', [existing])).rows[0].deleted_at);
    });
    await t.test('identity role cannot read café data, modify memberships or erase audit', async () => {
      for (const sql of ['SELECT * FROM cafes', 'DELETE FROM audit_events', 'UPDATE cafe_memberships SET role=\'owner\'']) {
        await assert.rejects(identityTransaction(pool, client => client.query(sql)), { code: '42501' });
      }
      const client = await pool.connect();
      try { assert.notEqual((await client.query('SELECT current_user')).rows[0].current_user, 'ghahvehto_identity', 'Local role must not leak into pooled connections'); }
      finally { client.release(); }
    });
  } finally {
    const ids = (await pool.query('SELECT id FROM users WHERE phone_hash=$1', [vault.lookup(phone)])).rows.map(r => r.id);
    await pool.query('DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    for (const crypto of cryptos) {
      await pool.query('DELETE FROM otp_challenges WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
      await pool.query('DELETE FROM otp_verification_limits WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
    }
    await pool.end();
  }
});
