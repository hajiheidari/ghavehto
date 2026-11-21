import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DisabledOtpProvider, OtpCrypto, type OtpProvider } from './otp.js';
import { normalizeIranMobile } from './normalization.js';
import { identityTransaction } from './identity-transaction.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Internal only: not registered in Nest, not a login endpoint or session issuer.
 * IP must come from a trusted transport boundary, never arbitrary forwarded headers.
 */
export class OtpChallengeService {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: OtpCrypto,
    private readonly provider: OtpProvider = new DisabledOtpProvider(),
    private readonly deliveryTimeoutMs = 5000,
  ) {
    if (!Number.isInteger(deliveryTimeoutMs) || deliveryTimeoutMs < 1 || deliveryTimeoutMs > 30_000) throw new Error('Invalid delivery timeout');
  }

  async request(destination: string, clientIp: string): Promise<{ challengeId: string }> {
    // Fail before any DB write or code generation when sending is not approved.
    if (!this.provider.enabled) throw new Error('OTP delivery is disabled');
    const phone = normalizeIranMobile(destination);
    const phoneHash = this.crypto.fingerprint('phone', phone);
    const ipHash = this.crypto.fingerprint('ip', clientIp);
    const challengeId = randomUUID();
    const code = this.crypto.generateCode();
    const reserved = await this.transaction(async client => {
      // Fixed lock order; identity and IP quotas span every pending/failed/sent challenge.
      await this.lock(client, `phone:${phoneHash.toString('hex')}`);
      await this.lock(client, `ip:${ipHash.toString('hex')}`);
      const now = (await client.query('SELECT clock_timestamp() AS instant')).rows[0].instant as Date;
      const quota = await client.query(`SELECT
        (SELECT count(*)::int FROM otp_challenges WHERE phone_hash=$1 AND created_at > $3::timestamptz-interval '1 hour') AS phone_count,
        (SELECT count(*)::int FROM otp_challenges WHERE ip_hash=$2 AND created_at > $3::timestamptz-interval '1 hour') AS ip_count,
        EXISTS(SELECT 1 FROM otp_challenges WHERE phone_hash=$1 AND created_at > $3::timestamptz-interval '60 seconds') AS cooling`,
      [phoneHash, ipHash, now]);
      const limits = quota.rows[0];
      if (limits.phone_count >= 5 || limits.ip_count >= 30 || limits.cooling) return false;
      await client.query("UPDATE otp_challenges SET status='superseded' WHERE phone_hash=$1 AND status IN ('pending','sent')", [phoneHash]);
      await client.query(`INSERT INTO otp_challenges(id,phone_hash,ip_hash,code_digest,status,created_at,expires_at)
        VALUES($1,$2,$3,$4,'pending',$5,$5::timestamptz+interval '5 minutes')`,
      [challengeId, phoneHash, ipHash, this.crypto.digest(challengeId, phone, code), now]);
      return true;
    });
    // Same opaque receipt for throttled requests; no account lookup or enumeration.
    if (!reserved) return { challengeId };
    const cancellation = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.provider.send({ destination: phone, code, signal: cancellation.signal }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { cancellation.abort(); reject(new Error('Delivery deadline')); }, this.deliveryTimeoutMs); }),
      ]);
      await this.transaction(client => client.query(`UPDATE otp_challenges SET status='sent'
        WHERE id=$1 AND status='pending' AND expires_at > clock_timestamp()`, [challengeId]));
    } catch {
      // Provider errors can contain PII/credentials; never propagate or persist them.
      await this.transaction(client => client.query("UPDATE otp_challenges SET status='failed' WHERE id=$1 AND status='pending'", [challengeId]));
    } finally { if (timer) clearTimeout(timer); }
    return { challengeId };
  }

  async consume(challengeId: string, destination: string, code: string, clientIp: string): Promise<boolean> {
    return (await this.complete(challengeId, destination, code, clientIp, async () => true)) === true;
  }

  /** Trusted composition only: callback and OTP consumption share the same transaction. */
  async complete<T>(challengeId: string, destination: string, code: string, clientIp: string,
    verified: (client: PoolClient, normalizedPhone: string) => Promise<T>): Promise<T | null> {
    if (!uuid.test(challengeId)) return null;
    const phone = normalizeIranMobile(destination);
    const phoneHash = this.crypto.fingerprint('phone', phone);
    const ipHash = this.crypto.fingerprint('ip', clientIp);
    return this.transaction(async client => {
      await this.lock(client, `ip:${ipHash.toString('hex')}`);
      const now = (await client.query('SELECT clock_timestamp() AS instant')).rows[0].instant as Date;
      const budget = await client.query(`INSERT INTO otp_verification_limits(ip_hash,window_started_at,attempts)
        VALUES($1,$2,1) ON CONFLICT(ip_hash) DO UPDATE SET
        window_started_at=CASE WHEN otp_verification_limits.window_started_at <= $2::timestamptz-interval '5 minutes' THEN $2 ELSE otp_verification_limits.window_started_at END,
        attempts=CASE WHEN otp_verification_limits.window_started_at <= $2::timestamptz-interval '5 minutes' THEN 1 ELSE otp_verification_limits.attempts+1 END
        WHERE otp_verification_limits.window_started_at <= $2::timestamptz-interval '5 minutes' OR otp_verification_limits.attempts < 20
        RETURNING attempts`, [ipHash, now]);
      if (!budget.rowCount) return null;
      const result = await client.query('SELECT * FROM otp_challenges WHERE id=$1 AND phone_hash=$2 FOR UPDATE', [challengeId, phoneHash]);
      const challenge = result.rows[0];
      // A competing consumer can hold the row lock; re-check expiry after waiting.
      const checkedAt = (await client.query('SELECT clock_timestamp() AS instant')).rows[0].instant as Date;
      if (!challenge || challenge.status !== 'sent' || challenge.expires_at <= checkedAt || challenge.attempts >= 5) return null;
      const valid = this.crypto.matches(challengeId, phone, code, challenge.code_digest);
      await client.query(`UPDATE otp_challenges SET attempts=attempts+1,
        status=CASE WHEN $2 THEN 'consumed' ELSE status END,
        consumed_at=CASE WHEN $2 THEN $3::timestamptz ELSE NULL END WHERE id=$1`, [challengeId, valid, checkedAt]);
      return valid ? verified(client, phone) : null;
    });
  }

  private async lock(client: PoolClient, scope: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`otp:${scope}`]);
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    return identityTransaction(this.pool, operation);
  }
}
