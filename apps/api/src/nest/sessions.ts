import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type SessionTokens = {
  accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string;
};
export type SessionIdentity = { userId: string; sessionId: string };
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
const hash = (token: string) => createHash('sha256').update(token).digest();

/** Internal service. No HTTP issuance endpoint exists until phone verification is implemented. */
export class SessionService {
  constructor(private readonly pool: Pool) {}

  async issue(userId: string): Promise<SessionTokens> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE id=$1 AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE', [userId]);
      if (!user.rowCount) throw new Error('Verified active user required');
      const tokens = await this.insert(client,userId,randomUUID());
      await client.query('INSERT INTO audit_events(actor_id,action,reason) VALUES($1,$2,$3)',[userId,'session.issued','Verified identity issued a server session']);
      await client.query('COMMIT');
      return tokens;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async authenticate(accessToken: string): Promise<SessionIdentity | null> {
    if (!validToken(accessToken)) return null;
    const result = await this.pool.query(`SELECT s.id AS session_id,s.user_id FROM sessions s
      JOIN users u ON u.id=s.user_id
      WHERE s.access_token_hash=$1 AND s.revoked_at IS NULL AND s.replaced_by IS NULL
      AND s.access_expires_at > now() AND s.expires_at > now()
      AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL`, [hash(accessToken)]);
    return result.rowCount ? { userId:result.rows[0].user_id,sessionId:result.rows[0].session_id } : null;
  }

  async rotate(refreshToken: string): Promise<SessionTokens | null> {
    if (!validToken(refreshToken)) return null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const family = await client.query('SELECT family_id FROM sessions WHERE refresh_token_hash=$1',[hash(refreshToken)]);
      if (!family.rowCount) { await client.query('COMMIT'); return null; }
      // Serialize the whole family so replay/logout cannot miss a concurrently inserted descendant.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`session:${family.rows[0].family_id}`]);
      const result = await client.query(`SELECT s.*,now() AS db_now,u.deleted_at,u.phone_verified_at
        FROM sessions s JOIN users u ON u.id=s.user_id WHERE refresh_token_hash=$1 FOR UPDATE OF s`, [hash(refreshToken)]);
      if (!result.rowCount) { await client.query('COMMIT'); return null; }
      const session = result.rows[0];
      if (session.revoked_at || session.replaced_by || session.expires_at <= session.db_now || session.deleted_at || !session.phone_verified_at) {
        // Replay revokes the entire family, including a successfully rotated descendant.
        await client.query('UPDATE sessions SET revoked_at=coalesce(revoked_at,now()) WHERE family_id=$1', [session.family_id]);
        await client.query('INSERT INTO audit_events(actor_id,action,reason) VALUES($1,$2,$3)',[session.user_id,'session.family_revoked','Refresh reuse or invalid identity/session state']);
        await client.query('COMMIT');
        return null;
      }
      const nextId = randomUUID();
      const tokens = await this.insert(client,session.user_id,session.family_id,session.expires_at,nextId);
      await client.query('UPDATE sessions SET revoked_at=now(),replaced_by=$2 WHERE id=$1',[session.id,nextId]);
      await client.query('INSERT INTO audit_events(actor_id,action,reason) VALUES($1,$2,$3)',[session.user_id,'session.rotated','Refresh token rotated with previous credentials revoked']);
      await client.query('COMMIT');
      return tokens;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async revoke(accessToken: string): Promise<void> {
    if (!validToken(accessToken)) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT family_id,user_id FROM sessions WHERE access_token_hash=$1',[hash(accessToken)]);
      if (result.rowCount) {
        const family = result.rows[0].family_id;
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`session:${family}`]);
        await client.query('UPDATE sessions SET revoked_at=coalesce(revoked_at,now()) WHERE family_id=$1',[family]);
        await client.query('INSERT INTO audit_events(actor_id,action,reason) VALUES($1,$2,$3)',[result.rows[0].user_id,'session.revoked','Authenticated session family logout']);
      }
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async insert(client: PoolClient,userId: string,familyId: string,refreshExpiry?: Date,id=randomUUID()): Promise<SessionTokens> {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const result = await client.query(`INSERT INTO sessions(id,user_id,family_id,refresh_token_hash,access_token_hash,access_expires_at,expires_at)
      VALUES($1,$2,$3,$4,$5,least(now()+interval '15 minutes',coalesce($6::timestamptz,now()+interval '30 days')),coalesce($6::timestamptz,now()+interval '30 days'))
      RETURNING access_expires_at,expires_at`, [id,userId,familyId,hash(refreshToken),hash(accessToken),refreshExpiry ?? null]);
    return { accessToken,refreshToken,accessExpiresAt:result.rows[0].access_expires_at.toISOString(),refreshExpiresAt:result.rows[0].expires_at.toISOString() };
  }
}
