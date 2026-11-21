import pg from 'pg';
import { pruneExpiredOtp } from './auth-maintenance.js';
import { validateRuntimePool } from './tenant-access.js';

if (!process.env.IDENTITY_DATABASE_URL) throw new Error('Restricted identity database URL required');
const pool = new pg.Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 });
try { await validateRuntimePool(pool); console.log(JSON.stringify(await pruneExpiredOtp(pool))); }
finally { await pool.end(); }
