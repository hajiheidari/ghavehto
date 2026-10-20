import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ghahvehto:migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    let root = dirname(fileURLToPath(import.meta.url));
    while (!existsSync(join(root, 'pnpm-workspace.yaml'))) {
      const parent = dirname(root);
      if (parent === root) throw new Error('Workspace migration directory not found');
      root = parent;
    }
    const sql = await readFile(join(root, 'infra/migrations/001_foundation.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', ['001_foundation']);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration checksum mismatch');
    } else {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', ['001_foundation', checksum]);
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
