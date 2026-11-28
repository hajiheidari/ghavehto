import pg from 'pg';

async function run() {
  const connectionString = process.env.DIRECTORY_REVIEW_DATABASE_URL;
  if (!connectionString) throw new Error('Missing operator database configuration');
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw new Error('Review document is too large');
  }
  const value = JSON.parse(input);
  if (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).some(key => !['branchId','expectedRevision','decision','reason','sourceId','listing'].includes(key)) ||
      typeof value.branchId !== 'string' || !Number.isSafeInteger(value.expectedRevision) ||
      !['publish','withdraw'].includes(value.decision) || typeof value.reason !== 'string') {
    throw new Error('Invalid review document');
  }
  const pool = new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghahvehto_directory_review');
      const {rows:[row]} = await client.query(
        'SELECT public.review_directory_listing($1,$2,$3,$4,$5,$6) AS revision',
        [value.branchId,value.expectedRevision,value.decision,value.reason,value.sourceId ?? null,
          value.listing == null ? null : JSON.stringify(value.listing)]);
      await client.query('COMMIT');
      console.log(JSON.stringify({revision:row.revision}));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}

run().catch((error:unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? error.code : null;
  console.error(code === '40001' ? 'Review conflict: read the current listing revision and try again.' :
    'Directory review failed. Check the input, source permission and operator database configuration.');
  process.exitCode = 1;
});
