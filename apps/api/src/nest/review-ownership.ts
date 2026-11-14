import pg from 'pg';

async function run() {
  const connectionString = process.env.OWNERSHIP_REVIEW_DATABASE_URL;
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
      typeof value.evidenceCaseId !== 'string' || !uuid.test(value.evidenceCaseId) ||
      !['verified','rejected'].includes(value.decision)) throw new Error('Invalid review document');
  const pool = new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghahvehto_ownership_review');
      const {rows:[row]} = await client.query('SELECT public.review_ownership_claim($1,$2,$3) AS decision',
        [value.claimId,value.decision,value.evidenceCaseId]);
      await client.query('COMMIT');
      console.log(JSON.stringify({decision:row.decision}));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
run().catch((error:unknown) => {
  const conflict = error && typeof error === 'object' && 'code' in error && error.code === '40001';
  console.error(conflict ? 'The claim is no longer open.' : 'Ownership review failed. Check the request, evidence reference and reviewer configuration.');
  process.exitCode = 1;
});
