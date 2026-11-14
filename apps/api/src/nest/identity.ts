import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { OtpChallengeService } from './otp-challenges.js';
import { PhoneVault } from './phone-vault.js';
import { SessionService, type SessionTokens } from './sessions.js';

/** No HTTP issuance route. Phone possession never grants a café/admin membership. */
export class IdentityService {
  private readonly sessions: SessionService;
  constructor(pool: Pool, private readonly otp: OtpChallengeService, private readonly vault: PhoneVault) {
    this.sessions = new SessionService(pool);
  }
  async verify(challengeId: string, destination: string, code: string, clientIp: string): Promise<{ userId: string; tokens: SessionTokens } | null> {
    return this.otp.complete(challengeId, destination, code, clientIp, async (client, phone) => {
      const lookup = this.vault.lookup(phone);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`identity:${lookup.toString('hex')}`]);
      const found = await client.query('SELECT id,deleted_at FROM users WHERE phone_hash=$1 FOR UPDATE', [lookup]);
      const existing = found.rows[0];
      if (existing?.deleted_at) {
        await client.query("INSERT INTO audit_events(actor_id,action,reason) VALUES($1,'identity.deleted_denied','Deleted identity cannot be reactivated by OTP')", [existing.id]);
        return null;
      }
      const userId = existing?.id ?? randomUUID();
      const encrypted = this.vault.seal(userId, phone);
      if (existing) {
        await client.query('UPDATE users SET phone_verified_at=coalesce(phone_verified_at,clock_timestamp()),phone_ciphertext=$2 WHERE id=$1', [userId, encrypted]);
      } else {
        await client.query('INSERT INTO users(id,phone_hash,phone_ciphertext,phone_verified_at) VALUES($1,$2,$3,clock_timestamp())', [userId, lookup, encrypted]);
      }
      await client.query('INSERT INTO audit_events(actor_id,action,reason) VALUES($1,$2,$3)', [userId, existing ? 'identity.verified' : 'identity.created', 'Phone verified by a single-use server challenge']);
      const tokens = await this.sessions.issueInTransaction(client, userId);
      return { userId, tokens };
    });
  }
}
