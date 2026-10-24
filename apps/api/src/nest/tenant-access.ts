import { createHash } from 'node:crypto';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { identityTransaction } from './identity-transaction.js';
import { normalizePersian } from './normalization.js';

/** Runtime pool must use a separately provisioned non-owner login, never migration credentials. */
export async function validateRuntimePool(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolinherit)
    AND current_user=session_user
    AND pg_has_role(session_user,'ghahvehto_identity','MEMBER')
    AND pg_has_role(session_user,'ghahvehto_app','MEMBER')
    AND NOT pg_has_role(session_user,'ghahvehto_identity','USAGE')
    AND NOT pg_has_role(session_user,'ghahvehto_app','USAGE')
    AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('users','sessions','cafes') AND pg_has_role(session_user,relowner,'MEMBER')) AS allowed
    FROM pg_roles r WHERE rolname=session_user`);
  if (!result.rows[0]?.allowed) throw new Error('Restricted identity runtime database login required');
}

export class TenantAccessService {
  constructor(private readonly pool: Pool) {}
  readCafe(token: string, cafeId: string): Promise<{ cafeId: string; name: string }> {
    return this.scoped(token, async client => {
      const result = await client.query('SELECT id AS "cafeId",name FROM cafes WHERE id=$1', [cafeId]);
      if (!result.rowCount) throw new NotFoundException();
      return result.rows[0];
    });
  }
  readBranch(token: string, cafeId: string, branchId: string): Promise<{ branchId: string; cafeId: string; name: string }> {
    return this.scoped(token, async client => {
      const result = await client.query('SELECT id AS "branchId",cafe_id AS "cafeId",name FROM branches WHERE id=$1 AND cafe_id=$2', [branchId, cafeId]);
      if (!result.rowCount) throw new NotFoundException();
      return result.rows[0];
    });
  }
  updateCafe(token: string, cafeId: string, name: string): Promise<{ cafeId: string; name: string }> {
    return this.scoped(token, async (client, userId) => {
      const result = await client.query('UPDATE cafes SET name=$2,normalized_name=$3 WHERE id=$1 RETURNING id AS "cafeId",name', [cafeId, name, normalizePersian(name)]);
      if (!result.rowCount) throw new NotFoundException();
      await client.query("INSERT INTO audit_events(actor_id,cafe_id,action,reason) VALUES($1,$2,'cafe.profile_updated','Owner updated café profile')", [userId, cafeId]);
      return result.rows[0];
    });
  }
  private async scoped<T>(token: string, operation: (client: PoolClient, userId: string) => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    return identityTransaction(this.pool, async client => {
      const digest = createHash('sha256').update(token).digest();
      const family = await client.query('SELECT family_id FROM sessions WHERE access_token_hash=$1', [digest]);
      if (!family.rowCount) throw new UnauthorizedException();
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`session:${family.rows[0].family_id}`]);
      const identity = await client.query(`SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.access_token_hash=$1 AND s.revoked_at IS NULL AND s.replaced_by IS NULL
        AND u.deleted_at IS NULL AND u.phone_verified_at IS NOT NULL FOR SHARE OF s,u`, [digest]);
      if (!identity.rowCount) throw new UnauthorizedException();
      const fresh = await client.query(`SELECT 1 FROM sessions WHERE access_token_hash=$1
        AND access_expires_at > clock_timestamp() AND expires_at > clock_timestamp()`, [digest]);
      if (!fresh.rowCount) throw new UnauthorizedException();
      const userId = identity.rows[0].user_id;
      await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
      await client.query('SET LOCAL ROLE ghahvehto_app');
      return operation(client, userId);
    });
  }
}
