import pg from 'pg';
import { migrate } from './migrations.js';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try { await migrate(pool); console.log('Database migrations applied'); }
finally { await pool.end(); }
