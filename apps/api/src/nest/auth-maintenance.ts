import type { Pool } from 'pg';
import { identityTransaction } from './identity-transaction.js';

export async function pruneExpiredOtp(pool: Pool): Promise<{ challengesDeleted: number; verificationWindowsDeleted: number }> {
  return identityTransaction(pool, async client => {
    const result = await client.query('SELECT * FROM public.prune_expired_otp()');
    return { challengesDeleted: result.rows[0].challenges_deleted, verificationWindowsDeleted: result.rows[0].verification_windows_deleted };
  });
}
