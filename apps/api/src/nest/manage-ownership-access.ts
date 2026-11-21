import pg from 'pg';

async function run() {
  const connectionString = process.env.OWNERSHIP_ACCESS_DATABASE_URL;
  if (!connectionString) throw new Error('Missing ownership reviewer configuration');
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2048) throw new Error('Invalid review document');
  }
  const value = JSON.parse(input);
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      typeof value.claimId !== 'string' || !uuid.test(value.claimId) ||
      typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 240 ||
      !['grant','revoke'].includes(value.operation)) throw new Error('Invalid review document');
  const pool = new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghahvehto_ownership_access');
      const {rows:[row]} = await client.query('SELECT public.change_ownership_access($1,$2,$3) AS id',
        [value.claimId,value.operation,value.reason]);
      await client.query('COMMIT');
      console.log(JSON.stringify({grantId:row.id}));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
run().catch((error:unknown) => {
  const conflict = error && typeof error === 'object' && 'code' in error && error.code === '40001';
  console.error(conflict ? 'Ownership access conflicts with the current state.' : 'Ownership access change failed. Check the claim and operator configuration.');
  process.exitCode = 1;
});
