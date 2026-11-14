import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/nest/migrations.js';
import { OtpCrypto } from '../src/nest/otp.js';
import { OtpChallengeService } from '../src/nest/otp-challenges.js';
import { pruneExpiredOtp } from '../src/nest/auth-maintenance.js';
import { identityTransaction } from '../src/nest/identity-transaction.js';

test('provider deadline and bounded retention preserve live OTP safeguards', async () => {
  assert.ok(process.env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const crypto = new OtpCrypto(randomBytes(32));
  const phone = '+989120000004', otherPhone = '+989120000005', ip = '192.0.2.30';
  let resume!: () => void, capturedCode = '', signal: AbortSignal | undefined;
  const pending = new Promise<void>(resolve => { resume = resolve; });
  try {
    await migrate(pool);
    const delayed = new OtpChallengeService(pool, crypto, { enabled: true, async send(input) {
      capturedCode = input.code; signal = input.signal; await pending;
    } }, 20);
    const receipt = await delayed.request(phone, ip);
    assert.equal(signal?.aborted, true);
    assert.equal((await pool.query('SELECT status FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rows[0].status, 'failed');
    resume();
    assert.equal(await delayed.consume(receipt.challengeId, phone, capturedCode, ip), false, 'Late delivery cannot revive timed-out credentials');
    await pool.query("UPDATE otp_challenges SET created_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '24 hours' WHERE id=$1", [receipt.challengeId]);
    const live = new OtpChallengeService(pool, crypto, { enabled: true, async send(input) { capturedCode = input.code; } });
    const fresh = await live.request(otherPhone, ip);
    await live.consume(randomUUID(), otherPhone, '000000', ip);
    await pool.query("UPDATE otp_verification_limits SET window_started_at=clock_timestamp()-interval '25 hours' WHERE ip_hash=$1", [crypto.fingerprint('ip', ip)]);
    const result = await pruneExpiredOtp(pool);
    assert.ok(result.challengesDeleted >= 1); assert.ok(result.verificationWindowsDeleted >= 1);
    assert.equal((await pool.query('SELECT id FROM otp_challenges WHERE id=$1', [receipt.challengeId])).rowCount, 0);
    assert.equal(await live.consume(fresh.challengeId, otherPhone, capturedCode, ip), true, 'Unexpired credentials survive cleanup');
    await assert.rejects(identityTransaction(pool, client => client.query('DELETE FROM otp_challenges')), {code:'42501'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE ghahvehto_app');
      await assert.rejects(client.query('SELECT * FROM public.prune_expired_otp()'), {code:'42501'});
    } finally { await client.query('ROLLBACK'); client.release(); }
  } finally {
    resume();
    await pool.query('DELETE FROM otp_challenges WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
    await pool.query('DELETE FROM otp_verification_limits WHERE ip_hash=$1', [crypto.fingerprint('ip', ip)]);
    await pool.end();
  }
});
