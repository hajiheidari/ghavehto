import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

async function definitions(): Promise<{ version: string; sql: string; checksum: string }[]> {
  let root = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(root, 'pnpm-workspace.yaml'))) {
    const parent = dirname(root);
    if (parent === root) throw new Error('Workspace migration directory not found');
    root = parent;
  }
  const folder = join(root, 'infra/migrations');
  const files = (await readdir(folder)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(files.map(async file => {
    const sql = await readFile(join(folder, file), 'utf8');
    return { version: file.slice(0, -4), sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

export async function schemaReady(client: PoolClient): Promise<boolean> {
  const expected = await definitions();
  const installed = new Map((await client.query('SELECT version,checksum FROM schema_migrations')).rows.map(row => [row.version, row.checksum]));
  return expected.every(migration => installed.get(migration.version) === migration.checksum);
}

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ghahvehto:migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const { version, sql, checksum } of await definitions()) {
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',[version]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum mismatch: ${version}`);
      } else {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
      }
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
