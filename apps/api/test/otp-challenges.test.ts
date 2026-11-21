import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';
import { OtpCrypto, type OtpProvider } from '../src/nest/otp.js';
import { OtpChallengeService } from '../src/nest/otp-challenges.js';

// Disposable DB only. Capturing provider exists exclusively in tests; no network send.
test('persistent OTP lifecycle and concurrent rate limits on real PostgreSQL', async t => {
  assert.ok(process.env.DATABASE_URL, 'Disposable PostgreSQL DATABASE_URL required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const phone = '+989120000000', ip = '192.0.2.1', otherIp = '192.0.2.2';
  async function fixture(run: (service: OtpChallengeService, crypto: OtpCrypto, deliveries: { destination: string; code: string }[]) => Promise<void>, fail = false) {
    const crypto = new OtpCrypto(randomBytes(32));
    const deliveries: { destination: string; code: string }[] = [];
    const provider: OtpProvider = { enabled: true, async send(input) {
      if (fail) throw new Error('SYNTHETIC provider error with private payload');
      deliveries.push(input);
    } };
    try { await run(new OtpChallengeService(pool, crypto, provider), crypto, deliveries); }
    finally {
      const hashes = [ip, otherIp].map(value => crypto.fingerprint('ip', value));
      await pool.query('DELETE FROM otp_challenges WHERE ip_hash=ANY($1::bytea[])', [hashes]);
      await pool.query('DELETE FROM otp_verification_limits WHERE ip_hash=ANY($1::bytea[])', [hashes]);
    }
  }
  try {
    await migrate(pool);
    await t.test('disabled adapter has zero storage effects', async () => {
      const crypto = new OtpCrypto(randomBytes(32));
      const service = new OtpChallengeService(pool, crypto);
      await assert.rejects(service.request(phone, ip), /OTP delivery is disabled/);
      assert.equal((await pool.query('SELECT id FROM otp_challenges WHERE phone_hash=$1', [crypto.fingerprint('phone', phone)])).rowCount, 0);
    });
    await t.test('hash-only storage, wrong identity/code, concurrent single-use and café-role denial', async () => fixture(async (service, crypto, deliveries) => {
      const receipt = await service.request(phone, ip);
      assert.equal(deliveries.length, 1);
      const stored = (await pool.query('SELECT * FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rows[0];
      for (const field of ['phone_hash', 'ip_hash', 'code_digest']) assert.equal(stored[field].length, 32);
      assert.equal(JSON.stringify(stored).includes(phone), false);
      assert.equal(stored.status, 'sent');
      assert.equal(await service.consume(receipt.challengeId, '+989130000000', deliveries[0].code, ip), false);
      const wrong = deliveries[0].code === '000000' ? '000001' : '000000';
      assert.equal(await service.consume(receipt.challengeId, phone, wrong, ip), false);
      const results = await Promise.all([service.consume(receipt.challengeId, phone, deliveries[0].code, ip), service.consume(receipt.challengeId, phone, deliveries[0].code, otherIp)]);
      assert.deepEqual(results.sort(), [false, true]);
      assert.equal(await service.consume(receipt.challengeId, phone, deliveries[0].code, ip), false);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ghahvehto_app');
        await assert.rejects(client.query('SELECT * FROM otp_challenges'), { code: '42501' });
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal((await pool.query('SELECT attempts FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rows[0].attempts, 2);
    }));
    await t.test('five attempts persist across service instances, malformed guesses count and expiry rejects', async () => fixture(async (service, crypto, deliveries) => {
      const first = await service.request(phone, ip);
      for (let attempt = 0; attempt < 5; attempt++) assert.equal(await service.consume(first.challengeId, phone, 'bad', ip), false);
      const restarted = new OtpChallengeService(pool, crypto);
      assert.equal(await restarted.consume(first.challengeId, phone, deliveries[0].code, ip), false);
      await pool.query("UPDATE otp_challenges SET created_at=created_at-interval '61 seconds' WHERE id=$1", [first.challengeId]);
      const next = await service.request(phone, ip);
      await pool.query("UPDATE otp_challenges SET expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '6 minutes' WHERE id=$1", [next.challengeId]);
      assert.equal(await restarted.consume(next.challengeId, phone, deliveries[1].code, ip), false);
    }));
    await t.test('simultaneous sends share cooldown; resend supersedes prior code; phone cap spans IPs', async () => fixture(async (service, _crypto, deliveries) => {
      const receipts = await Promise.all(Array.from({ length: 8 }, () => service.request(phone, ip)));
      assert.equal(deliveries.length, 1);
      const first = (await pool.query('SELECT id FROM otp_challenges WHERE id=ANY($1::uuid[])', [receipts.map(r => r.challengeId)])).rows[0].id;
      for (let i = 1; i < 5; i++) {
        await pool.query("UPDATE otp_challenges SET created_at=created_at-interval '61 seconds' WHERE phone_hash=(SELECT phone_hash FROM otp_challenges WHERE id=$1)", [first]);
        await service.request(phone, i % 2 ? otherIp : ip);
      }
      assert.equal(deliveries.length, 5);
      assert.equal(await service.consume(first, phone, deliveries[0].code, ip), false);
      await pool.query("UPDATE otp_challenges SET created_at=created_at-interval '61 seconds' WHERE id=$1", [(await pool.query("SELECT id FROM otp_challenges WHERE status='sent' AND phone_hash=(SELECT phone_hash FROM otp_challenges WHERE id=$1)", [first])).rows[0].id]);
      await service.request(phone, otherIp);
      assert.equal(deliveries.length, 5, 'Changing IP cannot bypass the identity hourly cap');
    }));
    await t.test('IP send budget spans identities and verification budget spans unknown challenges', async () => fixture(async (service, crypto, deliveries) => {
      await Promise.all(Array.from({ length: 35 }, (_, i) => service.request(`+98912${String(i).padStart(7, '0')}`, ip)));
      assert.equal(deliveries.length, 30);
      const active = (await pool.query("SELECT id FROM otp_challenges WHERE phone_hash=$1 AND status='sent'", [crypto.fingerprint('phone', deliveries[0].destination)])).rows[0].id;
      for (let i = 0; i < 20; i++) assert.equal(await service.consume(randomUUID(), phone, '000000', ip), false);
      assert.equal(await service.consume(active, deliveries[0].destination, deliveries[0].code, '::ffff:192.0.2.1'), false);
      await pool.query("UPDATE otp_verification_limits SET window_started_at=clock_timestamp()-interval '6 minutes' WHERE ip_hash=$1", [crypto.fingerprint('ip', ip)]);
      assert.equal(await service.consume(active, deliveries[0].destination, deliveries[0].code, ip), true);
    }));
    await t.test('failed provider never makes a challenge verifiable and still consumes cooldown', async () => fixture(async (service, _crypto, deliveries) => {
      const receipt = await service.request(phone, ip);
      assert.equal((await pool.query('SELECT status FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rows[0].status, 'failed');
      assert.equal(await service.consume(receipt.challengeId, phone, '000000', ip), false);
      const throttled = await service.request(phone, ip);
      assert.equal((await pool.query('SELECT id FROM otp_challenges WHERE id=$1', [throttled.challengeId])).rowCount, 0);
      assert.equal(deliveries.length, 0);
    }, true));
    await t.test('pending delivery is unusable and late success cannot resurrect a superseded challenge', async () => fixture(async (_service, crypto, deliveries) => {
      let release!: () => void;
      let started!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { started = resolve; });
      const delayed = new OtpChallengeService(pool, crypto, { enabled: true, async send(input) {
        deliveries.push(input);
        started();
        await gate;
      } });
      const pending = delayed.request(phone, ip);
      try {
        await entered;
        const first = (await pool.query('SELECT id FROM otp_challenges WHERE phone_hash=$1', [crypto.fingerprint('phone', phone)])).rows[0].id;
        assert.equal(await delayed.consume(first, phone, deliveries[0].code, ip), false);
        await pool.query("UPDATE otp_challenges SET created_at=created_at-interval '61 seconds' WHERE id=$1", [first]);
        const next = await new OtpChallengeService(pool, crypto, { enabled: true, async send(input) { deliveries.push(input); } }).request(phone, ip);
        release();
        await pending;
        assert.equal(await delayed.consume(first, phone, deliveries[0].code, ip), false);
        assert.equal(await delayed.consume(next.challengeId, phone, deliveries[1].code, ip), true);
      } finally { release(); await pending; }
    }));
  } finally { await pool.end(); }
});
